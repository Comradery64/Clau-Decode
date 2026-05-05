"""Session file editor — backup and surgical JSONL mutations.

All public functions operate on the raw JSONL file. They do NOT write to the DB;
callers are responsible for keeping the DB in sync after a successful file write.
Every write is atomic: changes go to a .tmp file first, then os.replace() swaps it in.
"""
from __future__ import annotations

import json
import shutil
from datetime import datetime, timezone
from pathlib import Path


def backup_session(path: Path) -> Path:
    """Copy path to <path>.bak.<YYYYMMDD_HHMMSS>.jsonl and return the backup path."""
    ts = datetime.now(timezone.utc).strftime("%Y%m%d_%H%M%S")
    backup = path.with_name(f"{path.stem}.bak.{ts}.jsonl")
    shutil.copy2(path, backup)
    return backup


def delete_from_session(path: Path, message_uuid: str) -> None:
    """Remove the JSONL line whose uuid == message_uuid. Writes in-place atomically."""
    lines = _read_lines(path)
    kept = [line for line in lines if _get_uuid(line) != message_uuid]
    if len(kept) == len(lines):
        return  # uuid not found — no-op
    _write_lines(path, kept)


def edit_content_in_session(
    path: Path, message_uuid: str, new_content: list[dict]
) -> None:
    """Replace message.content for the line matching message_uuid. Writes atomically."""
    lines = _read_lines(path)
    result = []
    changed = False
    for line in lines:
        if _get_uuid(line) == message_uuid:
            try:
                record = json.loads(line)
                record.setdefault("message", {})["content"] = new_content
                result.append(json.dumps(record, ensure_ascii=False))
                changed = True
                continue
            except (json.JSONDecodeError, KeyError):
                pass
        result.append(line)
    if changed:
        _write_lines(path, result)


# ---------------------------------------------------------------------------
# Internal helpers
# ---------------------------------------------------------------------------

def _read_lines(path: Path) -> list[str]:
    return [l for l in path.read_text(encoding="utf-8").splitlines() if l.strip()]


def _write_lines(path: Path, lines: list[str]) -> None:
    tmp = path.with_suffix(".tmp")
    tmp.write_text("\n".join(lines) + "\n", encoding="utf-8")
    tmp.replace(path)


def _get_uuid(line: str) -> str | None:
    try:
        return json.loads(line).get("uuid")
    except (json.JSONDecodeError, AttributeError):
        return None
