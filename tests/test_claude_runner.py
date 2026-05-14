"""Tests for ``clau_decode.claude_runner.ClaudeCodeRunner``.

Binary injection strategy
-------------------------
The runner spawns ``bin_name`` via ``asyncio.create_subprocess_exec``,
which on POSIX falls through to ``execvp`` — so a bare name is
resolved via ``$PATH``. Each test (or fixture) creates a tmp directory
holding a tiny shim script named ``claude`` whose body is
``exec python3 <repo>/tests/fixtures/fake_claude.py "$@"``, marks it
executable, and prepends the dir to ``$PATH``. The runner then
spawns the fake without knowing the difference.

This is the simplest injection we can do without touching the runner's
``bin_name`` resolution code, and it keeps the spawn signature
identical to what production uses.
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import stat
import time
from pathlib import Path
from typing import Iterator

import pytest

from clau_decode import claude_runner as cr_mod
from clau_decode.claude_runner import ClaudeCodeRunner

FAKE = Path(__file__).parent / "fixtures" / "fake_claude.py"


# ---------------------------------------------------------------------------
# Shim helpers
# ---------------------------------------------------------------------------


def _write_shim(dir_: Path, bin_name: str = "claude", extra_argv: str = "") -> Path:
    """Create an executable shim that execs ``fake_claude.py`` with extra args."""
    path = dir_ / bin_name
    body = (
        "#!/usr/bin/env bash\n"
        f'exec {shutil.which("python3") or "python3"} "{FAKE}" {extra_argv} "$@"\n'
    )
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return path


@pytest.fixture
def shim_path(monkeypatch, tmp_path) -> Iterator[Path]:
    """Default shim: behaves like the fake with --echo."""
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_shim(bin_dir)
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")
    yield bin_dir


@pytest.fixture
async def runner() -> ClaudeCodeRunner:
    r = ClaudeCodeRunner()
    try:
        yield r
    finally:
        await r.shutdown()


async def _await_session_done(
    runner: ClaudeCodeRunner, sid: str, *, timeout: float = 5.0
) -> None:
    """Block until the runner reports the session is no longer busy."""
    deadline = time.monotonic() + timeout
    while runner.is_busy(sid):
        if time.monotonic() > deadline:
            raise AssertionError(f"session {sid} still busy after {timeout}s")
        await asyncio.sleep(0.01)


# ---------------------------------------------------------------------------
# Unknown-slash pattern detection (drives auto-fallback)
# ---------------------------------------------------------------------------


def test_unknown_slash_pattern_detection():
    from clau_decode.claude_runner import _looks_like_unknown_slash

    # zai/claude synthetic rejection phrases
    assert _looks_like_unknown_slash("/btw isn't available in this environment.")
    assert _looks_like_unknown_slash("/foo is not available in this environment.")
    assert _looks_like_unknown_slash("Unknown command: /xyz")
    assert _looks_like_unknown_slash("unknown slash command")
    assert _looks_like_unknown_slash("Command not found")
    # Must not match real model responses
    assert not _looks_like_unknown_slash("Sure, I'll help with that.")
    assert not _looks_like_unknown_slash("Here is the diff you asked for.")
    assert not _looks_like_unknown_slash("")


# ---------------------------------------------------------------------------
# Submit path / basic plumbing
# ---------------------------------------------------------------------------


async def test_submit_writes_ndjson_to_stdin(shim_path, runner, tmp_path):
    """The runner writes a single NDJSON line in the documented shape."""
    capture = tmp_path / "stdin.log"
    # Use env var so the shim picks up the flag without us hand-rolling argv.
    bin_dir = tmp_path / "bin2"
    bin_dir.mkdir()
    _write_shim(bin_dir, extra_argv=f"--capture-stdin {capture}")
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

    await runner.submit(
        "sess-A",
        cwd=str(tmp_path),
        bin_name="claude",
        text="hello world",
        permission_mode="dontAsk",
    )
    await _await_session_done(runner, "sess-A")

    raw = capture.read_text().splitlines()
    assert len(raw) == 1
    obj = json.loads(raw[0])
    assert obj["type"] == "user"
    assert obj["message"]["role"] == "user"
    assert obj["message"]["content"] == [{"type": "text", "text": "hello world"}]


async def test_submit_is_busy_during_turn(shim_path, runner, tmp_path):
    """is_busy is True while the subprocess lives, False once it exits."""
    # --slow makes the proc stay alive long enough for us to observe.
    bin_dir = tmp_path / "bin_slow"
    bin_dir.mkdir()
    _write_shim(bin_dir, extra_argv="--slow 0.3")
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

    await runner.submit(
        "sess-busy",
        cwd=str(tmp_path),
        bin_name="claude",
        text="hi",
        permission_mode="dontAsk",
    )
    assert runner.is_busy("sess-busy") is True
    await _await_session_done(runner, "sess-busy", timeout=5.0)
    assert runner.is_busy("sess-busy") is False


async def test_concurrent_submits_serialize(shim_path, runner, tmp_path):
    """Two submits on the same session_id must not overlap (per-session lock)."""
    bin_dir = tmp_path / "bin_slow"
    bin_dir.mkdir()
    _write_shim(bin_dir, extra_argv="--slow 0.2")
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

    await runner.submit(
        "sess-X",
        cwd=str(tmp_path),
        bin_name="claude",
        text="first",
        permission_mode="dontAsk",
    )
    # While still busy, a second submit on the same session must raise.
    assert runner.is_busy("sess-X")
    with pytest.raises(RuntimeError, match="busy"):
        await runner.submit(
            "sess-X",
            cwd=str(tmp_path),
            bin_name="claude",
            text="second",
            permission_mode="dontAsk",
        )
    await _await_session_done(runner, "sess-X")
    # After completion a fresh submit succeeds.
    await runner.submit(
        "sess-X",
        cwd=str(tmp_path),
        bin_name="claude",
        text="third",
        permission_mode="dontAsk",
    )
    await _await_session_done(runner, "sess-X")


async def test_concurrent_submits_parallel_across_sessions(shim_path, runner, tmp_path):
    """Different session_ids run in parallel (no global lock)."""
    bin_dir = tmp_path / "bin_slow"
    bin_dir.mkdir()
    _write_shim(bin_dir, extra_argv="--slow 0.3")
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

    # Stronger signal than wall-clock: assert both procs are alive at the
    # same moment. Wall-clock comparisons are flaky under coverage + cold
    # Python interpreter startup (each fake_claude subprocess pays an
    # ~80–150ms tax).
    await runner.submit(
        "sess-1",
        cwd=str(tmp_path),
        bin_name="claude",
        text="a",
        permission_mode="dontAsk",
    )
    await runner.submit(
        "sess-2",
        cwd=str(tmp_path),
        bin_name="claude",
        text="b",
        permission_mode="dontAsk",
    )
    assert runner.is_busy("sess-1") and runner.is_busy("sess-2"), (
        "both sessions should be live in parallel after sequential submits"
    )
    t0 = time.monotonic()
    await _await_session_done(runner, "sess-1", timeout=5.0)
    await _await_session_done(runner, "sess-2", timeout=5.0)
    # Once both are running, joining them in sequence should take at most
    # one --slow window worth of time (plus drain + plugin-discovery
    # overhead), not two — that's the parallel guarantee. The threshold
    # accommodates real per-spawn overhead (plugin discovery reads disk)
    # which fluctuates under heavy test load.
    elapsed = time.monotonic() - t0
    assert elapsed < 1.0, f"expected near-simultaneous completion, took {elapsed:.2f}s"


# ---------------------------------------------------------------------------
# Lifecycle: stop / shutdown
# ---------------------------------------------------------------------------


async def test_stop_terminates_inflight_turn(shim_path, runner, tmp_path):
    """stop() SIGINTs an active subprocess; is_busy goes False."""
    bin_dir = tmp_path / "bin_slow"
    bin_dir.mkdir()
    _write_shim(bin_dir, extra_argv="--slow 30")  # would run far longer than the test
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

    await runner.submit(
        "sess-stop",
        cwd=str(tmp_path),
        bin_name="claude",
        text="hi",
        permission_mode="dontAsk",
    )
    assert runner.is_busy("sess-stop")
    stopped = await runner.stop("sess-stop")
    assert stopped is True
    await _await_session_done(runner, "sess-stop", timeout=5.0)
    assert runner.is_busy("sess-stop") is False


async def test_shutdown_cleans_all(shim_path, tmp_path):
    """runner.shutdown() reaps every active subprocess."""
    bin_dir = tmp_path / "bin_slow"
    bin_dir.mkdir()
    _write_shim(bin_dir, extra_argv="--slow 30")
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

    r = ClaudeCodeRunner()
    await r.submit(
        "s-a", cwd=str(tmp_path), bin_name="claude", text="a", permission_mode="dontAsk"
    )
    await r.submit(
        "s-b", cwd=str(tmp_path), bin_name="claude", text="b", permission_mode="dontAsk"
    )
    assert r.is_busy("s-a") and r.is_busy("s-b")
    await r.shutdown()
    assert r.is_busy("s-a") is False
    assert r.is_busy("s-b") is False


# ---------------------------------------------------------------------------
# Stdout drain robustness
# ---------------------------------------------------------------------------


async def test_stdout_drain_doesnt_block_on_long_output(shim_path, runner, tmp_path):
    """Long stream-json output doesn't deadlock the runner."""
    # Emit ~1000 lines, each padded to ~10KB → ~10MB total. Realistic for
    # stream-json (one event per partial-message delta during a long turn).
    bin_dir = tmp_path / "bin_burst"
    bin_dir.mkdir()
    _write_shim(bin_dir, extra_argv="--burst 1000 --bytes 10240")
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

    await runner.submit(
        "sess-long",
        cwd=str(tmp_path),
        bin_name="claude",
        text="hi",
        permission_mode="dontAsk",
    )
    # If the drain blocked, the proc would never exit — give it 10s.
    await _await_session_done(runner, "sess-long", timeout=10.0)


