"""CLI entry point — `clau-decode [options] <command>`.

Commands:
  dashboard   Launch the web UI (default when no command given)
  scan        Rescan all paths and print summary
  today       Show today's token usage and cost
  stats       Print statistical metrics across all sessions
  tips        Print optimization tips

Global options:
  --path PATH       Add an extra scan path (repeatable, appended to config paths)
  --port PORT       Override port (default: 4242)
  --host HOST       Bind host (default: 127.0.0.1)
  --expose          Bind to 0.0.0.0 with a security warning
  --no-open         Don't open browser on startup
  --version         Print version and exit
  --enable-edit     Enable message editing and deletion
  --force-refresh   Clear mtime cache and force full rescan
  --since YYYYMMDD  Only include sessions on or after this date
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import threading
import time
import webbrowser
from datetime import date, datetime, timezone
from pathlib import Path

import uvicorn

from . import __version__
from .config import get_db_path, load_config
from .server import create_app


def _build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="clau-decode",
        description="Local web viewer and analytics for AI coding assistant chat history",
    )
    parser.add_argument(
        "--path",
        action="append",
        dest="paths",
        metavar="PATH",
        help="Add a scan path (repeatable)",
    )
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Override the listening port (default from config, fallback 4242)",
    )
    parser.add_argument(
        "--host",
        default=None,
        help="Bind host (default: 127.0.0.1)",
    )
    parser.add_argument(
        "--expose",
        action="store_true",
        default=False,
        help="Bind to 0.0.0.0 (accessible on your local network). "
             "Use with caution — anyone on the same network can view your data.",
    )
    parser.add_argument(
        "--no-open",
        action="store_true",
        help="Don't open a browser window on startup",
    )
    parser.add_argument(
        "--version",
        action="version",
        version=f"clau-decode {__version__}",
    )
    parser.add_argument(
        "--enable-edit",
        action="store_true",
        default=False,
        help="Enable message editing and deletion. A backup is created before every write.",
    )
    parser.add_argument(
        "--force-refresh",
        action="store_true",
        default=False,
        help="Clear mtime cache and force a full rescan of all session files.",
    )
    parser.add_argument(
        "--since",
        type=lambda s: datetime.strptime(s, "%Y%m%d").date(),
        metavar="YYYYMMDD",
        help="Only include sessions on or after this date",
    )

    subparsers = parser.add_subparsers(dest="command")

    subparsers.add_parser(
        "dashboard",
        help="Launch the web UI (default)",
    )
    subparsers.add_parser(
        "scan",
        help="Rescan all paths and print summary",
    )
    subparsers.add_parser(
        "today",
        help="Show today's token usage and cost",
    )
    subparsers.add_parser(
        "stats",
        help="Print statistical metrics across all sessions",
    )
    subparsers.add_parser(
        "tips",
        help="Print optimization tips",
    )

    return parser


def _resolve_host(args: argparse.Namespace, config=None) -> str:
    """Determine the bind host: CLI flags > saved config > default."""
    if args.expose:
        print(
            "WARNING: --expose binds to 0.0.0.0. "
            "Anyone on your local network can access your chat history.\n"
        )
        return "0.0.0.0"
    if args.host:
        return args.host
    if config is not None:
        return config.host
    return "127.0.0.1"


def _run_dashboard(args: argparse.Namespace, config) -> None:
    """Launch the web UI with uvicorn."""
    host = _resolve_host(args, config)

    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if args.force_refresh:
        asyncio.run(_force_refresh(db_path))

    app = create_app(config, db_path)

    if not args.no_open and config.auto_open_browser:
        url = f"http://{host}:{config.port}"

        def _open_browser() -> None:
            import urllib.request
            for _ in range(30):
                time.sleep(0.5)
                try:
                    urllib.request.urlopen(f"{url}/api/health", timeout=1)
                    break
                except Exception:
                    continue
            webbrowser.open(url)

        threading.Thread(target=_open_browser, daemon=True).start()

    print(f"Clau-Decode running at http://{host}:{config.port}")
    uvicorn.run(app, host=host, port=config.port, log_level="warning")


async def _force_refresh(db_path: Path) -> None:
    """Clear all stored mtimes so the next scan re-parses every file."""
    from .db import Database
    async with Database(db_path) as db:
        await db.init_schema()
        await db.execute("UPDATE sessions SET file_mtime = NULL")
        await db.commit()


async def _do_scan(db_path: Path, config) -> int:
    """Scan all paths, return number of sessions indexed."""
    from .db import Database
    from .scanner import scan_paths
    from .parser import parse_session
    from .scanner import build_project_from_dir

    count = 0
    scan_paths_list = config.get_all_scan_paths()
    root_paths = [Path(p).expanduser() for p in scan_paths_list]
    async with Database(db_path) as db:
        await db.init_schema()
        async for project, session_path in scan_paths(root_paths):
            try:
                session, messages = parse_session(session_path)
                session.project_id = project.id
                project.session_count += 1
                current_mtime = session_path.stat().st_mtime
                await db.upsert_project(project)
                await db.upsert_session(session, file_mtime=current_mtime)
                await db.upsert_messages(messages)
                count += 1
            except Exception as exc:
                print(f"  Warning: skipping {session_path}: {exc}")
    return count


def _run_scan(args: argparse.Namespace, config) -> None:
    """Rescan and print summary."""
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if args.force_refresh:
        asyncio.run(_force_refresh(db_path))

    print("Scanning...")
    count = asyncio.run(_do_scan(db_path, config))
    print(f"Indexed {count} sessions.")


def _run_today(args: argparse.Namespace, config) -> None:
    """Show today's token usage and cost."""
    from .db import Database
    from .analytics.service import TokenAnalyticsService
    from .analytics.cost import CostEngine
    from .analytics.pricing import CachedPricingStrategy

    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if args.force_refresh:
        asyncio.run(_force_refresh(db_path))
        asyncio.run(_do_scan(db_path, config))

    async def _query():
        async with Database(db_path) as db:
            await db.init_schema()
            messages = await db.get_all_messages()

        today = args.since or date.today()
        svc = TokenAnalyticsService()
        buckets = svc.daily_buckets(messages)
        target = next((b for b in buckets if b.day >= today), None)
        if target is None:
            return None
        return target

    result = asyncio.run(_query())
    if result is None:
        label = args.since.isoformat() if args.since else "today"
        print(f"No usage data for {label}.")
        return

    bd = result.breakdown
    print(f"Date: {result.day}")
    print(f"  Input tokens:       {bd.input_tokens:,}")
    print(f"  Output tokens:      {bd.output_tokens:,}")
    print(f"  Cache creation:     {bd.cache_creation_tokens:,}")
    print(f"  Cache read:         {bd.cache_read_tokens:,}")
    print(f"  Total tokens:       {bd.total:,}")
    print(f"  Prompt count:       {result.prompt_count}")

    # Cost estimate
    pricing = CachedPricingStrategy()
    asyncio.run(pricing.refresh())
    from .analytics.cost import CostEngine
    engine = CostEngine(pricing)
    cost = engine.compute("claude-sonnet-4-6", bd)
    print(f"  Est. cost (Sonnet): ${float(cost.total_usd):.4f}")


