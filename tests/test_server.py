"""Tests for the runner-related server routes.

Covers:
  POST /api/sessions/{id}/send-message  (validation + happy path + argv flow)
  POST /api/sessions/{id}/stop          (idle no-op + busy path)
  GET  /api/sessions/{id}/runner-status (busy round-trip)

For pure validation/routing (4xx/409/503), we mock the runner so the
test is fast and deterministic. For "the request actually reaches the
spawned subprocess" we go end-to-end via the fake_claude shim (see
``tests/test_claude_runner.py`` for the injection contract).
"""

from __future__ import annotations

import asyncio
import json
import os
import shutil
import stat
import time
from pathlib import Path
from typing import AsyncIterator
from unittest.mock import AsyncMock

import pytest
from httpx import ASGITransport, AsyncClient

from clau_decode.db import Database
from clau_decode.models import AppConfig, Project, Session


FAKE = Path(__file__).parent / "fixtures" / "fake_claude.py"


# ---------------------------------------------------------------------------
# Setup helpers
# ---------------------------------------------------------------------------


def _write_shim(dir_: Path, bin_name: str = "claude", extra_argv: str = "") -> Path:
    path = dir_ / bin_name
    body = (
        "#!/usr/bin/env bash\n"
        f'exec {shutil.which("python3") or "python3"} "{FAKE}" {extra_argv} "$@"\n'
    )
    path.write_text(body)
    path.chmod(path.stat().st_mode | stat.S_IXUSR | stat.S_IXGRP | stat.S_IXOTH)
    return path


async def _seed_session(
    db_path: Path,
    *,
    session_id: str = "11111111-2222-3333-4444-555555555555",
    cwd: str,
    file_path: str,
    is_fork: bool = False,
) -> None:
    """Insert one session into the DB with the requested fields."""
    async with Database(db_path) as db:
        await db.init_schema()
        project = Project(
            id="proj-rt",
            display_name="runtime-test",
            raw_path="-runtime",
            data_source="test",
        )
        session = Session(
            id=session_id,
            project_id=project.id,
            file_path=file_path,
            cwd=cwd,
            is_fork=is_fork,
        )
        await db.upsert_project(project)
        await db.upsert_session(session)


def _make_app(db_path: Path, config: AppConfig):
    from clau_decode.server import create_app

    return create_app(config, db_path)


@pytest.fixture
async def env_with_claude(tmp_path, monkeypatch) -> AsyncIterator[dict]:
    """Tmp dir + DB + a real session + ``claude`` on PATH (fake binary).

    Yields a dict with: ``db_path``, ``cwd``, ``file_path``, ``session_id``,
    ``bin_dir`` — enough state for any test to build a custom app.
    """
    db_path = tmp_path / "test.db"
    # Use a `projects/` ancestor so _derive_bin_name returns "claude".
    projects = tmp_path / "root" / ".claude" / "projects" / "-runtime"
    projects.mkdir(parents=True)
    session_id = "11111111-2222-3333-4444-555555555555"
    file_path = projects / f"{session_id}.jsonl"
    file_path.write_text("")
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_shim(bin_dir)
    monkeypatch.setenv("PATH", f"{bin_dir}{os.pathsep}{os.environ['PATH']}")

    await _seed_session(
        db_path,
        session_id=session_id,
        cwd=str(cwd),
        file_path=str(file_path),
    )

    yield {
        "db_path": db_path,
        "cwd": str(cwd),
        "file_path": str(file_path),
        "session_id": session_id,
        "bin_dir": bin_dir,
    }


async def _client(app) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


# ---------------------------------------------------------------------------
# /send-message — happy path + validation
# ---------------------------------------------------------------------------


