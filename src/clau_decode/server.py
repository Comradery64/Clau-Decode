"""FastAPI application — HTTP API + static file serving.

Contract (for Agent 2 to implement):
  create_app(config: AppConfig, db_path: Path) -> FastAPI
    - Mount /api routes
    - Mount static files at / (serves the built React app)
    - On startup: init DB schema, trigger first scan, start file watcher task

  Routes to implement:
    GET  /api/health                         → {"ok": true}
    GET  /api/config                         → AppConfig
    PUT  /api/config  (body: AppConfig)      → AppConfig  (saves + returns updated)
    GET  /api/projects                       → list[Project]
    GET  /api/projects/{project_id}/sessions → list[Session]
    GET  /api/sessions/{session_id}          → SessionDetail
    GET  /api/search?q=&project=&limit=      → list[SearchHit]
    GET  /api/stats                          → StatsResponse
    POST /api/refresh                        → {"ok": true}  (re-scans all paths)
    GET  /api/events                         → SSE stream (text/event-stream)
      — emits {"type": "refresh"} when a JSONL file changes

SOLID notes:
  - Dependency Inversion: routes receive Database as a FastAPI Depends, not import
  - Open/Closed: add routes without touching existing ones
  - server.py does not contain business logic — it delegates to db/scanner/parser
"""

from __future__ import annotations

import asyncio
import json
import subprocess
import sys
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles

from .analytics.cost import CostEngine
from .analytics.pricing import CachedPricingStrategy, _HARDCODED_RATES
from .analytics.service import TokenAnalyticsService as _AnalyticsSvc
from .config import save_config
from .db import Database
from .models import AppConfig
from .parser import parse_session
from .scanner import build_project_from_dir, scan_paths
from .watcher import watch_paths


def _sse_event_data(path: Path | str) -> str:
    """Serialize a file-change path to an SSE JSON payload.

    Extracted so tests can pin this exact contract: if the field names or types
    change here, the frontend's ``data.type === "refresh"`` check silently breaks.
    """
    return json.dumps({"type": "refresh", "path": str(path)})