def _run_stats(args: argparse.Namespace, config) -> None:
    """Print statistical metrics."""
    from .db import Database
    from .analytics.stats import PromptStatsScanner, ModelUsageScanner, ToolUsageScanner

    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if args.force_refresh:
        asyncio.run(_force_refresh(db_path))
        asyncio.run(_do_scan(db_path, config))

    async def _query():
        async with Database(db_path) as db:
            await db.init_schema()
            messages = await db.get_all_messages()
        return messages

    messages = asyncio.run(_query())

    stats = PromptStatsScanner().scan(messages)
    print("=== Prompt Stats ===")
    for key, val in sorted(stats.items()):
        if isinstance(val, float):
            print(f"  {key}: {val:.2f}")
        else:
            print(f"  {key}: {val}")

    models = ModelUsageScanner().scan(messages)
    print("\n=== Model Usage ===")
    for m in models:
        print(f"  {m['model']}: {m['message_count']} messages, "
              f"{m['input_tokens']:,} input, {m['output_tokens']:,} output")

    tools = ToolUsageScanner().scan(messages)
    print("\n=== Tool Usage ===")
    for t in tools[:10]:
        print(f"  {t['tool']}: {t['count']} calls")


def _run_tips(args: argparse.Namespace, config) -> None:
    """Print optimization tips."""
    from .db import Database
    from .analytics.tips import TipRegistry, RepeatedFileReadRule, OversizedToolResultRule, LowCacheHitRule

    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    if args.force_refresh:
        asyncio.run(_force_refresh(db_path))
        asyncio.run(_do_scan(db_path, config))

    async def _query():
        async with Database(db_path) as db:
            await db.init_schema()
            messages = await db.get_all_messages()
        return messages

    messages = asyncio.run(_query())

    registry = TipRegistry()
    registry.register(RepeatedFileReadRule())
    registry.register(OversizedToolResultRule())
    registry.register(LowCacheHitRule())
    tips = registry.run(messages)

    if not tips:
        print("No optimization tips — looking good!")
        return

    for t in tips:
        icon = {"info": "ℹ", "warning": "⚠", "critical": "✱"}.get(t.severity, "•")
        print(f"{icon} [{t.severity.upper()}] {t.title}")
        if t.detail:
            print(f"    {t.detail}")


def main() -> None:
    """Entry point registered in pyproject.toml [project.scripts]."""
    parser = _build_parser()
    args = parser.parse_args()

    config = load_config(extra_paths=args.paths, port=args.port)
    if args.enable_edit:
        config = config.model_copy(update={"edit_enabled": True})

    command = args.command or "dashboard"
    dispatch = {
        "dashboard": _run_dashboard,
        "scan": _run_scan,
        "today": _run_today,
        "stats": _run_stats,
        "tips": _run_tips,
    }
    dispatch[command](args, config)