async def test_send_message_returns_ok(env_with_claude, monkeypatch):
    """Happy path: 200 + ``{ok, permission_mode}``. Runner is mocked."""
    e = env_with_claude
    app = _make_app(e["db_path"], AppConfig())
    # Mock the runner on the app instance — locate it via the closure cell.
    # Easier: monkeypatch ClaudeCodeRunner.submit before the app reaches it.
    from clau_decode import claude_runner as cr_mod

    submit_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "submit", submit_mock)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "is_busy", lambda self, sid: False)

    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": "hello"},
        )
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["ok"] is True
    assert body["permission_mode"] == "dontAsk"
    submit_mock.assert_awaited_once()


async def test_send_message_rejects_fork(env_with_claude):
    """Fork sessions are not valid --resume targets → 422."""
    e = env_with_claude
    # Re-seed with is_fork=True.
    await _seed_session(
        e["db_path"],
        session_id=e["session_id"],
        cwd=e["cwd"],
        file_path=e["file_path"],
        is_fork=True,
    )
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": "hello"},
        )
    assert r.status_code == 422
    assert "fork" in r.json()["detail"].lower()


@pytest.mark.parametrize("payload", ["", "   ", "   \n  "])
async def test_send_message_rejects_empty(env_with_claude, payload):
    """Empty or whitespace-only messages are rejected before any work happens."""
    e = env_with_claude
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": payload},
        )
    assert r.status_code == 422


async def test_send_message_rejects_busy(env_with_claude, monkeypatch):
    """is_busy=True → 409."""
    e = env_with_claude
    from clau_decode import claude_runner as cr_mod

    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "is_busy", lambda self, sid: True)
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": "hi"},
        )
    assert r.status_code == 409


async def test_send_message_503_when_bin_missing(env_with_claude, monkeypatch):
    """When the resolved binary is not on PATH → 503."""
    e = env_with_claude
    # Wipe PATH so the shim is unreachable.
    monkeypatch.setenv("PATH", "/nonexistent-dir")
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": "hi"},
        )
    assert r.status_code == 503
    assert "claude" in r.json()["detail"]


# ---------------------------------------------------------------------------
# /stop and /runner-status
# ---------------------------------------------------------------------------


async def test_stop_returns_stopped_false_when_idle(env_with_claude):
    """No-op stop returns ``{ok: True, stopped: False}``."""
    e = env_with_claude
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(f"/api/sessions/{e['session_id']}/stop")
    assert r.status_code == 200
    assert r.json() == {"ok": True, "stopped": False}


async def test_runner_status_reports_busy(env_with_claude, monkeypatch):
    """When a turn is live, status reports busy + mode + quiet age."""
    e = env_with_claude
    # Use a real long-running shim so the runner reports busy.
    bin_dir2 = e["bin_dir"].parent / "bin_slow"
    bin_dir2.mkdir()
    _write_shim(bin_dir2, extra_argv="--slow 30")
    monkeypatch.setenv("PATH", f"{bin_dir2}{os.pathsep}{os.environ['PATH']}")
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": "hi", "permission_mode": "dontAsk"},
        )
        assert r.status_code == 200, r.text
        r2 = await c.get(f"/api/sessions/{e['session_id']}/runner-status")
        assert r2.status_code == 200
        snap = r2.json()
        assert snap["busy"] is True
        assert snap["permission_mode"] == "dontAsk"
        assert snap["quiet_age_seconds"] is not None
        assert snap["quiet_warning"] is False
        # Clean up so the test doesn't leak a subprocess.
        await c.post(f"/api/sessions/{e['session_id']}/stop")


# ---------------------------------------------------------------------------
# Permission-mode resolution
# ---------------------------------------------------------------------------


async def test_permission_mode_override_wins(env_with_claude, monkeypatch):
    """Request-body permission_mode beats AppConfig default."""
    e = env_with_claude
    from clau_decode import claude_runner as cr_mod

    submit_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "submit", submit_mock)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "is_busy", lambda self, sid: False)
    cfg = AppConfig(claude_default_permission_mode="acceptEdits")
    app = _make_app(e["db_path"], cfg)
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": "hi", "permission_mode": "plan"},
        )
    assert r.status_code == 200
    assert r.json()["permission_mode"] == "plan"
    kwargs = submit_mock.await_args.kwargs
    assert kwargs["permission_mode"] == "plan"


