"""Tests for the recap feature: DB layer + HTTP routes."""
from __future__ import annotations

import asyncio
import json
import os
import shutil
import stat
import tempfile
import time
from pathlib import Path
from typing import AsyncIterator

import pytest
from httpx import ASGITransport, AsyncClient

from clau_decode.db import Database
from clau_decode.models import AppConfig, Project, Session


FAKE = Path(__file__).parent / "fixtures" / "fake_claude.py"


# ---------------------------------------------------------------------------
# Helpers (mirror the patterns in test_server.py)
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
    session_id: str,
    cwd: str,
    file_path: str,
    is_fork: bool = False,
) -> None:
    async with Database(db_path) as db:
        await db.init_schema()
        project = Project(
            id="proj-rc",
            display_name="recap-test",
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


async def _client(app) -> AsyncClient:
    return AsyncClient(transport=ASGITransport(app=app), base_url="http://test")


@pytest.fixture
async def recap_env(tmp_path, monkeypatch) -> AsyncIterator[dict]:
    """Tmp DB + a real session + ``claude`` shim that emits a recap result."""
    db_path = tmp_path / "test.db"
    projects = tmp_path / "root" / ".claude" / "projects" / "-runtime"
    projects.mkdir(parents=True)
    session_id = "22222222-3333-4444-5555-666666666666"
    file_path = projects / f"{session_id}.jsonl"
    file_path.write_text("")
    cwd = tmp_path / "cwd"
    cwd.mkdir()
    bin_dir = tmp_path / "bin"
    bin_dir.mkdir()
    _write_shim(bin_dir, extra_argv="--recap-mode --recap-text bullet-recap")
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


# ---------------------------------------------------------------------------
# DB tests
# ---------------------------------------------------------------------------

async def test_db_recap_insert_and_list_roundtrip(tmp_path):
    db_path = tmp_path / "db.sqlite"
    async with Database(db_path) as db:
        await db.init_schema()
        rid1 = await db.insert_recap("sess-1", "first recap", "msg-aaa")
        rid2 = await db.insert_recap("sess-1", "second recap", "msg-bbb")
        rid_other = await db.insert_recap("sess-2", "other", None)
        assert rid1 != rid2

        rows = await db.list_recaps("sess-1")
        assert [r["id"] for r in rows] == [rid1, rid2]  # oldest → newest
        assert rows[0]["text"] == "first recap"
        assert rows[0]["covers_until_message_uuid"] == "msg-aaa"
        assert rows[0]["dismissed"] is False
        assert rows[0]["session_id"] == "sess-1"

        other_rows = await db.list_recaps("sess-2")
        assert len(other_rows) == 1
        assert other_rows[0]["id"] == rid_other
        assert other_rows[0]["covers_until_message_uuid"] is None


async def test_db_recap_dismiss(tmp_path):
    db_path = tmp_path / "db.sqlite"
    async with Database(db_path) as db:
        await db.init_schema()
        rid = await db.insert_recap("sess-1", "to be dismissed", None)
        assert await db.dismiss_recap(rid) is True
        # Idempotent: dismissing missing row returns False
        assert await db.dismiss_recap(99999) is False
        # Default list excludes dismissed
        assert await db.list_recaps("sess-1") == []
        # Including dismissed brings it back
        rows = await db.list_recaps("sess-1", include_dismissed=True)
        assert len(rows) == 1
        assert rows[0]["dismissed"] is True


# ---------------------------------------------------------------------------
# Endpoint: POST /api/sessions/{id}/recap
# ---------------------------------------------------------------------------

async def test_recap_endpoint_generates_and_stores(recap_env):
    e = recap_env
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(f"/api/sessions/{e['session_id']}/recap")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["text"] == "bullet-recap"
    assert body["session_id"] == e["session_id"]
    assert body["dismissed"] is False
    assert "id" in body
    assert "created_at" in body

    # Stored — visible via the list endpoint
    async with await _client(app) as c:
        r2 = await c.get(f"/api/sessions/{e['session_id']}/recaps")
    assert r2.status_code == 200
    rows = r2.json()
    assert len(rows) == 1
    assert rows[0]["text"] == "bullet-recap"


async def test_recap_endpoint_rejects_fork_session(recap_env):
    e = recap_env
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
        r = await c.post(f"/api/sessions/{e['session_id']}/recap")
    assert r.status_code == 422
    assert "fork" in r.json()["detail"].lower()


async def test_recap_endpoint_503_when_bin_missing(recap_env, monkeypatch):
    e = recap_env
    monkeypatch.setenv("PATH", "/nonexistent-dir")
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(f"/api/sessions/{e['session_id']}/recap")
    assert r.status_code == 503


# ---------------------------------------------------------------------------
# Endpoint: GET /api/sessions/{id}/recaps
# ---------------------------------------------------------------------------

async def test_list_recaps_excludes_dismissed_by_default(recap_env):
    e = recap_env
    async with Database(e["db_path"]) as db:
        keep = await db.insert_recap(e["session_id"], "keeper", "uuid-1")
        gone = await db.insert_recap(e["session_id"], "dismissed", "uuid-2")
        await db.dismiss_recap(gone)
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.get(f"/api/sessions/{e['session_id']}/recaps")
    assert r.status_code == 200
    rows = r.json()
    assert [row["id"] for row in rows] == [keep]
    assert all(row["dismissed"] is False for row in rows)


async def test_list_recaps_includes_when_flagged(recap_env):
    e = recap_env
    async with Database(e["db_path"]) as db:
        keep = await db.insert_recap(e["session_id"], "keeper", "uuid-1")
        gone = await db.insert_recap(e["session_id"], "dismissed", "uuid-2")
        await db.dismiss_recap(gone)
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.get(
            f"/api/sessions/{e['session_id']}/recaps",
            params={"include_dismissed": "true"},
        )
    assert r.status_code == 200
    rows = r.json()
    ids = [row["id"] for row in rows]
    assert keep in ids and gone in ids
    flags = {row["id"]: row["dismissed"] for row in rows}
    assert flags[gone] is True
    assert flags[keep] is False


# ---------------------------------------------------------------------------
# Endpoint: POST /api/sessions/{id}/recaps/{recap_id}/dismiss
# ---------------------------------------------------------------------------

async def test_dismiss_endpoint_404_when_missing(recap_env):
    e = recap_env
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/recaps/99999/dismiss"
        )
    assert r.status_code == 404