def create_app(config: AppConfig, db_path: Path) -> FastAPI:
    """Build and return the FastAPI application instance.

    Wires together all subsystems:
      - Database initialisation and schema migration on startup.
      - Initial filesystem scan on startup.
      - Background file-watcher task that feeds the SSE event queue.
      - All /api/* routes.
      - Optional static file serving from ``src/clau_decode/static/`` (the built
        React frontend, if present).

    Args:
        config:   The runtime ``AppConfig`` (port, data_paths, theme, …).
        db_path:  Absolute path to the SQLite database file.

    Returns:
        A fully configured ``FastAPI`` application ready to hand to uvicorn.
    """
    # Mutable shared state captured by closures below.
    _state: dict = {"config": config}
    _analytics = _AnalyticsSvc()
    _pricing_strat = CachedPricingStrategy()
    _cost_engine = CostEngine(_pricing_strat)
    _watch_queue: asyncio.Queue = asyncio.Queue()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    async def do_scan(db: Database) -> None:
        """Scan all configured paths and upsert new / changed sessions into DB."""
        root_paths = [Path(p).expanduser() for p in _state["config"].data_paths]
        async for project, session_path in scan_paths(root_paths):
            current_mtime = session_path.stat().st_mtime
            stored_mtime = await db.get_session_mtime(session_path.stem)
            if stored_mtime == current_mtime:
                continue
            try:
                session, messages = parse_session(session_path)
                session.project_id = project.id
                project.session_count += 1
                await db.upsert_project(project)
                await db.upsert_session(session, file_mtime=current_mtime)
                await db.upsert_messages(messages)
            except Exception as exc:
                print(f"Warning: skipping {session_path}: {exc}")

    async def _scan_one(db: Database, session_path: Path) -> None:
        """Re-parse a single changed JSONL file and upsert it into the DB.

        Much faster than do_scan for live updates: one stat + one DB lookup
        instead of iterating every session file to find what changed.
        Path structure assumed: <root>/projects/<project-dir>/<session>.jsonl
        """
        if not session_path.exists() or session_path.suffix != ".jsonl":
            return
        try:
            project_dir = session_path.parent
            root_path = project_dir.parent.parent  # <root>/projects/<proj>/<session>
            project = build_project_from_dir(project_dir.name, str(root_path))
            current_mtime = session_path.stat().st_mtime
            stored_mtime = await db.get_session_mtime(session_path.stem)
            if stored_mtime == current_mtime:
                return
            session, messages = parse_session(session_path)
            session.project_id = project.id
            project.session_count += 1
            await db.upsert_project(project)
            await db.upsert_session(session, file_mtime=current_mtime)
            await db.upsert_messages(messages)
        except Exception as exc:
            print(f"Warning: skipping {session_path}: {exc}")

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with Database(db_path) as db:
            await db.init_schema()
            await db.reset_xml_title_mtimes()

        async def _background_scan() -> None:
            async with Database(db_path) as db:
                await do_scan(db)

        root_paths = [Path(p).expanduser() for p in _state["config"].data_paths]
        asyncio.create_task(_background_scan())
        asyncio.create_task(watch_paths(root_paths, _watch_queue))

        async def _refresh_pricing() -> None:
            await _pricing_strat.refresh()

        asyncio.create_task(_refresh_pricing())
        yield

    app = FastAPI(title="Clau-Decode", version="0.1.0", lifespan=lifespan)

    # ------------------------------------------------------------------
    # Routes
    # ------------------------------------------------------------------

    @app.get("/api/health")
    async def health():
        return {"ok": True}

    @app.get("/api/config")
    async def get_config():
        return _state["config"]

    @app.put("/api/config")
    async def update_config(new_config: AppConfig):
        _state["config"] = new_config
        save_config(new_config)
        return new_config

    @app.get("/api/projects")
    async def get_projects():
        async with Database(db_path) as db:
            return await db.get_projects()

    @app.get("/api/projects/{project_id}/sessions")
    async def get_project_sessions(project_id: str):
        async with Database(db_path) as db:
            return await db.get_sessions(project_id=project_id)

    @app.get("/api/sessions")
    async def get_all_sessions():
        async with Database(db_path) as db:
            return await db.get_sessions()

    @app.get("/api/sessions/{session_id}")
    async def get_session(session_id: str):
        async with Database(db_path) as db:
            # On-demand re-parse: if the JSONL file changed since last index
            # (e.g. server restarted before background scan reached this file),
            # re-parse now so the caller always sees fresh content.
            file_path_str = await db.get_session_file_path(session_id)
            if file_path_str:
                session_path = Path(file_path_str)
                await _scan_one(db, session_path)
            detail = await db.get_session_detail(session_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Session not found")
        return detail

    @app.get("/api/search")
    async def search(
        q: str = Query(..., min_length=1),
        project: str | None = Query(None),
        limit: int = Query(50, ge=1, le=200),
    ):
        async with Database(db_path) as db:
            return await db.search(q, project_id=project, limit=limit)

    @app.get("/api/stats")
    async def get_stats():
        async with Database(db_path) as db:
            stats = await db.get_stats()
        stats.data_paths = _state["config"].data_paths
        return stats

    @app.get("/api/analytics/sessions/{session_id}/tokens")
    async def get_session_tokens(session_id: str):
        async with Database(db_path) as db:
            detail = await db.get_session_detail(session_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Session not found")
        bd = _analytics.session_totals(detail.messages)
        return {
            "session_id": session_id,
            "input_tokens": bd.input_tokens,
            "output_tokens": bd.output_tokens,
            "cache_creation_tokens": bd.cache_creation_tokens,
            "cache_read_tokens": bd.cache_read_tokens,
            "total": bd.total,
        }

    @app.get("/api/analytics/sessions/{session_id}/prompts")
    async def get_session_prompts(session_id: str):
        async with Database(db_path) as db:
            detail = await db.get_session_detail(session_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Session not found")
        prompts = _analytics.prompt_breakdown(detail.messages)
        return [
            {
                "user_message_id": p.user_message_id,
                "assistant_message_id": p.assistant_message_id,
                "input_tokens": p.breakdown.input_tokens,
                "output_tokens": p.breakdown.output_tokens,
                "cache_creation_tokens": p.breakdown.cache_creation_tokens,
                "cache_read_tokens": p.breakdown.cache_read_tokens,
                "total": p.breakdown.total,
            }
            for p in prompts
        ]

    @app.get("/api/analytics/daily")
    async def get_daily_analytics():
        async with Database(db_path) as db:
            all_messages = await db.get_all_messages()
        buckets = _analytics.daily_buckets(all_messages)
        return [
            {
                "day": b.day.isoformat(),
                "input_tokens": b.breakdown.input_tokens,
                "output_tokens": b.breakdown.output_tokens,
                "cache_creation_tokens": b.breakdown.cache_creation_tokens,
                "cache_read_tokens": b.breakdown.cache_read_tokens,
                "total": b.breakdown.total,
                "prompt_count": b.prompt_count,
                "session_count": b.session_count,
            }
            for b in buckets
        ]

    @app.get("/api/analytics/sessions/{session_id}/cost")
    async def get_session_cost(session_id: str):
        async with Database(db_path) as db:
            detail = await db.get_session_detail(session_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Session not found")
        bd = _analytics.session_totals(detail.messages)
        model = detail.model or "unknown"
        cost = _cost_engine.compute(model, bd)
        pricing_source = "live" if _pricing_strat._cached_data else "hardcoded"
        return {
            "session_id": session_id,
            "model": model,
            "input_usd": float(cost.input_usd),
            "output_usd": float(cost.output_usd),
            "cache_write_usd": float(cost.cache_write_usd),
            "cache_read_usd": float(cost.cache_read_usd),
            "total_usd": float(cost.total_usd),
            "pricing_known": cost.pricing is not None,
            "pricing_source": pricing_source,
        }

    @app.get("/api/pricing")
    async def get_pricing_table():
        source = "live" if _pricing_strat._cached_data else "hardcoded"
        data = _pricing_strat._cached_data or _HARDCODED_RATES
        return {
            "source": source,
            "models": [
                {
                    "model": model,
                    "input_per_mtok": float(p.input_per_mtok),
                    "output_per_mtok": float(p.output_per_mtok),
                    "cache_write_per_mtok": float(p.cache_write_per_mtok),
                    "cache_read_per_mtok": float(p.cache_read_per_mtok),
                }
                for model, p in sorted(data.items())
            ],
        }

    @app.post("/api/sessions/{session_id}/reveal")
    async def reveal_session(session_id: str):
        """Reveal the session JSONL file in the OS file manager."""
        async with Database(db_path) as db:
            detail = await db.get_session_detail(session_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Session not found")
        file_path = Path(detail.file_path)
        if not file_path.exists():
            raise HTTPException(status_code=404, detail="File not found on disk")
        if sys.platform == "darwin":
            subprocess.Popen(["open", "-R", str(file_path)])
        elif sys.platform.startswith("linux"):
            subprocess.Popen(["xdg-open", str(file_path.parent)])
        else:
            subprocess.Popen(["explorer", "/select,", str(file_path)])
        return {"ok": True}

    @app.post("/api/refresh")
    async def refresh():
        async with Database(db_path) as db:
            await do_scan(db)
        return {"ok": True}

    @app.get("/api/events")
    async def events(request: Request):
        async def _wait_disconnect() -> None:
            # request.is_disconnected() is a NON-BLOCKING peek (uses a pre-cancelled
            # anyio scope) — it returns False immediately. To actually block until the
            # client disconnects we have to consume from request.receive() ourselves.
            while True:
                message = await request.receive()
                if message["type"] == "http.disconnect":
                    return

        async def generate():
            disconnect_task = asyncio.ensure_future(_wait_disconnect())
            try:
                while True:
                    queue_get = asyncio.ensure_future(_watch_queue.get())
                    try:
                        done, _ = await asyncio.wait(
                            {queue_get, disconnect_task},
                            timeout=30.0,
                            return_when=asyncio.FIRST_COMPLETED,
                        )
                    except Exception:
                        queue_get.cancel()
                        return
                    if disconnect_task in done:
                        queue_get.cancel()
                        return
                    if queue_get in done:
                        event = queue_get.result()
                        async with Database(db_path) as db:
                            await _scan_one(db, event.path)
                        yield f"data: {_sse_event_data(event.path)}\n\n"
                    else:
                        # Timeout — emit keepalive and poll again.
                        queue_get.cancel()
                        yield ": keepalive\n\n"
            finally:
                disconnect_task.cancel()

        return StreamingResponse(generate(), media_type="text/event-stream")

    # ------------------------------------------------------------------
    # Static frontend — must be registered LAST (catch-all route)
    # ------------------------------------------------------------------
    static_dir = Path(__file__).parent / "static"
    if static_dir.exists():
        # Hashed JS/CSS assets can be cached aggressively (immutable).
        # index.html must never be cached — its name has no content hash,
        # so browsers would serve stale bundles after a rebuild.
        from fastapi.responses import FileResponse as _FileResponse

        @app.get("/", include_in_schema=False)
        @app.get("/{full_path:path}", include_in_schema=False)
        async def _spa(full_path: str = ""):
            candidate = static_dir / full_path
            if full_path and candidate.exists() and candidate.is_file():
                return _FileResponse(str(candidate))
            index = static_dir / "index.html"
            return _FileResponse(
                str(index),
                headers={"Cache-Control": "no-cache, no-store, must-revalidate"},
            )

    return app


# ---------------------------------------------------------------------------
# Module-level app for `uvicorn clau_decode.server:app --reload`
# ---------------------------------------------------------------------------

def _build_default_app() -> FastAPI:
    from .config import get_db_path, load_config
    _config = load_config()
    _db_path = get_db_path()
    _db_path.parent.mkdir(parents=True, exist_ok=True)
    return create_app(_config, _db_path)


app = _build_default_app()
