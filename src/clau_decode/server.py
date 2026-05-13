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
import shutil
import subprocess
import sys
from collections import OrderedDict
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import Response, StreamingResponse

from pydantic import BaseModel, Field

from .analytics.cost import CostEngine
from .claude_runner import ClaudeCodeRunner
from .analytics.pricing import CachedPricingStrategy, _HARDCODED_RATES
from .analytics.service import TokenAnalyticsService as _AnalyticsSvc
from .analytics.stats import (
    FileTouchScanner,
    ModelUsageScanner,
    PromptStatsScanner,
    ToolUsageScanner,
)
from .analytics.tips import (
    LowCacheHitRule,
    OversizedToolResultRule,
    RepeatedFileReadRule,
    TipRegistry,
)
from .config import save_config
from .db import Database
from .editor import swap_session
from .models import AppConfig, Profile
from .parser import parse_session
from .reporter import export_json, export_markdown
from .scanner import build_project_from_dir, scan_paths
from .watcher import watch_paths


def _sse_event_data(path: Path | str) -> str:
    """Serialize a file-change path to an SSE JSON payload.

    Extracted so tests can pin this exact contract: if the field names or types
    change here, the frontend's ``data.type === "refresh"`` check silently breaks.
    """
    return json.dumps({"type": "refresh", "path": str(path)})


def _derive_bin_name(file_path: str) -> str:
    """Walk up from a session's JSONL file_path to find the claude binary name.

    ~/.claude/projects/... → .claude → claude
    ~/.cc-mirror/zai/config/projects/... → zai
    """
    parts = Path(file_path).parts
    for i, p in enumerate(parts):
        if p == "projects":
            j = i - 1
            while j >= 0 and parts[j] == "config":
                j -= 1
            if j >= 0:
                return parts[j].lstrip(".")
            break
    return "claude"


class _MessageContentUpdate(BaseModel):
    content_blocks: list[dict]


class _CreateProfileRequest(BaseModel):
    name: str
    data_paths: list[str] = Field(default_factory=list)
    color: str = "#e9733a"


class _UpdateProfileRequest(BaseModel):
    name: str | None = None
    data_paths: list[str] | None = None
    color: str | None = None


class _SetActiveProfileRequest(BaseModel):
    active_profile_id: str | None = None


