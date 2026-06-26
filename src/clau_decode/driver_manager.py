"""DriverManager — session-keyed owner of live ``ProviderDriver`` instances.

The driver-side analogue of ``PtyManager``: it owns one ``ProviderDriver`` per
driven session, fans the driver's output bytes onto the same SSE shapes the
Native transport already consumes (``pty_output_chunk`` / ``pty_native_state``),
and serves Native-view hydration snapshots — so the existing provider-agnostic
xterm.js renderer can drive a Codex session with no renderer changes.

What it deliberately does NOT have: an idle reaper. tmux sessions are meant to
**survive disconnect and idle** (that is the whole point of the tmux backend —
it fixes "the 5-minute reaper kills long tasks"). Sessions end only on an
explicit ``kill`` or clean ``shutdown``. Codex sessions never enter
``PtyManager``, so they are structurally excluded from its disconnect-kill.

Claude is intentionally never routed here; it keeps its tuned direct-PTY path.
"""

from __future__ import annotations

import asyncio
import logging
from typing import Any

from .db import Database
from .drivers import DriverState, ProviderDriver, build_driver
from .events_bus import EventBroadcaster
from .pty_native import encode_pty_output_chunk, encode_pty_snapshot
from .pty_runner import DEFAULT_COLS, DEFAULT_ROWS

_log = logging.getLogger(__name__)


# DriverState → the native_state vocabulary the FE already understands
# (see pty_screen_state.classify_screen). Keeps the Native view's existing
# state handling working for Codex with zero FE changes.
_STATE_TO_NATIVE: dict[DriverState, str] = {
    DriverState.IDLE: "idle_chat_input",
    DriverState.RUNNING: "running",
    DriverState.NEEDS_TRUST: "trust_prompt",
    DriverState.NEEDS_APPROVAL: "permission_prompt",
    DriverState.NEEDS_LOGIN: "login_required",
    DriverState.NEEDS_UPDATE: "permission_prompt",
    DriverState.STARTING: "idle_chat_input",
    DriverState.DEAD: "dead",
}