# ---------------------------------------------------------------------------
# Quiet-turn watchdog
# ---------------------------------------------------------------------------


async def test_quiet_age_tracks_last_stdout_line(shim_path, runner, tmp_path):
    """quiet_age resets whenever a new stdout line arrives."""
    # Emit 3 pulse lines with 0.15s between → quiet_age stays small during
    # the pulse, then grows after the last pulse line.
    bin_dir = tmp_path / "bin_pulse"
    bin_dir.mkdir()
    # Pulse for ~0.45s, then sleep 5.0s in --slow so the proc is reliably alive
    # for the entire quiet-age observation regardless of interpreter cold-start.
    _write_shim(bin_dir, extra_argv="--pulse 0.15 3 --slow 5.0 --silent")
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

    await runner.submit(
        "sess-q",
        cwd=str(tmp_path),
        bin_name="claude",
        text="hi",
        permission_mode="default",
    )
    # Wait long enough that even with a slow cold-start, the pulse has
    # finished and we're well into the quiet --slow phase.
    await asyncio.sleep(2.5)
    snap2 = runner.status_snapshot("sess-q")
    assert snap2["busy"] is True, "proc exited before quiet phase could be observed"
    assert snap2["quiet_age_seconds"] is not None
    # quiet_age = (now - last_pulse_emit). With pulse done at ~0.45s after
    # Python ready and now ~2.5s after submit, quiet_age is at least ~1s
    # even under heavy load. 0.5s threshold leaves ample margin.
    assert snap2["quiet_age_seconds"] > 0.5, (
        f"expected quiet_age > 0.5 after pulse, got {snap2['quiet_age_seconds']:.3f}"
    )
    await runner.stop("sess-q")
    await _await_session_done(runner, "sess-q")


