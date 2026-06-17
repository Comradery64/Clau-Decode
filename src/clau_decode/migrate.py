"""``clau-decode migrate`` -- merge & relocate Claude Code chat history + configs.

Claude Code keys every session to the *absolute path* of its project directory.
That path is baked into four places:
  1. the folder name under ``<config>/projects/``  (path with every non-alnum char -> '-')
  2. a ``cwd`` field inside each ``*.jsonl`` line (and nested subagent transcripts)
  3. the ``projects`` keys in ``~/.claude.json``
  4. the ``projects`` keys in ``<config>/.claude.json``
So when code moves to a new path -- or you're consolidating several Claude config
trees (a vanilla ``~/.claude`` plus mirrored profiles) onto one machine -- copying
files verbatim leaves chats that still *view* but won't *resume*: the session folder
no longer matches and the recorded ``cwd`` no longer exists to ``chdir`` into.

This merges one or more source config trees into a destination ``~/.claude``, rewriting
a path prefix as it goes. The folder encoding was verified as ``[^a-zA-Z0-9] -> '-'``;
it is lossy, so the true path is always read from a session's ``cwd``, never decoded
from a folder name.

Pure standard library, no web-server imports -- so this module also runs standalone
(``python3 migrate.py --help``) and is unit-testable in isolation.

Safety: dry-run by default; ``--apply`` is gated behind ``--i-have-a-backup``;
non-destructive (a differing destination file is never overwritten -- the incoming
copy is written as a ``.from-<source>`` sidecar); ``.claude.json``/``history.jsonl``
writes are atomic and file contents are never printed.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import shutil
from pathlib import Path

# File extensions treated as text for path rewriting (everything else copied
# verbatim, so binaries are never corrupted). Covers session JSONL plus cached
# tool-result/.txt/.json blobs the harness stores under a project dir.
_TEXT_EXTS = {".jsonl", ".json", ".ndjson", ".txt", ".md", ".log", ".yaml", ".yml"}

# Derived / vendored dirs that should never travel with a config merge.
_SKIP_DIRS = {"node_modules", ".git", "__pycache__", ".venv", "venv",
              ".cache", "dist", "build", ".pytest_cache", ".mypy_cache"}

# Human-config items merged from each source (non-destructively).
_CONFIG_FILES = ("CLAUDE.md", "settings.json")
_CONFIG_DIRS = ("commands", "skills", "agents", "hooks", "memory")

_NON_ALNUM = re.compile(r"[^a-zA-Z0-9]")
# Characters that could *continue* a longer volume/path component; if the prefix
# is immediately followed by one of these it is NOT a standalone match (so
# ``/Volumes/SDCard`` is left alone while ``cd /Volumes/SD &&`` rewrites).
_CONT_CHARS = frozenset(
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789_-."
)


def encode(path: str) -> str:
    """Claude's project-folder encoding: every non-alphanumeric char -> '-'."""
    return _NON_ALNUM.sub("-", path)


def rewrite_prefix(text: str, frm: str, to: str) -> tuple[str, int]:
    """Replace ``frm`` with ``to`` at path boundaries. Returns (new_text, count)."""
    if not frm or frm not in text:
        return text, 0
    out: list[str] = []
    i = 0
    n = len(frm)
    count = 0
    while True:
        j = text.find(frm, i)
        if j == -1:
            out.append(text[i:])
            break
        nxt = text[j + n] if j + n < len(text) else ""
        if nxt not in _CONT_CHARS:
            out.append(text[i:j])
            out.append(to)
            count += 1
            i = j + n
        else:  # part of a longer name (e.g. /Volumes/SDCard) -- keep verbatim
            out.append(text[i : j + n])
            i = j + n
    return "".join(out), count


def remap_key(key: str, frm: str, to: str) -> str:
    """Rewrite a .claude.json project-path key (exact or prefixed)."""
    if not frm:
        return key
    if key == frm:
        return to
    if key.startswith(frm + "/"):
        return to + key[len(frm):]
    return key


def read_first_cwd(project_dir: Path) -> str | None:
    """The true working-directory path for a project dir, read from its JSONL.

    Searches recursively: a project dir may carry only nested subagent
    transcripts (``<session>/subagents/agent-*.jsonl``) and no top-level file.
    """
    for jf in sorted(project_dir.rglob("*.jsonl")):
        try:
            with jf.open(errors="replace") as fh:
                for line in fh:
                    if '"cwd"' not in line:
                        continue
                    try:
                        obj = json.loads(line)
                    except Exception:
                        continue
                    if isinstance(obj, dict) and obj.get("cwd"):
                        return obj["cwd"]
        except OSError:
            continue
    return None


