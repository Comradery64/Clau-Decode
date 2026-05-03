"""CLI entry point — `clau-decode [options]`.

Contract (for Agent 2 to implement):
  main() -> None
    - Parse arguments (argparse, no external deps)
    - Load/merge config
    - Build the FastAPI app
    - Open browser unless --no-open
    - Start uvicorn

  Arguments:
    --path PATH      Add an extra scan path (repeatable, appended to config paths)
    --port PORT      Override port (default: 4242)
    --host HOST      Bind host (default: 127.0.0.1)
    --no-open        Don't open browser on startup
    --version        Print version and exit
"""

from __future__ import annotations

import argparse
import threading
import time
import webbrowser

import uvicorn

from . import __version__
from .config import get_db_path, load_config
from .server import create_app


def main() -> None:
    """Entry point registered in pyproject.toml [project.scripts].

    Parses command-line arguments, resolves configuration, creates the FastAPI
    application, optionally opens the browser, then hands control to uvicorn.
    """
    parser = argparse.ArgumentParser(
        prog="clau-decode",
        description="Local web viewer for Claude Code chat history",
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
        default="127.0.0.1",
        help="Bind host (default: 127.0.0.1)",
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
    args = parser.parse_args()

    config = load_config(extra_paths=args.paths, port=args.port)
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)

    app = create_app(config, db_path)

    if not args.no_open:
        url = f"http://{args.host}:{config.port}"

        def _open_browser() -> None:
            import urllib.request
            # Poll the health endpoint until the server is accepting connections,
            # then open the browser. Gives up after 15 seconds.
            for _ in range(30):
                time.sleep(0.5)
                try:
                    urllib.request.urlopen(f"{url}/api/health", timeout=1)
                    break
                except Exception:
                    continue
            webbrowser.open(url)

        threading.Thread(target=_open_browser, daemon=True).start()

    print(f"Clau-Decode running at http://{args.host}:{config.port}")
    uvicorn.run(app, host=args.host, port=config.port, log_level="warning")