async def test_quiet_warning_only_for_default_mode(
    shim_path, runner, tmp_path, monkeypatch
):
    """A long quiet period in `dontAsk` never trips quiet_warning."""
    monkeypatch.setattr(cr_mod, "QUIET_WARN_SECONDS", 0.1)
    bin_dir = tmp_path / "bin_silent"
    bin_dir.mkdir()
    _write_shim(bin_dir, extra_argv="--silent --slow 5")
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

    await runner.submit(
        "sess-nodef",
        cwd=str(tmp_path),
        bin_name="claude",
        text="hi",
        permission_mode="dontAsk",
    )
    # Sleep well past the warn threshold.
    await asyncio.sleep(0.3)
    snap = runner.status_snapshot("sess-nodef")
    assert snap["busy"] is True
    assert snap["permission_mode"] == "dontAsk"
    assert snap["quiet_warning"] is False
    await runner.stop("sess-nodef")
    await _await_session_done(runner, "sess-nodef")


async def test_quiet_warning_triggers_at_threshold(
    shim_path, runner, tmp_path, monkeypatch
):
    """default-mode + quiet stdout beyond threshold → quiet_warning True."""
    monkeypatch.setattr(cr_mod, "QUIET_WARN_SECONDS", 0.2)
    bin_dir = tmp_path / "bin_silent"
    bin_dir.mkdir()
    _write_shim(bin_dir, extra_argv="--silent --slow 5")
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

    await runner.submit(
        "sess-warn",
        cwd=str(tmp_path),
        bin_name="claude",
        text="hi",
        permission_mode="default",
    )
    await asyncio.sleep(0.4)
    snap = runner.status_snapshot("sess-warn")
    assert snap["busy"] is True
    assert snap["permission_mode"] == "default"
    assert snap["quiet_warning"] is True
    await runner.stop("sess-warn")
    await _await_session_done(runner, "sess-warn")