def atomic_write_text(path: Path, text: str) -> None:
    tmp = path.with_suffix(path.suffix + ".tmp")
    tmp.write_text(text)
    if path.exists():
        shutil.copymode(path, tmp)
    os.replace(tmp, path)


def files_equal(a: Path, b: Path) -> bool:
    try:
        if a.stat().st_size != b.stat().st_size:
            return False
        return a.read_bytes() == b.read_bytes()
    except OSError:
        return False


class Report:
    def __init__(self) -> None:
        self.lines: list[str] = []
        self.counts: dict[str, int] = {}

    def bump(self, key: str, by: int = 1) -> None:
        self.counts[key] = self.counts.get(key, 0) + by

    def note(self, msg: str) -> None:
        self.lines.append(msg)

    def render(self) -> str:
        out = ["", "=== summary ==="]
        for k in sorted(self.counts):
            out.append(f"  {k}: {self.counts[k]}")
        if self.lines:
            out.append("")
            out.append("=== notes (first 40) ===")
            out.extend("  " + ln for ln in self.lines[:40])
            if len(self.lines) > 40:
                out.append(f"  ... and {len(self.lines) - 40} more")
        return "\n".join(out)


def merge_projects(
    source_label: str,
    source_projects: Path,
    dest_projects: Path,
    frm: str,
    to: str,
    apply: bool,
    rep: Report,
) -> None:
    if not source_projects.is_dir():
        return
    for sdir in sorted(p for p in source_projects.iterdir() if p.is_dir()):
        # Copy the WHOLE project subtree, not just top-level *.jsonl: project dirs
        # can hold nested subagent transcripts at <session>/subagents/agent-*.jsonl.
        all_files = [
            p for p in sdir.rglob("*")
            if p.is_file() and not p.is_symlink() and p.name != ".DS_Store"
        ]
        if not all_files:
            rep.bump("project-dirs-empty-skipped")
            continue
        cwd = read_first_cwd(sdir)
        if cwd and (cwd == frm or cwd.startswith(frm + "/")):
            new_cwd = to + cwd[len(frm):]
            target_name = encode(new_cwd)
            rewrite = True
        else:
            target_name = sdir.name  # passthrough (view-only on the new machine)
            rewrite = False
            if cwd:
                rep.bump("project-dirs-passthrough-not-under-from")
        if rewrite and target_name != sdir.name:
            rep.bump("project-dirs-rewritten")
            if len(rep.lines) < 40:
                rep.note(f"[{source_label}] {sdir.name}\n      -> {target_name}")
        target_dir = dest_projects / target_name
        for sf in all_files:
            rel = sf.relative_to(sdir)
            dest_file = target_dir / rel
            top_level_session = sf.suffix == ".jsonl" and rel.parent == Path(".")
            if dest_file.exists():
                if files_equal(sf, dest_file):
                    rep.bump("files-already-present-identical")
                    continue
                # same path, different content -- keep both, never clobber
                dest_file = dest_file.with_name(
                    dest_file.stem + f".dup-{source_label}" + dest_file.suffix
                )
                rep.bump("files-collision-sidecar")
                rep.note(f"COLLISION {target_name}/{rel} -> {dest_file.name}")
            rep.bump("sessions-merged" if top_level_session else "subfiles-merged")
            if not apply:
                continue
            dest_file.parent.mkdir(parents=True, exist_ok=True)
            if frm and sf.suffix in _TEXT_EXTS:
                text = sf.read_text(errors="replace")
                text, _ = rewrite_prefix(text, frm, to)
                dest_file.write_text(text)
            else:
                shutil.copy2(sf, dest_file)


def _detect_indent(raw: str) -> int | None:
    return 2 if re.search(r'\n\s{2,}"', raw) else None