class _SendMessageRequest(BaseModel):
    message: str
    permission_mode: str | None = None


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
    _state: dict = {"config": config, "watch_task": None}
    _analytics = _AnalyticsSvc()
    _pricing_strat = CachedPricingStrategy()
    _cost_engine = CostEngine(_pricing_strat)
    _watch_queue: asyncio.Queue = asyncio.Queue()
    _runner = ClaudeCodeRunner()

    # ------------------------------------------------------------------
    # Internal helpers
    # ------------------------------------------------------------------

    def _all_scan_roots() -> list[Path]:
        """User-configured paths."""
        return [Path(p).expanduser() for p in _state["config"].get_all_scan_paths()]

    async def do_scan(db: Database) -> None:
        """Scan all configured paths and upsert new / changed sessions into DB."""
        MAX_SCAN_SIZE = 20 * 1024 * 1024  # skip files > 20 MB; loaded on demand instead
        root_paths = _all_scan_roots()
        async for project, session_path in scan_paths(root_paths):
            current_mtime = session_path.stat().st_mtime
            stored_mtime = await db.get_session_mtime(session_path.stem)
            if stored_mtime == current_mtime:
                continue
            try:
                file_size = session_path.stat().st_size
                if file_size > MAX_SCAN_SIZE:
                    # Store just the session metadata so it appears in the list;
                    # messages are loaded on demand via _scan_one when clicked.
                    if stored_mtime is None:
                        session, _ = await asyncio.to_thread(
                            parse_session, session_path
                        )
                        session.project_id = project.id
                        session.message_count = 0
                        project.session_count += 1
                        await db.upsert_project(project)
                        await db.upsert_session(session, file_mtime=current_mtime)
                    continue
                session, messages = await asyncio.to_thread(parse_session, session_path)
                session.project_id = project.id
                project.session_count += 1
                await db.upsert_project(project)
                await db.upsert_session(session, file_mtime=current_mtime)
                await db.upsert_messages(messages)
                await asyncio.sleep(0)
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
            session, messages = await asyncio.to_thread(parse_session, session_path)
            session.project_id = project.id
            project.session_count += 1
            await db.upsert_project(project)
            await db.upsert_session(session, file_mtime=current_mtime)
            await db.upsert_messages(messages)
        except Exception as exc:
            print(f"Warning: skipping {session_path}: {exc}")

    async def _rescan_and_rewatch() -> None:
        """Rescan all paths and restart the watcher with updated paths."""
        # Cancel existing watcher
        old_task = _state.get("watch_task")
        if old_task and not old_task.done():
            old_task.cancel()
        # Rescan
        async with Database(db_path) as db:
            await do_scan(db)
        # Restart watcher with current paths.
        _state["watch_task"] = asyncio.create_task(
            watch_paths(_all_scan_roots(), _watch_queue)
        )

    # ------------------------------------------------------------------
    # Lifecycle
    # ------------------------------------------------------------------

    @asynccontextmanager
    async def lifespan(app: FastAPI):
        async with Database(db_path) as db:
            await db.init_schema()
            await db.reset_xml_title_mtimes()
            await db.migrate_project_id_v2()

        async def _background_scan() -> None:
            async with Database(db_path) as db:
                await do_scan(db)

        asyncio.create_task(_background_scan())
        _state["watch_task"] = asyncio.create_task(
            watch_paths(_all_scan_roots(), _watch_queue)
        )

        async def _refresh_pricing() -> None:
            await _pricing_strat.refresh()

        asyncio.create_task(_refresh_pricing())
        try:
            yield
        finally:
            await _runner.shutdown()

    app = FastAPI(title="Clau-Decode", version="0.1.0", lifespan=lifespan)
    # Session-detail responses are megabytes of JSON for old chats; gzip cuts
    # transfer time by ~10x. minimum_size avoids overhead for tiny payloads.
    app.add_middleware(GZipMiddleware, minimum_size=1024)

    # LRU cache of pre-serialized SessionDetail responses, keyed by session id
    # with file mtime as the validation token. A hit skips the SQL fetch,
    # JSON parse, Pydantic round-trip, and re-serialization entirely.
    _detail_cache: "OrderedDict[str, tuple[float, bytes]]" = OrderedDict()
    _DETAIL_CACHE_MAX = 4

    def _invalidate_detail_cache(session_id: str) -> None:
        _detail_cache.pop(session_id, None)

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

    # ------------------------------------------------------------------
    # Profiles
    # ------------------------------------------------------------------

    @app.get("/api/profiles")
    async def get_profiles():
        return {
            "profiles": [p.model_dump() for p in _state["config"].profiles],
            "active_profile_id": _state["config"].active_profile_id,
        }

    @app.post("/api/profiles")
    async def create_profile(req: _CreateProfileRequest):
        cfg = _state["config"]
        if not cfg.profiles:
            cfg.profiles.insert(
                0,
                Profile(
                    name="Default",
                    data_paths=cfg.data_paths,
                    color="#6b7280",
                ),
            )
        profile = Profile(
            name=req.name, data_paths=req.data_paths or ["~/.claude"], color=req.color
        )
        cfg.profiles.append(profile)
        save_config(cfg)
        asyncio.create_task(_rescan_and_rewatch())
        return profile.model_dump()

    @app.put("/api/profiles/active")
    async def set_active_profile(req: _SetActiveProfileRequest):
        _state["config"].active_profile_id = req.active_profile_id
        save_config(_state["config"])
        return {"active_profile_id": req.active_profile_id}

    @app.put("/api/profiles/{profile_id}")
    async def update_profile(profile_id: str, req: _UpdateProfileRequest):
        cfg = _state["config"]
        for p in cfg.profiles:
            if p.id == profile_id:
                if req.name is not None:
                    p.name = req.name
                if req.data_paths is not None:
                    p.data_paths = req.data_paths
                if req.color is not None:
                    p.color = req.color
                save_config(cfg)
                asyncio.create_task(_rescan_and_rewatch())
                return p.model_dump()
        raise HTTPException(404, "Profile not found")

    @app.delete("/api/profiles/{profile_id}")
    async def delete_profile(profile_id: str):
        cfg = _state["config"]
        cfg.profiles = [p for p in cfg.profiles if p.id != profile_id]
        if cfg.active_profile_id == profile_id:
            cfg.active_profile_id = None
        save_config(cfg)
        return {"ok": True}

    @app.get("/api/projects")
    async def get_projects():
        data_sources = _state["config"].get_active_data_sources()
        async with Database(db_path) as db:
            return await db.get_projects(data_sources=data_sources)

    @app.get("/api/projects/{project_id}/sessions")
    async def get_project_sessions(project_id: str):
        data_sources = _state["config"].get_active_data_sources()
        async with Database(db_path) as db:
            return await db.get_sessions(
                project_id=project_id, data_sources=data_sources
            )

    @app.get("/api/sessions")
    async def get_all_sessions():
        data_sources = _state["config"].get_active_data_sources()
        async with Database(db_path) as db:
            return await db.get_sessions(data_sources=data_sources)

    @app.get("/api/sessions/{session_id}")
    async def get_session(
        session_id: str, limit: int | None = Query(None, ge=1, le=5000)
    ):
        async with Database(db_path) as db:
            # On-demand re-parse: if the JSONL file changed since last index
            # (e.g. server restarted before background scan reached this file),
            # re-parse now so the caller always sees fresh content.
            file_path_str = await db.get_session_file_path(session_id)
            current_mtime: float | None = None
            if file_path_str:
                session_path = Path(file_path_str)
                await _scan_one(db, session_path)
                try:
                    current_mtime = session_path.stat().st_mtime
                except OSError:
                    current_mtime = None

            # Cache hit: skip the SQL+parse+serialize path entirely.
            if limit is None and current_mtime is not None:
                hit = _detail_cache.get(session_id)
                if hit is not None and hit[0] == current_mtime:
                    _detail_cache.move_to_end(session_id)
                    return Response(content=hit[1], media_type="application/json")

            # Hot path (no limit): bypass Pydantic — embed stored content_json /
            # usage_json strings directly into the response.
            if limit is None:
                body = await db.get_session_detail_json_bytes(session_id)
                if body is None:
                    raise HTTPException(status_code=404, detail="Session not found")
                if current_mtime is not None:
                    _detail_cache[session_id] = (current_mtime, body)
                    _detail_cache.move_to_end(session_id)
                    while len(_detail_cache) > _DETAIL_CACHE_MAX:
                        _detail_cache.popitem(last=False)
                return Response(content=body, media_type="application/json")

            # Slow path (limited): Pydantic round-trip is fine for small payloads.
            detail = await db.get_session_detail(session_id, message_limit=limit)

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

    @app.get("/api/dashboard")
    async def get_dashboard():
        data_sources = _state["config"].get_active_data_sources()
        async with Database(db_path) as db:
            projects = await db.get_projects(data_sources)
            sessions = await db.get_sessions(data_sources=data_sources)
            stats = await db.get_stats()

            # Only load messages for the 10 most recent sessions
            recent = sessions[:10]
            recent_data: list[dict] = []
            all_recent_prompts: list = []
            all_recent_msgs: list = []
            for s in recent:
                detail = await db.get_session_detail(s.id)
                session_msgs = detail.messages if detail else []
                models_used = list(
                    dict.fromkeys(
                        m.model
                        for m in session_msgs
                        if m.model and m.role == "assistant"
                    )
                )
                prompts = _analytics.prompt_breakdown(session_msgs)
                multi = _cost_engine.compute_multi(prompts)
                all_recent_prompts.extend(prompts)
                all_recent_msgs.extend(session_msgs)
                recent_data.append(
                    {
                        "id": s.id,
                        "title": s.title,
                        "project_id": s.project_id,
                        "models": models_used,
                        "message_count": s.message_count,
                        "total_usd": float(multi.total_usd),
                        "updated_at": s.updated_at.isoformat()
                        if s.updated_at
                        else None,
                        "last_message_role": s.last_message_role,
                    }
                )

        # Global stats from recent sessions only (fast)
        model_usage = ModelUsageScanner().scan(all_recent_msgs)
        tip_registry = TipRegistry()
        tip_registry.register(RepeatedFileReadRule())
        tip_registry.register(OversizedToolResultRule())
        tip_registry.register(LowCacheHitRule())
        tips = tip_registry.run(all_recent_msgs)[:3]

        recent_cost = _cost_engine.compute_multi(all_recent_prompts)

        project_data = [
            {
                "id": p.id,
                "display_name": p.display_name,
                "session_count": p.session_count,
                "last_activity_at": p.last_activity_at.isoformat()
                if p.last_activity_at
                else None,
            }
            for p in projects
        ]

        return {
            "recent_sessions": recent_data,
            "projects": project_data,
            "model_usage": model_usage,
            "total_cost_usd": float(recent_cost.total_usd),
            "total_sessions": stats.total_sessions,
            "total_messages": stats.total_messages,
            "tips": [
                {
                    "rule_id": t.rule_id,
                    "severity": t.severity,
                    "title": t.title,
                    "detail": t.detail,
                }
                for t in tips
            ],
        }

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
        prompts = _analytics.prompt_breakdown(detail.messages)
        multi = _cost_engine.compute_multi(prompts)
        pricing_source = "live" if _pricing_strat._cached_data else "hardcoded"
        return {
            "session_id": session_id,
            "models": [
                {
                    "model": c.model,
                    "input_usd": float(c.input_usd),
                    "output_usd": float(c.output_usd),
                    "cache_write_usd": float(c.cache_write_usd),
                    "cache_read_usd": float(c.cache_read_usd),
                    "total_usd": float(c.total_usd),
                    "pricing_known": c.pricing is not None,
                }
                for c in multi.models
            ],
            "total_usd": float(multi.total_usd),
            "pricing_known": any(c.pricing is not None for c in multi.models),
            "pricing_source": pricing_source,
        }

    @app.get("/api/analytics/stats")
    async def get_prompt_stats():
        async with Database(db_path) as db:
            all_messages = await db.get_all_messages()
        return PromptStatsScanner().scan(all_messages)

    @app.get("/api/analytics/models")
    async def get_model_usage():
        async with Database(db_path) as db:
            all_messages = await db.get_all_messages()
        return ModelUsageScanner().scan(all_messages)

    @app.get("/api/analytics/tools")
    async def get_tool_usage():
        async with Database(db_path) as db:
            all_messages = await db.get_all_messages()
        return ToolUsageScanner().scan(all_messages)

    @app.get("/api/analytics/files")
    async def get_file_touches():
        async with Database(db_path) as db:
            all_messages = await db.get_all_messages()
        return FileTouchScanner().scan(all_messages)

    @app.get("/api/analytics/tips")
    async def get_tips():
        async with Database(db_path) as db:
            all_messages = await db.get_all_messages()
        registry = TipRegistry()
        registry.register(RepeatedFileReadRule())
        registry.register(OversizedToolResultRule())
        registry.register(LowCacheHitRule())
        tips = registry.run(all_messages)
        return [
            {
                "rule_id": t.rule_id,
                "severity": t.severity,
                "title": t.title,
                "detail": t.detail,
                "evidence": t.evidence,
            }
            for t in tips
        ]

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

    # ------------------------------------------------------------------
    # Export routes (Phase 7)
    # ------------------------------------------------------------------

    @app.get("/api/sessions/{session_id}/export")
    async def export_session(session_id: str, format: str = Query("json")):
        if format not in ("json", "md"):
            raise HTTPException(status_code=400, detail="format must be 'json' or 'md'")
        async with Database(db_path) as db:
            detail = await db.get_session_detail(session_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Session not found")

        bd = _analytics.session_totals(detail.messages)
        model = detail.model or "unknown"
        cost = _cost_engine.compute(model, bd)
        prompts = _analytics.prompt_breakdown(detail.messages)
        prompts_dicts = [
            {
                "user_message_id": p.user_message_id,
                "assistant_message_id": p.assistant_message_id,
                "breakdown": {
                    "input_tokens": p.breakdown.input_tokens,
                    "output_tokens": p.breakdown.output_tokens,
                    "cache_creation_tokens": p.breakdown.cache_creation_tokens,
                    "cache_read_tokens": p.breakdown.cache_read_tokens,
                    "total": p.breakdown.total,
                },
            }
            for p in prompts
        ]

        if format == "json":
            data = export_json(detail, cost=cost, prompts=prompts_dicts)
            import json as _json

            slug = (detail.title or detail.id).replace(" ", "_").lower()
            return Response(
                content=_json.dumps(data, indent=2),
                media_type="application/json",
                headers={"Content-Disposition": f'attachment; filename="{slug}.json"'},
            )
        else:
            pricing = _pricing_strat.get_pricing(model)
            md = export_markdown(
                detail, cost=cost, prompts=prompts_dicts, pricing=pricing
            )
            slug = (detail.title or detail.id).replace(" ", "_").lower()
            return Response(
                content=md,
                media_type="text/markdown",
                headers={"Content-Disposition": f'attachment; filename="{slug}.md"'},
            )

    # -----------------------------------------------------------------------
    # Mutation guard (Phase 6)
    # -----------------------------------------------------------------------

    def _require_edit() -> None:
        if not _state["config"].edit_enabled:
            raise HTTPException(
                status_code=403,
                detail="Editing is disabled. Set edit_enabled: true in settings to enable.",
            )

    # -----------------------------------------------------------------------
    # Message mutation routes (Phase 6)
    # -----------------------------------------------------------------------

    @app.delete("/api/messages/{message_id}")
    async def delete_message_route(message_id: str):
        _require_edit()
        async with Database(db_path) as db:
            info = await db.get_session_info_for_message(message_id)
            if info is None:
                raise HTTPException(status_code=404, detail="Message not found")
            session_id, file_path = info
            path = Path(file_path)
            if not path.exists():
                raise HTTPException(
                    status_code=404, detail="Session file not found on disk"
                )
            edited_path, _, backup_path, _ = swap_session(
                path, session_id, delete_uuid=message_id
            )
            await db.delete_session_messages(session_id)
            await _scan_one(db, edited_path)
            await _scan_one(db, backup_path)
        return {"ok": True, "session_id": session_id}

    @app.patch("/api/messages/{message_id}")
    async def patch_message_route(message_id: str, body: _MessageContentUpdate):
        _require_edit()
        async with Database(db_path) as db:
            info = await db.get_session_info_for_message(message_id)
            if info is None:
                raise HTTPException(status_code=404, detail="Message not found")
            session_id, file_path = info
            path = Path(file_path)
            if not path.exists():
                raise HTTPException(
                    status_code=404, detail="Session file not found on disk"
                )
            edited_path, _, backup_path, _ = swap_session(
                path, session_id, edit_uuid=message_id, new_content=body.content_blocks
            )
            await db.delete_session_messages(session_id)
            await _scan_one(db, edited_path)
            await _scan_one(db, backup_path)
        return {"ok": True, "session_id": session_id}

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

    @app.post("/api/sessions/{session_id}/open-terminal")
    async def open_terminal(session_id: str):
        """Open a new Terminal.app window at the session's cwd and run <binary> -r."""
        async with Database(db_path) as db:
            detail = await db.get_session_detail(session_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Session not found")
        cwd = detail.cwd
        if not cwd:
            cwd = str(Path(detail.file_path).parent)
        if not Path(cwd).is_dir():
            raise HTTPException(status_code=404, detail=f"Directory not found: {cwd}")
        bin_name = _derive_bin_name(detail.file_path)
        if sys.platform == "darwin":
            subprocess.Popen(
                [
                    "osascript",
                    "-e",
                    f'tell application "Terminal"\n'
                    f"  activate\n"
                    f'  do script "cd {cwd} && {bin_name} -r {session_id}"\n'
                    f"end tell",
                ]
            )
        elif sys.platform.startswith("linux"):
            for term in ["gnome-terminal", "konsole", "xfce4-terminal"]:
                if shutil.which(term):
                    subprocess.Popen(
                        [
                            term,
                            "--",
                            "bash",
                            "-c",
                            f"cd {cwd} && {bin_name} -r {session_id}; exec bash",
                        ]
                    )
                    break
            else:
                subprocess.Popen(
                    [
                        "x-terminal-emulator",
                        "-e",
                        "bash",
                        "-c",
                        f"cd {cwd} && {bin_name} -r {session_id}; exec bash",
                    ]
                )
        else:
            subprocess.Popen(
                [
                    "cmd",
                    "/c",
                    "start",
                    "cmd",
                    "/k",
                    f"cd /d {cwd} && {bin_name} -r {session_id}",
                ]
            )
        return {"ok": True}

    # -----------------------------------------------------------------------
    # Headless runner — send/stop/status
    # -----------------------------------------------------------------------

    @app.post("/api/sessions/{session_id}/send-message")
    async def send_message(session_id: str, req: _SendMessageRequest):
        text = req.message.strip()
        if not text:
            raise HTTPException(status_code=422, detail="message must not be empty")
        async with Database(db_path) as db:
            detail = await db.get_session_detail(session_id)
        if detail is None:
            raise HTTPException(status_code=404, detail="Session not found")
        if detail.is_fork:
            raise HTTPException(
                status_code=422,
                detail="fork sessions are not valid --resume targets",
            )
        if _runner.is_busy(session_id):
            raise HTTPException(status_code=409, detail="session is busy")
        cwd = detail.cwd or str(Path(detail.file_path).parent)
        if not Path(cwd).is_dir():
            raise HTTPException(status_code=404, detail=f"Directory not found: {cwd}")
        bin_name = _derive_bin_name(detail.file_path)
        if shutil.which(bin_name) is None:
            raise HTTPException(
                status_code=503,
                detail=f"{bin_name} not found on PATH",
            )
        permission_mode = (
            req.permission_mode
            or _state["config"].claude_default_permission_mode
            or "dontAsk"
        )
        result = await _runner.submit(
            session_id,
            cwd=cwd,
            bin_name=bin_name,
            text=text,
            permission_mode=permission_mode,
            auto_stop_quiet_default=_state[
                "config"
            ].claude_auto_stop_quiet_default_turns,
        )
        response: dict = {"ok": True, "permission_mode": permission_mode}
        # Slash commands return synchronous result text (e.g. unknown-command
        # responses from claude that aren't written to JSONL).
        if result is not None:
            response["result_text"] = result.get("result_text")
            response["is_error"] = bool(result.get("is_error"))
        return response

    @app.post("/api/sessions/{session_id}/stop")
    async def stop_message(session_id: str):
        stopped = await _runner.stop(session_id)
        return {"ok": True, "stopped": stopped}

    @app.get("/api/sessions/{session_id}/runner-status")
    async def runner_status(session_id: str):
        return _runner.status_snapshot(session_id)

    # -----------------------------------------------------------------------
    # Recaps
    # -----------------------------------------------------------------------

    _RECAP_PROMPT = (
        "Provide a concise recap of this conversation in 3-5 short bullets. "
        "Focus on what was accomplished, what remains open, and any notable "
        "decisions. Be terse — this is a quick context-restore, not a deep summary."
    )

    @app.post("/api/sessions/{session_id}/recap")
    async def create_recap(session_id: str):
        async with Database(db_path) as db:
            detail = await db.get_session_detail(session_id)
            if detail is None:
                raise HTTPException(status_code=404, detail="Session not found")
            if detail.is_fork:
                raise HTTPException(
                    status_code=422,
                    detail="fork sessions are not valid --resume targets",
                )
            cwd = detail.cwd or str(Path(detail.file_path).parent)
            if not Path(cwd).is_dir():
                raise HTTPException(
                    status_code=404, detail=f"Directory not found: {cwd}"
                )
            bin_name = _derive_bin_name(detail.file_path)
            if shutil.which(bin_name) is None:
                raise HTTPException(
                    status_code=503, detail=f"{bin_name} not found on PATH"
                )
            latest_uuid: str | None = (
                detail.messages[-1].id if detail.messages else None
            )

            text = await _runner.generate_recap(
                session_id,
                cwd=cwd,
                bin_name=bin_name,
                prompt=_RECAP_PROMPT,
            )
            if text is None:
                raise HTTPException(status_code=502, detail="recap generation failed")
            new_id = await db.insert_recap(session_id, text, latest_uuid)
            recaps = await db.list_recaps(session_id, include_dismissed=True)
        row = next((r for r in recaps if r["id"] == new_id), None)
        if row is None:
            raise HTTPException(
                status_code=500, detail="recap row missing after insert"
            )
        return row

    @app.get("/api/sessions/{session_id}/recaps")
    async def list_recaps_route(
        session_id: str,
        include_dismissed: bool = Query(False),
    ):
        async with Database(db_path) as db:
            return await db.list_recaps(session_id, include_dismissed=include_dismissed)

    @app.post("/api/sessions/{session_id}/recaps/{recap_id}/dismiss")
    async def dismiss_recap_route(session_id: str, recap_id: int):
        async with Database(db_path) as db:
            ok = await db.dismiss_recap(recap_id)
        if not ok:
            raise HTTPException(status_code=404, detail="Recap not found")
        return {"ok": True, "dismissed": True}

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
    # File system browser (read-only, sandboxed)
    # ------------------------------------------------------------------

    _EXTENSION_LANGUAGE: dict[str, str] = {
        ".py": "python",
        ".js": "javascript",
        ".ts": "typescript",
        ".tsx": "typescript",
        ".jsx": "javascript",
        ".rs": "rust",
        ".go": "go",
        ".java": "java",
        ".kt": "kotlin",
        ".rb": "ruby",
        ".php": "php",
        ".c": "c",
        ".cpp": "cpp",
        ".h": "c",
        ".hpp": "cpp",
        ".cs": "csharp",
        ".swift": "swift",
        ".scala": "scala",
        ".sh": "bash",
        ".bash": "bash",
        ".zsh": "bash",
        ".sql": "sql",
        ".html": "xml",
        ".xml": "xml",
        ".css": "css",
        ".json": "json",
        ".yaml": "yaml",
        ".yml": "yaml",
        ".toml": "ini",
        ".md": "markdown",
        ".lua": "lua",
        ".r": "r",
        ".pl": "perl",
        ".ex": "elixir",
        ".exs": "elixir",
        ".erl": "erlang",
        ".hs": "haskell",
        ".ml": "ocaml",
        ".vim": "vim",
        ".dockerfile": "dockerfile",
        ".tf": "hcl",
        ".dart": "dart",
    }

    async def _allowed_prefixes() -> set[str]:
        """Collect all filesystem paths the FS browser may access."""
        prefixes: set[str] = set()
        for p in _state["config"].get_all_scan_paths():
            prefixes.add(str(Path(p).expanduser().resolve()))
        async with Database(db_path) as db:
            data_sources = _state["config"].get_active_data_sources()
            projects = await db.get_projects(data_sources=data_sources)
            for proj in projects:
                if proj.resolved_path:
                    prefixes.add(str(Path(proj.resolved_path).resolve()))
            for session in await db.get_sessions(data_sources=data_sources):
                if session.cwd:
                    prefixes.add(str(Path(session.cwd).resolve()))
        return prefixes

    def _validate_fs_path(requested: str, prefixes: set[str]) -> Path:
        resolved = Path(requested).resolve()
        if not any(str(resolved).startswith(p) for p in prefixes):
            raise HTTPException(
                status_code=403, detail="Path outside allowed directories"
            )
        return resolved

    @app.get("/api/fs/list")
    async def fs_list(
        path: str = Query(...),
        show_hidden: bool = Query(False),
    ):
        prefixes = await _allowed_prefixes()
        resolved = _validate_fs_path(path, prefixes)
        if not resolved.is_dir():
            raise HTTPException(status_code=404, detail="Not a directory")

        entries: list[dict] = []
        for child in resolved.iterdir():
            if not show_hidden and child.name.startswith("."):
                continue
            try:
                stat = child.stat()
            except OSError:
                continue
            entries.append(
                {
                    "name": child.name,
                    "type": "dir" if child.is_dir() else "file",
                    "size": stat.st_size if child.is_file() else None,
                    "modified": stat.st_mtime,
                }
            )

        dirs = sorted(
            [e for e in entries if e["type"] == "dir"], key=lambda e: e["name"].lower()
        )
        files = sorted(
            [e for e in entries if e["type"] == "file"], key=lambda e: e["name"].lower()
        )
        return {"path": str(resolved), "entries": dirs + files}

    class FsWriteBody(BaseModel):
        path: str
        content: str

    @app.put("/api/fs/write")
    async def fs_write(body: FsWriteBody):
        _require_edit()
        prefixes = await _allowed_prefixes()
        resolved = _validate_fs_path(body.path, prefixes)
        if resolved.is_dir():
            raise HTTPException(status_code=400, detail="Path is a directory")
        # Refuse to create new files for now — only edit existing.
        if not resolved.exists():
            raise HTTPException(status_code=404, detail="File does not exist")
        encoded = body.content.encode("utf-8")
        if len(encoded) > 2 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large (max 2MB)")
        if b"\x00" in encoded:
            raise HTTPException(status_code=415, detail="Binary content not allowed")
        try:
            with open(resolved, "w", encoding="utf-8") as f:
                f.write(body.content)
        except OSError as e:
            raise HTTPException(status_code=500, detail=f"Write failed: {e}")
        return {"ok": True, "path": str(resolved), "size": len(encoded)}

    @app.get("/api/fs/read")
    async def fs_read(path: str = Query(...)):
        prefixes = await _allowed_prefixes()
        resolved = _validate_fs_path(path, prefixes)
        if not resolved.is_file():
            raise HTTPException(status_code=404, detail="Not a file")

        size = resolved.stat().st_size
        if size > 2 * 1024 * 1024:
            raise HTTPException(status_code=413, detail="File too large (max 2MB)")

        with open(resolved, "rb") as f:
            head = f.read(8192)
        if b"\x00" in head:
            raise HTTPException(status_code=415, detail="Binary file")

        content = head.decode("utf-8", errors="replace")
        if size > 8192:
            with open(resolved, "r", encoding="utf-8", errors="replace") as f:
                content = f.read()

        ext = resolved.suffix.lower()
        language = _EXTENSION_LANGUAGE.get(ext)
        if not language and resolved.name == "Dockerfile":
            language = "dockerfile"
        if not language and resolved.name == "Makefile":
            language = "makefile"

        return {
            "path": str(resolved),
            "name": resolved.name,
            "content": content,
            "size": size,
            "language": language,
        }

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