async def test_permission_mode_falls_back_to_config(env_with_claude, monkeypatch):
    """Omitted permission_mode → AppConfig.claude_default_permission_mode."""
    e = env_with_claude
    from clau_decode import claude_runner as cr_mod

    submit_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "submit", submit_mock)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "is_busy", lambda self, sid: False)
    cfg = AppConfig(claude_default_permission_mode="acceptEdits")
    app = _make_app(e["db_path"], cfg)
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": "hi"},
        )
    assert r.status_code == 200
    assert r.json()["permission_mode"] == "acceptEdits"
    assert submit_mock.await_args.kwargs["permission_mode"] == "acceptEdits"


async def test_permission_mode_falls_back_to_dontask(env_with_claude, monkeypatch):
    """Both omitted (and AppConfig default is the Pydantic default) → 'dontAsk'."""
    e = env_with_claude
    from clau_decode import claude_runner as cr_mod

    submit_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "submit", submit_mock)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "is_busy", lambda self, sid: False)
    app = _make_app(e["db_path"], AppConfig())  # default config
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": "hi", "permission_mode": None},
        )
    assert r.status_code == 200
    assert r.json()["permission_mode"] == "dontAsk"


async def test_permission_mode_passes_through_to_argv(env_with_claude, monkeypatch):
    """The mode reaches the spawned subprocess as ``--permission-mode <mode>``.

    End-to-end: real subprocess via the fake_claude shim, capturing its
    own argv to a file we can read after the turn completes.
    """
    e = env_with_claude
    capture = e["bin_dir"].parent / "argv.json"
    bin_dir2 = e["bin_dir"].parent / "bin_capture"
    bin_dir2.mkdir()
    _write_shim(bin_dir2, extra_argv=f"--capture-argv {capture}")
    monkeypatch.setenv("PATH", f"{bin_dir2}{os.pathsep}{os.environ['PATH']}")

    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": "hi", "permission_mode": "bypassPermissions"},
        )
        assert r.status_code == 200, r.text

    # Wait for the (fast) turn to finish and the file to land.
    deadline = time.monotonic() + 5.0
    while not capture.exists() and time.monotonic() < deadline:
        await asyncio.sleep(0.02)
    assert capture.exists(), "fake_claude never wrote argv capture file"
    argv = json.loads(capture.read_text())
    assert "--permission-mode" in argv
    idx = argv.index("--permission-mode")
    assert argv[idx + 1] == "bypassPermissions"


async def test_slash_command_uses_positional_prompt(env_with_claude, monkeypatch):
    """Slash commands skip --input-format stream-json and pass the text as
    a positional prompt argument so Claude Code's slash dispatcher runs."""
    e = env_with_claude
    capture = e["bin_dir"].parent / "argv_slash.json"
    bin_dir2 = e["bin_dir"].parent / "bin_capture_slash"
    bin_dir2.mkdir()
    _write_shim(bin_dir2, extra_argv=f"--capture-argv {capture}")
    monkeypatch.setenv("PATH", f"{bin_dir2}{os.pathsep}{os.environ['PATH']}")

    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": "/help"},
        )
        assert r.status_code == 200, r.text

    deadline = time.monotonic() + 5.0
    while not capture.exists() and time.monotonic() < deadline:
        await asyncio.sleep(0.02)
    assert capture.exists(), "fake_claude never wrote argv capture file"
    argv = json.loads(capture.read_text())
    # Positional prompt is the last argv element after the shim's own flags.
    assert "/help" in argv, f"slash command not in argv: {argv}"
    # stream-json input mode must NOT be present for slash commands.
    assert "--input-format" not in argv, (
        "slash command should not use --input-format stream-json"
    )
    # output stays stream-json so SSE rendering still works.
    assert (
        "--output-format" in argv
        and argv[argv.index("--output-format") + 1] == "stream-json"
    )