def merge_claude_json(
    dest_json: Path,
    source_jsons: list[tuple[str, Path]],
    frm: str,
    to: str,
    apply: bool,
    rep: Report,
) -> None:
    if dest_json.exists():
        raw = dest_json.read_text()
        base = json.loads(raw) if raw.strip() else {}
        indent = _detect_indent(raw)
    else:
        base = {}
        indent = None
    if not isinstance(base, dict):
        rep.note(f"SKIP {dest_json}: not a JSON object")
        return
    projects = base.setdefault("projects", {})
    if not isinstance(projects, dict):
        rep.note(f"SKIP {dest_json}: .projects is not an object")
        return

    for label, sjson in source_jsons:
        if not sjson.exists():
            continue
        try:
            sdata = json.loads(sjson.read_text() or "{}")
        except Exception as exc:
            rep.note(f"SKIP {label} json ({sjson}): {exc}")
            continue
        sprojects = sdata.get("projects")
        if not isinstance(sprojects, dict):
            continue
        for key, val in sprojects.items():
            nk = remap_key(key, frm, to)
            if nk not in projects:
                projects[nk] = val
                rep.bump("claude-json-project-keys-added")
            elif isinstance(projects[nk], dict) and isinstance(val, dict):
                added = 0
                for sk, sv in val.items():
                    if sk not in projects[nk]:
                        projects[nk][sk] = sv
                        added += 1
                if added:
                    rep.bump("claude-json-subkeys-filled", added)

    if apply:
        text = json.dumps(
            base, ensure_ascii=False, indent=indent,
            separators=None if indent else (",", ":"),
        )
        atomic_write_text(dest_json, text)


def merge_history(
    dest_hist: Path,
    source_hists: list[Path],
    frm: str,
    to: str,
    apply: bool,
    rep: Report,
) -> None:
    seen: set[str] = set()
    rows: list[tuple[float, str]] = []
    sources = ([dest_hist] if dest_hist.exists() else []) + [
        h for h in source_hists if h.exists()
    ]
    for h in sources:
        try:
            with h.open(errors="replace") as fh:
                for line in fh:
                    line = line.rstrip("\n")
                    if not line.strip():
                        continue
                    if frm:
                        line, _ = rewrite_prefix(line, frm, to)
                    if line in seen:
                        continue
                    seen.add(line)
                    ts = 0.0
                    try:
                        obj = json.loads(line)
                        ts = float(obj.get("timestamp") or obj.get("ts") or 0)
                    except Exception:
                        pass
                    rows.append((ts, line))
        except OSError:
            continue
    rows.sort(key=lambda r: r[0])
    rep.bump("history-lines-total", len(rows))
    if apply and rows:
        if dest_hist.exists():
            backup = dest_hist.with_suffix(".jsonl.pre-merge.bak")
            if not backup.exists():
                shutil.copy2(dest_hist, backup)
        atomic_write_text(dest_hist, "\n".join(r[1] for r in rows) + "\n")


def copy_file_safe(src: Path, dst: Path, label: str, apply: bool, rep: Report) -> None:
    if not src.exists() or src.is_symlink():
        return
    if dst.exists():
        if files_equal(src, dst):
            return
        sidecar = dst.with_name(dst.name + f".from-{label}")
        rep.bump("config-file-conflict-sidecar")
        rep.note(f"CONFLICT keep dest {dst.name}; wrote {sidecar.name} (review/merge)")
        if apply:
            shutil.copy2(src, sidecar)
        return
    rep.bump("config-files-copied")
    if apply:
        dst.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(src, dst)


def union_dir_safe(src: Path, dst: Path, label: str, apply: bool, rep: Report) -> None:
    """Copy files missing from dst; sidecar on content conflict. Skips vendored
    subtrees (node_modules, .git, caches) and symlinks."""
    if not src.is_dir():
        return
    for root, dirs, files in os.walk(src):
        dirs[:] = [d for d in dirs if d not in _SKIP_DIRS]
        root_p = Path(root)
        for name in files:
            if name == ".DS_Store":
                continue
            item = root_p / name
            if item.is_symlink():
                continue
            copy_file_safe(item, dst / item.relative_to(src), label, apply, rep)


def merge_configs(sources: list[Path], dest_dir: Path, apply: bool, rep: Report) -> None:
    """Union human-config items from each source into dest, non-destructively.

    Sources are processed in the order given, so list higher-priority configs
    first: the first source to provide a singleton (CLAUDE.md / settings.json)
    populates dest; any later differing version becomes a ``.from-<label>`` sidecar.
    """
    for src in sources:
        label = src.name or "source"
        for fname in _CONFIG_FILES:
            copy_file_safe(src / fname, dest_dir / fname, label, apply, rep)
        for dname in _CONFIG_DIRS:
            union_dir_safe(src / dname, dest_dir / dname, label, apply, rep)


