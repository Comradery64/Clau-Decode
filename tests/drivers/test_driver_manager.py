"""Phase 4b — DriverManager lifecycle against the deterministic fake CLI.

Gated on a real tmux; uses fake_cli.py (no codex auth/network). Verifies the
manager owns drivers, fans output onto the bus, serves Native snapshots, and —
critically — has NO idle reaper (tmux-backed sessions survive idle).
"""

from __future__ import annotations

import asyncio
import base64
import os
import sys
import uuid

import pytest

from clau_decode.db import Database
from clau_decode.driver_manager import DriverManager
from clau_decode.drivers import TmuxDriver
from clau_decode.events_bus import EventBroadcaster
from clau_decode import driver_manager as dm_mod

import shutil

requires_tmux = pytest.mark.skipif(
    shutil.which("tmux") is None, reason="tmux not on PATH"
)

FAKE_CLI = os.path.join(os.path.dirname(__file__), "fake_cli.py")


def _patch_fake_build(monkeypatch):
    """Make DriverManager build TmuxDrivers wired to the fake CLI."""

    def _build(provider, session_id, cwd, *, model=None, resume_uuid=None, **kw):
        return TmuxDriver(
            session_id,
            cwd,
            [sys.executable, FAKE_CLI],
            socket_name=f"clau-decode-dm-{uuid.uuid4().hex[:8]}",
            **kw,
        )

    monkeypatch.setattr(dm_mod, "build_driver", _build)


async def _make_manager(tmp_path) -> tuple[DriverManager, EventBroadcaster, Database]:
    db = await Database(tmp_path / "dm.db").__aenter__()
    await db.init_schema()
    bus = EventBroadcaster()
    return DriverManager(db, bus), bus, db


@requires_tmux
async def test_focus_spawns_and_tracks(tmp_path, monkeypatch):
    _patch_fake_build(monkeypatch)
    dm, _bus, db = await _make_manager(tmp_path)
    sid = "codex-1"
    try:
        await dm.focus(sid, provider="codex", cwd=os.getcwd())
        assert dm.has(sid)
        assert dm.is_alive(sid)
        assert dm.status(sid)["alive"] is True
        assert dm.status(sid)["backend"] == "tmux"
    finally:
        await dm.shutdown()
        await db.__aexit__(None, None, None)
    assert not dm.is_alive(sid)


@requires_tmux
async def test_native_snapshot_carries_ring_and_state(tmp_path, monkeypatch):
    _patch_fake_build(monkeypatch)
    dm, _bus, db = await _make_manager(tmp_path)
    sid = "codex-2"
    try:
        await dm.focus(sid, provider="codex", cwd=os.getcwd())
        snap = None
        for _ in range(40):
            snap = await dm.native_snapshot(sid)
            ring = base64.b64decode(snap["ring_b64"])
            if b"Context 100% left" in ring:
                break
            await asyncio.sleep(0.1)
        assert snap is not None
        assert snap["alive"] is True
        assert b"Context 100% left" in base64.b64decode(snap["ring_b64"])
        # Idle composer → native_state maps to the FE's idle vocabulary.
        assert snap["native_state"] in ("idle_chat_input", "running")
    finally:
        await dm.shutdown()
        await db.__aexit__(None, None, None)


@requires_tmux
async def test_output_fans_out_to_bus_for_active_session(tmp_path, monkeypatch):
    _patch_fake_build(monkeypatch)
    dm, bus, db = await _make_manager(tmp_path)
    q = bus.subscribe()
    sid = "codex-3"
    try:
        await dm.focus(sid, provider="codex", cwd=os.getcwd())
        got_chunk = False
        for _ in range(40):
            try:
                ev = q.get_nowait()
            except asyncio.QueueEmpty:
                await asyncio.sleep(0.1)
                continue
            if ev.get("type") == "pty_output_chunk" and ev.get("session_id") == sid:
                got_chunk = True
                break
        assert got_chunk, "expected pty_output_chunk on the bus for active session"
    finally:
        bus.unsubscribe(q)
        await dm.shutdown()
        await db.__aexit__(None, None, None)


@requires_tmux
async def test_submit_drives_the_session(tmp_path, monkeypatch):
    _patch_fake_build(monkeypatch)
    dm, _bus, db = await _make_manager(tmp_path)
    sid = "codex-4"
    try:
        await dm.focus(sid, provider="codex", cwd=os.getcwd())
        # Let the fake reach idle, then submit; the fake echoes "reply: <text>".
        await asyncio.sleep(1.0)
        await dm.submit(sid, "ping123")
        echoed = False
        for _ in range(60):
            snap = await dm.native_snapshot(sid)
            if b"reply: ping123" in base64.b64decode(snap["ring_b64"]):
                echoed = True
                break
            await asyncio.sleep(0.1)
        assert echoed
    finally:
        await dm.shutdown()
        await db.__aexit__(None, None, None)


@requires_tmux
async def test_no_idle_reaper_session_survives_idle(tmp_path, monkeypatch):
    """The whole point of the tmux backend: a focused-then-idle session is NOT
    killed. DriverManager has no idle timer, so it must still be alive after a
    quiet period far longer than the old 5-minute Claude reaper would model."""
    _patch_fake_build(monkeypatch)
    dm, _bus, db = await _make_manager(tmp_path)
    sid = "codex-5"
    try:
        await dm.focus(sid, provider="codex", cwd=os.getcwd())
        assert dm.is_alive(sid)
        await asyncio.sleep(1.5)  # idle; nothing should reap it
        assert dm.is_alive(sid), "driver session was killed while idle — regression"
        # No idle-timer bookkeeping exists on the manager at all.
        assert not hasattr(dm, "_idle_kill_handle")
        assert not hasattr(dm, "_on_idle_kill")
    finally:
        await dm.shutdown()
        await db.__aexit__(None, None, None)


@requires_tmux
async def test_kill_removes_tracking(tmp_path, monkeypatch):
    _patch_fake_build(monkeypatch)
    dm, _bus, db = await _make_manager(tmp_path)
    sid = "codex-6"
    try:
        await dm.focus(sid, provider="codex", cwd=os.getcwd())
        await dm.kill(sid)
        assert not dm.has(sid)
        assert not dm.is_alive(sid)
        # Double kill is safe.
        await dm.kill(sid)
    finally:
        await dm.shutdown()
        await db.__aexit__(None, None, None)