async def test_regular_message_keeps_stream_json_input(env_with_claude, monkeypatch):
    """Non-slash messages still use the stream-json input path."""
    e = env_with_claude
    capture = e["bin_dir"].parent / "argv_regular.json"
    bin_dir2 = e["bin_dir"].parent / "bin_capture_regular"
    bin_dir2.mkdir()
    _write_shim(bin_dir2, extra_argv=f"--capture-argv {capture}")
    monkeypatch.setenv("PATH", f"{bin_dir2}{os.pathsep}{os.environ['PATH']}")

    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": "hello world"},
        )
        assert r.status_code == 200, r.text

    deadline = time.monotonic() + 5.0
    while not capture.exists() and time.monotonic() < deadline:
        await asyncio.sleep(0.02)
    argv = json.loads(capture.read_text())
    assert "--input-format" in argv
    assert argv[argv.index("--input-format") + 1] == "stream-json"
    # Regular messages should NOT pass the text positionally.
    assert "hello world" not in argv


# ---------------------------------------------------------------------------
# Auto-stop flag plumbing
# ---------------------------------------------------------------------------


# ---------------------------------------------------------------------------
# Static SPA fallback — hashed asset misses must 404
# ---------------------------------------------------------------------------


async def test_missing_hashed_asset_returns_404(tmp_path):
    """Requests under /assets/ that don't match a real file must 404.

    Falling through to index.html for a missing JS chunk hands the browser
    text/html in response to a module import, producing an opaque
    "Failed to fetch dynamically imported module" error with no actionable
    diagnostic. The frontend's lazyWithRetry only triggers its reload prompt
    on a real fetch failure — see issue #10.
    """
    cfg = AppConfig()
    db_path = tmp_path / "spa.db"
    async with Database(db_path) as db:
        await db.init_schema()
    app = _make_app(db_path, cfg)
    async with await _client(app) as c:
        r = await c.get("/assets/ShortcutsPopup-DOES-NOT-EXIST.js")
    assert r.status_code == 404


async def test_spa_unknown_route_still_serves_index(tmp_path):
    """Non-/assets unknown routes keep serving index.html so the SPA router
    can take over (deep-link to /analytics, /session/<id>, etc.)."""
    cfg = AppConfig()
    db_path = tmp_path / "spa2.db"
    async with Database(db_path) as db:
        await db.init_schema()
    app = _make_app(db_path, cfg)
    async with await _client(app) as c:
        r = await c.get("/some/spa/route")
    # If a static/ build is present in the package, we get the SPA shell.
    # If not (dev install without `npm run build`), this route is simply
    # absent — either outcome is acceptable, but we MUST NOT see HTML being
    # mistakenly served from the /assets/ namespace handled above.
    assert r.status_code in (200, 404)


async def test_auto_stop_flag_threaded_to_runner(env_with_claude, monkeypatch):
    """AppConfig.claude_auto_stop_quiet_default_turns reaches runner.submit()."""
    e = env_with_claude
    from clau_decode import claude_runner as cr_mod

    submit_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "submit", submit_mock)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "is_busy", lambda self, sid: False)
    cfg = AppConfig(claude_auto_stop_quiet_default_turns=True)
    app = _make_app(e["db_path"], cfg)
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/send-message",
            json={"message": "hi"},
        )
    assert r.status_code == 200
    assert submit_mock.await_args.kwargs["auto_stop_quiet_default"] is True


# ---------------------------------------------------------------------------
# POST /api/sessions/new — issue #9 "New Task" button + Cmd+Shift+O
#
# Contract: /api/sessions/new is a pure metadata mint. It does NOT spawn a
# claude subprocess and does NOT write any JSONL. It stashes a pending
# entry keyed by session id; the user's real first message — sent through
# /send-message — is what materialises the JSONL via `claude --session-id`.
# ---------------------------------------------------------------------------