def add_arguments(parser: argparse.ArgumentParser) -> None:
    """Register ``migrate`` flags on the given (sub)parser."""
    parser.add_argument(
        "--source", action="append", default=[], metavar="DIR", type=Path,
        help="a Claude config dir to merge FROM (repeatable). Its .claude.json is "
             "read automatically. e.g. ~/.claude or ~/.cc-mirror/<profile>/config",
    )
    parser.add_argument(
        "--source-json", action="append", default=[], metavar="PATH", type=Path,
        help="extra .claude.json to union project entries from (repeatable) -- e.g. "
             "the home-level ~/.claude.json that sits outside a source dir",
    )
    parser.add_argument(
        "--dest-dir", type=Path, default=Path("~/.claude").expanduser(),
        help="destination Claude dir (default: ~/.claude)",
    )
    parser.add_argument(
        "--dest-json", type=Path, default=Path("~/.claude.json").expanduser(),
        help="destination home .claude.json (default: ~/.claude.json)",
    )
    parser.add_argument("--from", dest="frm", default="", metavar="PREFIX",
                        help="path prefix to rewrite FROM, e.g. /Volumes/SD")
    parser.add_argument("--to", dest="to", default="", metavar="PREFIX",
                        help="path prefix to rewrite TO, e.g. /Users/you/Dev")
    parser.add_argument("--no-configs", action="store_true",
                        help="merge chat history only (skip human configs)")
    parser.add_argument("--apply", action="store_true",
                        help="actually write changes (default: dry-run)")
    parser.add_argument("--i-have-a-backup", action="store_true",
                        help="required with --apply; confirm dest is backed up")


def run(args: argparse.Namespace) -> int:
    """Execute a migrate run from parsed args. Returns a process exit code."""
    sources: list[Path] = list(getattr(args, "source", []) or [])
    if not sources:
        print("error: at least one --source DIR is required", flush=True)
        return 2
    if bool(args.frm) != bool(args.to):
        print("error: --from and --to must be given together (or neither)", flush=True)
        return 2
    if args.apply and not args.i_have_a_backup:
        print("error: --apply requires --i-have-a-backup "
              "(back up the destination ~/.claude and ~/.claude.json first)", flush=True)
        return 2

    apply = args.apply
    mode = "APPLY" if apply else "DRY-RUN"
    print(f"[{mode}] merging {len(sources)} source(s) into {args.dest_dir}  "
          f"(rewrite '{args.frm}' -> '{args.to}')")

    rep = Report()
    dest_projects = args.dest_dir / "projects"
    if apply:
        dest_projects.mkdir(parents=True, exist_ok=True)

    # 1. projects/ union + rewrite
    for src in sources:
        merge_projects(src.name or "source", src / "projects", dest_projects,
                       args.frm, args.to, apply, rep)

    # 2. .claude.json project-entry union (each source dir's .claude.json + extras)
    source_jsons: list[tuple[str, Path]] = []
    for src in sources:
        source_jsons.append((src.name or "source", src / ".claude.json"))
    for extra in (getattr(args, "source_json", []) or []):
        source_jsons.append((extra.name, extra))
    merge_claude_json(args.dest_json, source_jsons, args.frm, args.to, apply, rep)

    # 3. history.jsonl
    merge_history(args.dest_dir / "history.jsonl",
                  [src / "history.jsonl" for src in sources],
                  args.frm, args.to, apply, rep)

    # 4. human configs
    if not args.no_configs:
        merge_configs(sources, args.dest_dir, apply, rep)

    print(rep.render())
    if not apply:
        print("\nDry-run only -- nothing was written. "
              "Re-run with --apply --i-have-a-backup to commit.")
    else:
        print("\nDone. If you use clau-decode: rm -f ~/.cache/clau-decode/index.db "
              "to force a clean reindex, then launch clau-decode.")
    return 0


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="clau-decode migrate",
        description="Merge & relocate Claude Code chat history + configs across machines.",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog=__doc__,
    )
    add_arguments(parser)
    return run(parser.parse_args(argv))


if __name__ == "__main__":
    raise SystemExit(main())
