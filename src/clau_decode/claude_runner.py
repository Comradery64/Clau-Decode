"""Headless runner — drives the CLI binary in stream-json mode.

One subprocess per `submit()` call. Stdout/stderr are drained in background
tasks so the pipes never fill; the existing JSONL watcher + SSE pipeline
renders the assistant's response. Stdout line activity feeds the
quiet-turn watchdog (see module-level constants below).
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import signal
import time
from dataclasses import dataclass, field
from pathlib import Path
from typing import Optional


# Quiet-turn watchdog thresholds. Only the `default` permission mode can
# deadlock on an interactive prompt — other modes are watched but never
# triggered for. Auto-stop only fires when the caller opts in per submit.
QUIET_WARN_SECONDS = 120
QUIET_AUTOSTOP_SECONDS = 300

_HEADLESS_HOSTILE_MODES = {"default", "plan"}

# Synthetic-response phrases the `claude`/`zai`/`crad` binaries emit when a
# slash command isn't registered. Matching one of these triggers an
# auto-fallback to plain text so the user gets a real model response.
_UNKNOWN_SLASH_PATTERNS = (
    "isn't available in this environment",
    "is not available in this environment",
    "unknown command",
    "unknown slash command",
    "command not found",
)


def _looks_like_unknown_slash(result_text: str) -> bool:
    lc = result_text.lower()
    return any(p in lc for p in _UNKNOWN_SLASH_PATTERNS)


# Env vars that would force the spawned binary to bill against a static API key
# instead of the user's interactive subscription. clau-decode is subscription-mode
# only — strip these so a user with one of these exported in their shell doesn't
# get surprise charges.
_SUBSCRIPTION_BLOCKED_ENV = frozenset({"ANTHROPIC_API_KEY", "ANTHROPIC_AUTH_TOKEN"})


def _subscription_env() -> dict[str, str]:
    return {k: v for k, v in os.environ.items() if k not in _SUBSCRIPTION_BLOCKED_ENV}


# (bin_name) -> (installed_mtime_ns, settings_mtime_ns, dirs)
_PLUGIN_CACHE: dict[str, tuple[int, int, list[str]]] = {}


def _mtime_ns(path: Path) -> int:
    try:
        return path.stat().st_mtime_ns
    except OSError:
        return -1


def _discover_plugin_dirs(bin_name: str) -> list[str]:
    """Return install paths of plugins enabled for ``bin_name``.

    Headless ``claude --print`` does NOT auto-load plugins the way the
    interactive TUI does — they have to be passed explicitly via repeated
    ``--plugin-dir`` flags. We read the binary's own ``installed_plugins.json``
    and cross-reference ``settings.json``'s ``enabledPlugins`` map so we only
    pass plugins the user has actually turned on.

    Cached by mtime of the source files: a stat call per source file is much
    cheaper than re-reading + parsing JSON on every spawn, but mtime-keying
    means changes are picked up the moment the user saves either file.
    """
    candidates = [
        Path.home() / ".cc-mirror" / bin_name / "config",
        Path.home() / f".{bin_name}",
    ]
    for config_dir in candidates:
        installed_file = config_dir / "plugins" / "installed_plugins.json"
        if not installed_file.exists():
            continue

        installed_mtime = _mtime_ns(installed_file)
        settings_file = config_dir / "settings.json"
        settings_mtime = _mtime_ns(settings_file) if settings_file.exists() else 0

        cached = _PLUGIN_CACHE.get(bin_name)
        if (
            cached is not None
            and cached[0] == installed_mtime
            and cached[1] == settings_mtime
        ):
            return cached[2]

        try:
            installed_data = json.loads(installed_file.read_text())
        except (json.JSONDecodeError, OSError):
            _PLUGIN_CACHE[bin_name] = (installed_mtime, settings_mtime, [])
            return []

        enabled_ids: Optional[set[str]] = None
        if settings_file.exists():
            try:
                settings_data = json.loads(settings_file.read_text())
                enabled_map = settings_data.get("enabledPlugins")
                if isinstance(enabled_map, dict):
                    enabled_ids = {k for k, v in enabled_map.items() if v}
            except (json.JSONDecodeError, OSError):
                pass

        dirs: list[str] = []
        for plugin_id, entries in (installed_data.get("plugins") or {}).items():
            if enabled_ids is not None and plugin_id not in enabled_ids:
                continue
            if not isinstance(entries, list):
                continue
            for entry in entries:
                if not isinstance(entry, dict):
                    continue
                install_path = entry.get("installPath")
                if install_path and Path(install_path).is_dir():
                    dirs.append(install_path)

        _PLUGIN_CACHE[bin_name] = (installed_mtime, settings_mtime, dirs)
        return dirs
    return []


_log = logging.getLogger(__name__)


@dataclass
class _RunnerState:
    proc: asyncio.subprocess.Process
    stdout_task: asyncio.Task
    stderr_task: asyncio.Task
    wait_task: asyncio.Task
    lock: asyncio.Lock
    permission_mode: str
    auto_stop_quiet_default: bool
    last_stdout_at: float
    last_error: Optional[str] = None
    stderr_tail: list[str] = field(default_factory=list)
    # Last stdout `result` event's `result` text. Captures synthetic
    # responses (e.g. "/foo isn't available") that aren't routed to JSONL.
    last_result_text: Optional[str] = None
    last_is_error: bool = False


class ClaudeCodeRunner:
    """Singleton runner — created once in ``create_app()``."""

    def __init__(self) -> None:
        self._sessions: dict[str, _RunnerState] = {}
        self._locks: dict[str, asyncio.Lock] = {}
        # Persist last_error and last permission_mode across turn lifetimes
        # so /runner-status can report them after the proc exits.
        self._last_errors: dict[str, Optional[str]] = {}
        self._last_modes: dict[str, Optional[str]] = {}

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    async def submit(
        self,
        session_id: str,
        *,
        cwd: str,
        bin_name: str,
        text: str,
        permission_mode: str,
        model: str = "",
        auto_stop_quiet_default: bool = False,
        new_session: bool = False,
    ) -> Optional[dict]:
        is_slash_command = text.lstrip().startswith("/")

        state = await self._spawn(
            session_id,
            cwd=cwd,
            bin_name=bin_name,
            text=text,
            permission_mode=permission_mode,
            model=model,
            auto_stop_quiet_default=auto_stop_quiet_default,
            use_slash=is_slash_command,
            new_session=new_session,
        )

        if not is_slash_command:
            return None

        # Slash commands complete fast (<100ms) with the whole response in a
        # single stdout `type: "result"` event that never reaches the JSONL.
        # Wait briefly so we can either surface that text or detect a
        # "not available" rejection and auto-fall-back to plain text.
        try:
            await asyncio.wait_for(asyncio.shield(state.wait_task), timeout=5.0)
        except asyncio.TimeoutError:
            return {
                "result_text": state.last_result_text,
                "is_error": state.last_is_error,
                "completed": False,
                "fell_back": False,
            }

        # Unknown-slash rejection → resubmit as a regular text message so
        # Claude responds normally.
        if state.last_result_text and _looks_like_unknown_slash(state.last_result_text):
            _log.info(
                "slash command not recognized — falling back to text (session %s)",
                session_id,
            )
            await self._spawn(
                session_id,
                cwd=cwd,
                bin_name=bin_name,
                text=text,
                permission_mode=permission_mode,
                model=model,
                auto_stop_quiet_default=auto_stop_quiet_default,
                use_slash=False,
                new_session=False,
            )
            # The text-mode response will arrive via JSONL → SSE like any
            # normal turn — don't surface the rejection text.
            return {
                "result_text": None,
                "is_error": False,
                "completed": False,
                "fell_back": True,
            }

        return {
            "result_text": state.last_result_text,
            "is_error": state.last_is_error,
            "completed": state.proc.returncode is not None,
            "fell_back": False,
        }

    async def generate_recap(
        self,
        session_id: str,
        *,
        cwd: str,
        bin_name: str,
        prompt: str,
        timeout_seconds: float = 60.0,
    ) -> Optional[str]:
        """Spawn a fork+no-persist call against the session and return the
        captured `result_text`, or None on timeout / non-zero exit / empty result."""
        argv: list[str] = [
            bin_name,
            "--print",
            "--verbose",
            "--resume",
            session_id,
            "--fork-session",
            "--no-session-persistence",
            "--model",
            "haiku",
            "--permission-mode",
            "dontAsk",
            "--output-format",
            "stream-json",
            "--include-partial-messages",
        ]
        for plugin_dir in _discover_plugin_dirs(bin_name):
            argv.extend(["--plugin-dir", plugin_dir])
        argv.append(prompt)

        _log.info("runner: recap spawn %s (session %s)", " ".join(argv), session_id)

        try:
            proc = await asyncio.create_subprocess_exec(
                *argv,
                cwd=cwd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=_subscription_env(),
            )
        except FileNotFoundError as exc:
            _log.warning("recap: spawn failed (session %s): %s", session_id, exc)
            return None

        if proc.stdin is not None:
            try:
                proc.stdin.close()
            except (BrokenPipeError, ConnectionResetError):
                pass

        result_text: Optional[str] = None

        async def _read_stdout() -> None:
            nonlocal result_text
            assert proc.stdout is not None
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                try:
                    decoded = line.decode("utf-8", errors="replace").rstrip()
                    if not decoded:
                        continue
                    evt = json.loads(decoded)
                except json.JSONDecodeError:
                    continue
                if isinstance(evt, dict) and evt.get("type") == "result":
                    candidate = evt.get("result")
                    if isinstance(candidate, str) and candidate:
                        result_text = candidate

        async def _drain_stderr() -> None:
            assert proc.stderr is not None
            while True:
                line = await proc.stderr.readline()
                if not line:
                    break

        stdout_task = asyncio.create_task(_read_stdout())
        stderr_task = asyncio.create_task(_drain_stderr())

        try:
            rc = await asyncio.wait_for(proc.wait(), timeout=timeout_seconds)
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            await proc.wait()
            for t in (stdout_task, stderr_task):
                if not t.done():
                    t.cancel()
                    try:
                        await t
                    except (asyncio.CancelledError, Exception):
                        pass
            return None

        for t in (stdout_task, stderr_task):
            try:
                await t
            except Exception:
                pass

        if rc != 0:
            return None
        if not result_text:
            return None
        return result_text

    async def _spawn(
        self,
        session_id: str,
        *,
        cwd: str,
        bin_name: str,
        text: str,
        permission_mode: str,
        model: str,
        auto_stop_quiet_default: bool,
        use_slash: bool,
        new_session: bool = False,
    ) -> _RunnerState:
        lock = self._locks.setdefault(session_id, asyncio.Lock())
        async with lock:
            existing = self._sessions.get(session_id)
            if existing is not None and existing.proc.returncode is None:
                raise RuntimeError(f"session {session_id} is busy")

            if permission_mode in _HEADLESS_HOSTILE_MODES:
                _log.warning(
                    "claude permission_mode=%s is headless-hostile (session %s)",
                    permission_mode,
                    session_id,
                )

            # new_session=True mints a fresh session id on the CLI side
            # (--session-id <uuid> instead of --resume <uuid>). --resume against
            # a non-existent id would fail; --session-id creates the JSONL so the
            # watcher → SSE pipeline indexes it the moment it lands on disk.
            resume_flag = "--session-id" if new_session else "--resume"
            argv: list[str] = [
                bin_name,
                "--print",
                "--verbose",  # required when --output-format=stream-json is paired with --print
                resume_flag,
                session_id,
                "--permission-mode",
                permission_mode,
                "--output-format",
                "stream-json",
                "--include-partial-messages",
            ]
            if model:
                argv.extend(["--model", model])
            # Headless --print doesn't auto-load plugins (init event reports
            # plugins:[]). Inject the user's enabled plugins explicitly so
            # their custom slash commands resolve.
            for plugin_dir in _discover_plugin_dirs(bin_name):
                argv.extend(["--plugin-dir", plugin_dir])
            if use_slash:
                argv.append(text)
            else:
                argv.extend(
                    [
                        "--input-format",
                        "stream-json",
                        "--replay-user-messages",
                    ]
                )

            _log.warning(
                "runner: spawning %s (session %s, cwd=%s, slash=%s)",
                " ".join(argv),
                session_id,
                cwd,
                use_slash,
            )
            proc = await asyncio.create_subprocess_exec(
                *argv,
                cwd=cwd,
                stdin=asyncio.subprocess.PIPE,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=_subscription_env(),
            )

            assert proc.stdin is not None
            if use_slash:
                try:
                    proc.stdin.close()
                except (BrokenPipeError, ConnectionResetError):
                    pass
            else:
                payload = json.dumps(
                    {
                        "type": "user",
                        "message": {
                            "role": "user",
                            "content": [{"type": "text", "text": text}],
                        },
                    }
                )
                try:
                    proc.stdin.write((payload + "\n").encode("utf-8"))
                    await proc.stdin.drain()
                    proc.stdin.close()
                except (BrokenPipeError, ConnectionResetError) as exc:
                    self._last_errors[session_id] = f"stdin write failed: {exc}"
                    self._last_modes[session_id] = permission_mode
                    raise

            state = _RunnerState(
                proc=proc,
                stdout_task=asyncio.create_task(self._drain_stdout(session_id, proc)),
                stderr_task=asyncio.create_task(self._drain_stderr(session_id, proc)),
                wait_task=asyncio.create_task(self._wait(session_id, proc)),
                lock=lock,
                permission_mode=permission_mode,
                auto_stop_quiet_default=auto_stop_quiet_default,
                last_stdout_at=time.monotonic(),
            )
            self._sessions[session_id] = state
            self._last_modes[session_id] = permission_mode
            self._last_errors[session_id] = None
            return state

    def is_busy(self, session_id: str) -> bool:
        state = self._sessions.get(session_id)
        return state is not None and state.proc.returncode is None

    def quiet_age(self, session_id: str) -> Optional[float]:
        state = self._sessions.get(session_id)
        if state is None or state.proc.returncode is not None:
            return None
        return time.monotonic() - state.last_stdout_at

    async def stop(self, session_id: str) -> bool:
        state = self._sessions.get(session_id)
        if state is None or state.proc.returncode is not None:
            return False
        proc = state.proc
        try:
            proc.send_signal(signal.SIGINT)
        except ProcessLookupError:
            return False
        try:
            await asyncio.wait_for(proc.wait(), timeout=2.0)
            return True
        except asyncio.TimeoutError:
            pass
        try:
            proc.terminate()
            await asyncio.wait_for(proc.wait(), timeout=2.0)
            return True
        except (ProcessLookupError, asyncio.TimeoutError):
            pass
        try:
            proc.kill()
            await proc.wait()
        except ProcessLookupError:
            pass
        return True

    async def shutdown(self) -> None:
        ids = list(self._sessions.keys())
        for sid in ids:
            await self.stop(sid)
        # Drain any pending tasks
        for sid in ids:
            state = self._sessions.get(sid)
            if state is None:
                continue
            for task in (state.stdout_task, state.stderr_task, state.wait_task):
                if not task.done():
                    task.cancel()
                    try:
                        await task
                    except (asyncio.CancelledError, Exception):
                        pass

    def status_snapshot(self, session_id: str) -> dict:
        state = self._sessions.get(session_id)
        busy = state is not None and state.proc.returncode is None
        if busy:
            assert state is not None
            mode = state.permission_mode
            quiet = time.monotonic() - state.last_stdout_at
            quiet_warning = mode == "default" and quiet >= QUIET_WARN_SECONDS
            return {
                "busy": True,
                "last_error": state.last_error,
                "permission_mode": mode,
                "quiet_age_seconds": quiet,
                "quiet_warning": quiet_warning,
            }
        return {
            "busy": False,
            "last_error": self._last_errors.get(session_id),
            "permission_mode": self._last_modes.get(session_id),
            "quiet_age_seconds": None,
            "quiet_warning": False,
        }

    # ------------------------------------------------------------------
    # Background tasks
    # ------------------------------------------------------------------

    async def _drain_stdout(
        self, session_id: str, proc: asyncio.subprocess.Process
    ) -> None:
        assert proc.stdout is not None
        try:
            while True:
                line = await proc.stdout.readline()
                if not line:
                    break
                state = self._sessions.get(session_id)
                if state is not None:
                    state.last_stdout_at = time.monotonic()
                try:
                    decoded = line.decode("utf-8", errors="replace").rstrip()
                    if decoded:
                        evt = json.loads(decoded)
                        if isinstance(evt, dict) and evt.get("type") == "error":
                            _log.warning(
                                "claude error event (session %s): %s",
                                session_id,
                                decoded,
                            )
                            if state is not None:
                                state.last_error = decoded
                        elif isinstance(evt, dict) and evt.get("type") == "result":
                            # Capture synthetic responses (e.g. unknown slash
                            # commands) that don't make it to the JSONL.
                            result_text = evt.get("result")
                            if (
                                isinstance(result_text, str)
                                and result_text
                                and state is not None
                            ):
                                state.last_result_text = result_text
                                state.last_is_error = bool(evt.get("is_error", False))
                except json.JSONDecodeError:
                    _log.debug(
                        "non-JSON stdout line (session %s): %r",
                        session_id,
                        line,
                    )
                # Schedule a watchdog check for auto-stop after this line.
                if state is not None and state.auto_stop_quiet_default:
                    asyncio.create_task(self._watchdog_check(session_id))
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _log.warning("stdout drain error (session %s): %s", session_id, exc)

    async def _drain_stderr(
        self, session_id: str, proc: asyncio.subprocess.Process
    ) -> None:
        assert proc.stderr is not None
        try:
            while True:
                line = await proc.stderr.readline()
                if not line:
                    break
                decoded = line.decode("utf-8", errors="replace").rstrip()
                if decoded:
                    _log.warning("claude stderr (session %s): %s", session_id, decoded)
                    state = self._sessions.get(session_id)
                    if state is not None:
                        state.stderr_tail.append(decoded)
                        if len(state.stderr_tail) > 20:
                            state.stderr_tail = state.stderr_tail[-20:]
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            _log.warning("stderr drain error (session %s): %s", session_id, exc)

    async def _wait(self, session_id: str, proc: asyncio.subprocess.Process) -> None:
        try:
            rc = await proc.wait()
            state = self._sessions.get(session_id)
            if state is not None:
                if rc != 0 and state.last_error is None:
                    tail = "\n".join(state.stderr_tail[-5:]).strip()
                    if tail:
                        state.last_error = f"claude exited code {rc}: {tail}"
                    else:
                        state.last_error = f"claude exited with code {rc}"
                # Persist final state then drop the active entry.
                self._last_errors[session_id] = state.last_error
                self._last_modes[session_id] = state.permission_mode
                # Wait for drains to finish naturally now that the pipes closed.
                for t in (state.stdout_task, state.stderr_task):
                    if not t.done():
                        try:
                            await t
                        except Exception:
                            pass
        except asyncio.CancelledError:
            raise

    async def _watchdog_check(self, session_id: str) -> None:
        state = self._sessions.get(session_id)
        if state is None or state.proc.returncode is not None:
            return
        if state.permission_mode != "default":
            return
        if not state.auto_stop_quiet_default:
            return
        # Sleep just past the threshold then re-check; if the stdout timestamp
        # has not advanced, fire stop().
        await asyncio.sleep(QUIET_AUTOSTOP_SECONDS)
        state = self._sessions.get(session_id)
        if state is None or state.proc.returncode is not None:
            return
        if state.permission_mode != "default":
            return
        if time.monotonic() - state.last_stdout_at < QUIET_AUTOSTOP_SECONDS:
            return
        state.last_error = (
            "auto-stopped after 5min of quiet stdout in default permission mode"
        )
        self._last_errors[session_id] = state.last_error
        await self.stop(session_id)