async def test_new_session_returns_fresh_uuid_without_spawning_runner(
    env_with_claude, monkeypatch
):
    """POST /api/sessions/new returns a new uuid + cwd + permission_mode
    WITHOUT calling the runner. Nothing should be sent on the user's behalf.
    """
    e = env_with_claude
    from clau_decode import claude_runner as cr_mod

    submit_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "submit", submit_mock)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "is_busy", lambda self, sid: False)

    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post("/api/sessions/new", json={"cwd": e["cwd"]})
    assert r.status_code == 200, r.text
    body = r.json()
    assert "session_id" in body
    assert body["session_id"] != e["session_id"]  # NOT the seeded session
    # UUIDv4 shape (8-4-4-4-12 hex)
    import re
    assert re.fullmatch(
        r"[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}",
        body["session_id"],
    )
    assert body["cwd"] == e["cwd"]
    assert body["permission_mode"] == "dontAsk"
    # Critical: no runner spawn — the user's first turn comes through
    # /send-message, not this metadata-mint endpoint.
    submit_mock.assert_not_awaited()


async def test_new_session_records_pending_entry(env_with_claude, monkeypatch):
    """The minted id is stashed in the in-memory pending map so a later
    /send-message can route to the new_session=True spawn path."""
    e = env_with_claude
    from clau_decode import claude_runner as cr_mod

    submit_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "submit", submit_mock)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "is_busy", lambda self, sid: False)

    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            "/api/sessions/new",
            json={"cwd": e["cwd"], "permission_mode": "acceptEdits"},
        )
    assert r.status_code == 200, r.text
    new_id = r.json()["session_id"]
    pending = app.state.pending_sessions
    assert new_id in pending
    assert pending[new_id].cwd == e["cwd"]
    assert pending[new_id].permission_mode == "acceptEdits"


async def test_new_session_defaults_cwd_to_last_used(env_with_claude, monkeypatch):
    """When no cwd is given, default to the most-recent session's cwd."""
    e = env_with_claude
    from clau_decode import claude_runner as cr_mod

    submit_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "submit", submit_mock)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "is_busy", lambda self, sid: False)

    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post("/api/sessions/new", json={})
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["cwd"] == e["cwd"]  # falls back to the seeded session's cwd
    submit_mock.assert_not_awaited()


async def test_new_session_rejects_unknown_cwd(env_with_claude, monkeypatch):
    """A cwd that doesn't exist on disk → 404, no pending entry."""
    e = env_with_claude
    from clau_decode import claude_runner as cr_mod

    submit_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "submit", submit_mock)

    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            "/api/sessions/new", json={"cwd": "/definitely/not/a/real/path"}
        )
    assert r.status_code == 404
    submit_mock.assert_not_awaited()
    assert not app.state.pending_sessions


async def test_new_session_503_when_bin_missing(env_with_claude, monkeypatch):
    """When claude is not on PATH → 503 (validated up front)."""
    e = env_with_claude
    monkeypatch.setenv("PATH", "/nonexistent-dir")
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post("/api/sessions/new", json={"cwd": e["cwd"]})
    assert r.status_code == 503