class DriverManager:
    """Owns ``ProviderDriver`` instances keyed by session id.

    Mirrors the slice of ``PtyManager``'s surface the pty endpoints use
    (``focus``/``submit``/``write_raw_input``/``resize``/``native_snapshot``/
    ``status``/``kill``/``shutdown``) so the server can route driver-backed
    providers here with a thin provider branch.
    """

    def __init__(
        self,
        db: Database,
        bus: EventBroadcaster,
        *,
        ui_endpoint: str | None = None,
    ) -> None:
        self._db = db
        self._bus = bus
        self._ui_endpoint = ui_endpoint
        self._drivers: dict[str, ProviderDriver] = {}
        self._providers: dict[str, str] = {}
        self._session_locks: dict[str, asyncio.Lock] = {}
        self._native_cols = DEFAULT_COLS
        # Only the on-screen session's output is broadcast over SSE — mirrors
        # PtyManager, so N background drivers don't firehose the main thread.
        self._active_session_id: str | None = None

    # ------------------------------------------------------------------
    # Config / locking
    # ------------------------------------------------------------------

    def set_native_cols(self, cols: int) -> None:
        if cols > 0:
            self._native_cols = cols

    def _session_lock(self, session_id: str) -> asyncio.Lock:
        lock = self._session_locks.get(session_id)
        if lock is None:
            lock = asyncio.Lock()
            self._session_locks[session_id] = lock
        return lock

    def has(self, session_id: str) -> bool:
        return session_id in self._drivers

    def is_alive(self, session_id: str) -> bool:
        d = self._drivers.get(session_id)
        return d is not None and d.is_alive()

    # ------------------------------------------------------------------
    # Output fanout
    # ------------------------------------------------------------------

    def _make_on_chunk(self, session_id: str):
        def _cb(chunk: bytes) -> None:
            # Drop output for backgrounded sessions — only the active session's
            # bytes reach the browser.
            if session_id != self._active_session_id:
                return
            try:
                self._bus.publish(encode_pty_output_chunk(session_id, chunk))
            except Exception as exc:  # pragma: no cover — defensive
                _log.warning(
                    "driver: output publish raised (session %s): %s", session_id, exc
                )

        return _cb

    def _make_on_dead(self, session_id: str):
        def _cb() -> None:
            try:
                self._bus.publish(
                    {
                        "type": "pty_native_state",
                        "session_id": session_id,
                        "state": "dead",
                        "decoded_input_safe": False,
                    }
                )
            except Exception as exc:  # pragma: no cover — defensive
                _log.warning(
                    "driver: dead publish raised (session %s): %s", session_id, exc
                )
            # Drop the spent driver so a later focus() rebuilds a fresh one.
            # An out-of-band death (codex /quit, crash, tmux killed) leaves the
            # driver with a closed attach client but a stale _attach_proc; if we
            # keep it in _drivers, focus()'s respawn branch calls spawn() on it
            # and raises "already spawned" (HTTP 500) — the session then stays
            # unreopenable until the server restarts. Guard on is_alive() so a
            # concurrently re-spawned driver for the same id is never evicted.
            driver = self._drivers.get(session_id)
            if driver is not None and not driver.is_alive():
                self._drivers.pop(session_id, None)
                self._providers.pop(session_id, None)
                if self._active_session_id == session_id:
                    self._active_session_id = None
                # Release the leaked master fd / reap the dead attach client
                # off the reader callback (kill-session is idempotent if gone).
                try:
                    asyncio.get_running_loop().create_task(driver.kill())
                except RuntimeError:  # pragma: no cover — no running loop
                    pass

        return _cb

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    async def focus(
        self,
        session_id: str,
        *,
        provider: str,
        cwd: str,
        model: str | None = None,
        resume_uuid: str | None = None,
        new_chat: bool = False,
        rows: int | None = None,
    ) -> None:
        """Ensure a live driver for ``session_id`` and mark it active.

        Spawns on first focus; reattaches if the tmux session outlived the app
        (persistence/reconnect); otherwise re-uses the live driver. ``new_chat``
        spawns the CLI fresh (no resume) — for a brand-new chat whose real
        rollout id the CLI mints itself.
        """
        cols = self._native_cols
        eff_rows = rows if rows is not None else DEFAULT_ROWS
        async with self._session_lock(session_id):
            driver = self._drivers.get(session_id)
            if driver is None:
                driver = build_driver(
                    provider,
                    session_id,
                    cwd,
                    model=model,
                    resume_uuid=resume_uuid,
                    fresh=new_chat,
                    on_chunk=self._make_on_chunk(session_id),
                    on_dead=self._make_on_dead(session_id),
                    rows=eff_rows,
                    cols=cols,
                )
                self._drivers[session_id] = driver
                self._providers[session_id] = provider
            if not driver.is_alive():
                # Reattach to a surviving tmux session, else spawn fresh.
                if hasattr(driver, "has_session") and await driver.has_session():
                    await driver.attach()  # type: ignore[attr-defined]
                else:
                    await driver.spawn(cols=cols, rows=eff_rows)
            self._active_session_id = session_id

    async def submit(self, session_id: str, content: str) -> None:
        async with self._session_lock(session_id):
            driver = self._drivers.get(session_id)
            if driver is None or not driver.is_alive():
                raise RuntimeError(f"no live driver for session {session_id}")
            await driver.send_text(content)

    async def write_raw_input(self, session_id: str, data: bytes) -> None:
        driver = self._drivers.get(session_id)
        if driver is None:
            raise RuntimeError(f"no driver for session {session_id}")
        await driver.write_input(data)

    async def resize(self, session_id: str, rows: int, cols: int) -> None:
        driver = self._drivers.get(session_id)
        if driver is None:
            raise RuntimeError(f"no driver for session {session_id}")
        await driver.resize(cols=cols, rows=rows)

    async def native_snapshot(self, session_id: str) -> dict[str, Any]:
        driver = self._drivers.get(session_id)
        if driver is None:
            raise RuntimeError(f"no driver for session {session_id}")
        self._active_session_id = session_id
        alive = driver.is_alive()
        if alive:
            state = await driver.capture_state()
        else:
            state = DriverState.DEAD
        native_state = _STATE_TO_NATIVE.get(state, "idle_chat_input")
        rows, cols = driver.dimensions()  # type: ignore[attr-defined]
        return encode_pty_snapshot(
            session_id=session_id,
            ring=driver.output_snapshot(),
            ring_complete=driver.output_snapshot_complete(),  # type: ignore[attr-defined]
            rows=rows,
            cols=cols,
            alive=alive,
            native_state=native_state,
            decoded_input_safe=(state == DriverState.IDLE),
        )

    def status(self, session_id: str) -> dict[str, Any]:
        driver = self._drivers.get(session_id)
        if driver is None:
            return {"alive": False, "provider": self._providers.get(session_id)}
        return {
            "alive": driver.is_alive(),
            "provider": self._providers.get(session_id),
            "backend": "tmux",
        }

    async def kill(self, session_id: str) -> None:
        async with self._session_lock(session_id):
            driver = self._drivers.pop(session_id, None)
            self._providers.pop(session_id, None)
            if self._active_session_id == session_id:
                self._active_session_id = None
        if driver is not None:
            await driver.kill()

    async def rekey(self, old_session_id: str, new_session_id: str) -> bool:
        """Re-key a live driver from a placeholder id to its real id, in place.

        Adopts the real Codex rollout UUID once codex creates it on the first
        message: the running tmux session is renamed and the driver moves to the
        new key, so a later focus(new_session_id) reuses the SAME live process
        (no respawn, no double-codex-on-one-rollout conflict). Returns True if a
        driver was re-keyed.
        """
        if old_session_id == new_session_id:
            return False
        async with self._session_lock(old_session_id):
            driver = self._drivers.pop(old_session_id, None)
            provider = self._providers.pop(old_session_id, None)
            if driver is None:
                return False
            if hasattr(driver, "rename"):
                await driver.rename(new_session_id)  # type: ignore[attr-defined]
            self._drivers[new_session_id] = driver
            if provider is not None:
                self._providers[new_session_id] = provider
            if self._active_session_id == old_session_id:
                self._active_session_id = new_session_id
        return True

    async def shutdown(self) -> None:
        for session_id in list(self._drivers.keys()):
            try:
                await self.kill(session_id)
            except Exception as exc:  # pragma: no cover — defensive
                _log.warning("driver: shutdown kill raised (%s): %s", session_id, exc)