async def test_auto_stop_off_by_default(shim_path, runner, tmp_path, monkeypatch):
    """auto_stop_quiet_default=False → quiet default turn is NOT killed."""
    monkeypatch.setattr(cr_mod, "QUIET_AUTOSTOP_SECONDS", 0.2)
    bin_dir = tmp_path / "bin_silent"
    bin_dir.mkdir()
    _write_shim(bin_dir, extra_argv="--silent --slow 3")
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

    await runner.submit(
        "sess-noauto",
        cwd=str(tmp_path),
        bin_name="claude",
        text="hi",
        permission_mode="default",
        auto_stop_quiet_default=False,
    )
    # Wait clearly past the (monkeypatched) auto-stop threshold.
    await asyncio.sleep(0.6)
    assert runner.is_busy("sess-noauto"), (
        "runner killed turn despite auto_stop_quiet_default=False"
    )
    assert runner.status_snapshot("sess-noauto")["last_error"] is None
    await runner.stop("sess-noauto")
    await _await_session_done(runner, "sess-noauto")


async def test_auto_stop_on_kills_quiet_default_turn(
    shim_path, runner, tmp_path, monkeypatch
):
    """auto_stop_quiet_default=True → runner SIGINTs the quiet turn; last_error set."""
    monkeypatch.setattr(cr_mod, "QUIET_AUTOSTOP_SECONDS", 0.2)

    # Emit one pulse line up front (so the watchdog gets scheduled) then go
    # quiet — the runner only schedules a watchdog check from inside the
    # stdout drain. After that it stays silent past the threshold.
    bin_dir = tmp_path / "bin_pulse_silent"
    bin_dir.mkdir()
    _write_shim(bin_dir, extra_argv="--pulse 0 1 --silent --slow 5")
    os.environ["PATH"] = f"{bin_dir}{os.pathsep}{os.environ['PATH']}"

    await runner.submit(
        "sess-auto",
        cwd=str(tmp_path),
        bin_name="claude",
        text="hi",
        permission_mode="default",
        auto_stop_quiet_default=True,
    )
    # Wait for: pulse emission → watchdog schedule → AUTOSTOP_SECONDS → SIGINT.
    deadline = time.monotonic() + 5.0
    while runner.is_busy("sess-auto") and time.monotonic() < deadline:
        await asyncio.sleep(0.05)
    assert runner.is_busy("sess-auto") is False, "auto-stop did not fire"
    snap = runner.status_snapshot("sess-auto")
    assert snap["last_error"] is not None
    assert "auto-stopped" in snap["last_error"]