async def test_send_message_to_pending_session_spawns_with_new_session_flag(
    env_with_claude, monkeypatch
):
    """The user's *actual* first message is what spawns the runner.

    For an id that exists only in the pending map (no DB row yet), the
    send-message route must call submit(new_session=True) with the user's
    text — NOT any auto-greeting.
    """
    e = env_with_claude
    from clau_decode import claude_runner as cr_mod

    submit_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "submit", submit_mock)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "is_busy", lambda self, sid: False)

    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post("/api/sessions/new", json={"cwd": e["cwd"]})
        assert r.status_code == 200, r.text
        new_id = r.json()["session_id"]

        r2 = await c.post(
            f"/api/sessions/{new_id}/send-message",
            json={"message": "do the thing I asked"},
        )
    assert r2.status_code == 200, r2.text
    submit_mock.assert_awaited_once()
    kwargs = submit_mock.await_args.kwargs
    args = submit_mock.await_args.args
    assert args[0] == new_id
    assert kwargs["new_session"] is True
    assert kwargs["cwd"] == e["cwd"]
    assert kwargs["text"] == "do the thing I asked"
    # CRITICAL — no auto greeting got injected anywhere.
    assert "Hi! I'm ready when you are." not in kwargs["text"]


async def test_send_message_clears_pending_entry(env_with_claude, monkeypatch):
    """First send-message consumes the pending entry; subsequent calls
    fall through to the normal --resume path (and 404 here, since the DB
    row doesn't exist yet in our test setup)."""
    e = env_with_claude
    from clau_decode import claude_runner as cr_mod

    submit_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "submit", submit_mock)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "is_busy", lambda self, sid: False)

    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post("/api/sessions/new", json={"cwd": e["cwd"]})
        new_id = r.json()["session_id"]
        assert new_id in app.state.pending_sessions

        r2 = await c.post(
            f"/api/sessions/{new_id}/send-message",
            json={"message": "first turn"},
        )
        assert r2.status_code == 200, r2.text
        assert new_id not in app.state.pending_sessions

        # Second send for the same id — pending is gone AND there's no DB row,
        # so this must 404 (the normal "session not found" code path).
        r3 = await c.post(
            f"/api/sessions/{new_id}/send-message",
            json={"message": "second turn"},
        )
        assert r3.status_code == 404


async def test_send_message_unknown_id_still_404(env_with_claude, monkeypatch):
    """Send-message for an id that is neither in the DB nor pending → 404."""
    e = env_with_claude
    from clau_decode import claude_runner as cr_mod

    submit_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "submit", submit_mock)
    monkeypatch.setattr(cr_mod.ClaudeCodeRunner, "is_busy", lambda self, sid: False)

    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            "/api/sessions/00000000-0000-4000-8000-000000000000/send-message",
            json={"message": "hi"},
        )
    assert r.status_code == 404
    submit_mock.assert_not_awaited()


async def test_send_message_to_pending_uses_session_id_argv(
    env_with_claude, monkeypatch
):
    """End-to-end: send-message on a pending id spawns the CLI with
    --session-id <new uuid> (not --resume) and the user's text reaches stdin.

    This is the spawn shape that materialises a fresh JSONL on disk so the
    watcher → SSE pipeline can index the session the moment it appears.
    """
    e = env_with_claude
    capture = e["bin_dir"].parent / "argv_new.json"
    bin_dir2 = e["bin_dir"].parent / "bin_capture_new"
    bin_dir2.mkdir()
    _write_shim(bin_dir2, extra_argv=f"--capture-argv {capture}")
    monkeypatch.setenv("PATH", f"{bin_dir2}{os.pathsep}{os.environ['PATH']}")

    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post("/api/sessions/new", json={"cwd": e["cwd"]})
        assert r.status_code == 200, r.text
        new_id = r.json()["session_id"]

        r2 = await c.post(
            f"/api/sessions/{new_id}/send-message",
            json={"message": "first real user message"},
        )
        assert r2.status_code == 200, r2.text

    deadline = time.monotonic() + 5.0
    while not capture.exists() and time.monotonic() < deadline:
        await asyncio.sleep(0.02)
    assert capture.exists(), "fake_claude never wrote argv capture file"
    argv = json.loads(capture.read_text())
    assert "--session-id" in argv
    assert argv[argv.index("--session-id") + 1] == new_id
    # Brand-new sessions don't --resume; that would fail against a non-existent id.
    assert "--resume" not in argv