async def test_dismiss_endpoint_happy_path(recap_env):
    e = recap_env
    async with Database(e["db_path"]) as db:
        rid = await db.insert_recap(e["session_id"], "dismiss me", None)
    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(
            f"/api/sessions/{e['session_id']}/recaps/{rid}/dismiss"
        )
    assert r.status_code == 200
    assert r.json() == {"ok": True, "dismissed": True}


# ---------------------------------------------------------------------------
# Argv verification — recap uses --model haiku + --fork-session + --no-session-persistence
# ---------------------------------------------------------------------------

async def test_recap_uses_haiku_in_argv(recap_env, monkeypatch):
    e = recap_env
    capture = e["bin_dir"].parent / "recap_argv.json"
    bin_dir2 = e["bin_dir"].parent / "bin_capture_recap"
    bin_dir2.mkdir()
    _write_shim(
        bin_dir2,
        extra_argv=f"--capture-argv {capture} --recap-mode --recap-text captured",
    )
    monkeypatch.setenv("PATH", f"{bin_dir2}{os.pathsep}{os.environ['PATH']}")

    app = _make_app(e["db_path"], AppConfig())
    async with await _client(app) as c:
        r = await c.post(f"/api/sessions/{e['session_id']}/recap")
    assert r.status_code == 200, r.text

    deadline = time.monotonic() + 5.0
    while not capture.exists() and time.monotonic() < deadline:
        await asyncio.sleep(0.02)
    assert capture.exists(), "fake_claude never wrote argv capture file"
    argv = json.loads(capture.read_text())
    assert "--model" in argv
    assert argv[argv.index("--model") + 1] == "haiku"
    assert "--fork-session" in argv
    assert "--no-session-persistence" in argv
    # Recap must not use --input-format stream-json (per the verified contract).
    assert "--input-format" not in argv
