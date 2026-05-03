"""User configuration — persisted to XDG_CONFIG_HOME/clau-decode/config.json.

Contract (for Agent 2 to implement):
  load_config() -> AppConfig
    - Read from config file if it exists, else return defaults
    - Merge CLI-provided overrides (extra_paths, port)

  save_config(config: AppConfig) -> None
    - Atomically write config to the config file (write to .tmp, rename)

  get_config_path() -> Path
    - Return XDG_CONFIG_HOME/clau-decode/config.json (or ~/.config/clau-decode/config.json)

  get_db_path() -> Path
    - Return XDG_CACHE_HOME/clau-decode/index.db (or ~/.cache/clau-decode/index.db)

SOLID notes:
  - No global state — callers hold the config object; this module is pure I/O
"""

from __future__ import annotations

import json
import os
from pathlib import Path

from .models import AppConfig


def get_config_path() -> Path:
    """Return the path to the clau-decode configuration file.

    Respects the XDG Base Directory specification: uses ``XDG_CONFIG_HOME`` if
    set, otherwise falls back to ``~/.config``.

    Returns:
        ``<xdg_config>/clau-decode/config.json``
    """
    xdg_config = os.environ.get("XDG_CONFIG_HOME", "") or str(Path("~/.config").expanduser())
    return Path(xdg_config) / "clau-decode" / "config.json"


def get_db_path() -> Path:
    """Return the path to the clau-decode SQLite database.

    Respects the XDG Base Directory specification: uses ``XDG_CACHE_HOME`` if
    set, otherwise falls back to ``~/.cache``.

    Returns:
        ``<xdg_cache>/clau-decode/index.db``
    """
    xdg_cache = os.environ.get("XDG_CACHE_HOME", "") or str(Path("~/.cache").expanduser())
    return Path(xdg_cache) / "clau-decode" / "index.db"


def load_config(extra_paths: list[str] | None = None, port: int | None = None) -> AppConfig:
    """Load config from disk and apply any CLI overrides.

    If the config file does not exist, a default ``AppConfig()`` is returned.
    CLI overrides are applied after loading:
      - ``extra_paths``: appended to ``config.data_paths`` (deduplicated, order
        preserved).
      - ``port``: replaces ``config.port`` when provided.

    Args:
        extra_paths: Additional scan paths supplied via ``--path`` flags.
        port:        Port override supplied via ``--port`` flag.

    Returns:
        The resolved ``AppConfig``.
    """
    path = get_config_path()

    if path.exists():
        raw = path.read_text(encoding="utf-8")
        config = AppConfig.model_validate(json.loads(raw))
    else:
        config = AppConfig()

    if extra_paths:
        existing = set(config.data_paths)
        for p in extra_paths:
            if p not in existing:
                config.data_paths.append(p)
                existing.add(p)

    if port is not None:
        config.port = port

    return config


def save_config(config: AppConfig) -> None:
    """Atomically persist config to disk.

    Writes to a ``.tmp`` file first, then uses ``os.replace`` for an atomic
    rename so readers never see a partial write.  Parent directories are
    created automatically.

    Args:
        config: The ``AppConfig`` to persist.
    """
    path = get_config_path()
    path.parent.mkdir(parents=True, exist_ok=True)

    tmp_path = path.with_suffix(".tmp")
    tmp_path.write_text(config.model_dump_json(indent=2), encoding="utf-8")
    os.replace(tmp_path, path)
