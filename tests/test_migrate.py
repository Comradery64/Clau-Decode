"""Tests for the ``clau-decode migrate`` history/config merge tool."""

from __future__ import annotations

import argparse
import json

from clau_decode import migrate


# ---------------------------------------------------------------------------
# Unit: encoding + boundary-aware prefix rewrite
# ---------------------------------------------------------------------------
class TestEncode:
    def test_non_alnum_becomes_dash(self):
        assert migrate.encode("/Volumes/ExternalDrive/Dev/My App") == "-Volumes-SD-Dev-My-App"
        assert migrate.encode("/a/.hidden_dir") == "-a--hidden-dir"


class TestRewritePrefix:
    def test_rewrites_at_path_boundaries(self):
        for nxt in ("/x", '"', " && ls", "", ":foo", ")"):
            text = f"/Volumes/ExternalDrive{nxt}"
            out, n = migrate.rewrite_prefix(text, "/Volumes/ExternalDrive", "/Users/me/Dev")
            assert out == f"/Users/me/Dev{nxt}", text
            assert n == 1

    def test_leaves_longer_volume_names_alone(self):
        for tail in ("Card/x", "-backup/y", "2/z", ".bak"):
            text = f"/Volumes/ExternalDrive{tail}"
            out, n = migrate.rewrite_prefix(text, "/Volumes/ExternalDrive", "/Users/me/Dev")
            assert out == text
            assert n == 0

    def test_noop_without_prefix(self):
        assert migrate.rewrite_prefix("anything", "", "")[0] == "anything"


class TestRemapKey:
    def test_exact_and_prefixed(self):
        assert migrate.remap_key("/Volumes/ExternalDrive", "/Volumes/ExternalDrive", "/new") == "/new"
        assert migrate.remap_key("/Volumes/ExternalDrive/a", "/Volumes/ExternalDrive", "/new") == "/new/a"
        assert migrate.remap_key("/other/a", "/Volumes/ExternalDrive", "/new") == "/other/a"


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------
def _make_source(root, *, with_config=True):
    """Build a minimal Claude config tree under ``root`` (a project on /Volumes/ExternalDrive)."""
    proj = root / "projects" / "-Volumes-SD-Dev-app"
    sub = proj / "sess1" / "subagents"
    sub.mkdir(parents=True)
    cwd = "/Volumes/ExternalDrive/Dev/app"
    (proj / "sess1.jsonl").write_text(
        json.dumps({"sessionId": "sess1", "cwd": cwd, "type": "user"}) + "\n"
    )
    (sub / "agent-x.jsonl").write_text(
        json.dumps({"sessionId": "sess1", "cwd": cwd, "isSidechain": True}) + "\n"
    )
    # a cached tool-result that embeds an absolute path as plain text
    (proj / "sess1" / "tool-results").mkdir(parents=True, exist_ok=True)
    (proj / "sess1" / "tool-results" / "r.txt").write_text(f"ran in {cwd}/sub && ok\n")
    (root / ".claude.json").write_text(
        json.dumps({"projects": {cwd: {"trusted": True}}})
    )
    (root / "history.jsonl").write_text(
        json.dumps({"timestamp": 1, "cwd": cwd, "display": cwd}) + "\n"
    )
    if with_config:
        (root / "CLAUDE.md").write_text("# global config\n")
        (root / "commands").mkdir()
        (root / "commands" / "foo.md").write_text("foo\n")
    return root, cwd


def _args(**kw):
    p = argparse.ArgumentParser()
    migrate.add_arguments(p)
    argv = []
    for k, v in kw.items():
        flag = "--" + k.replace("_", "-")
        if v is True:
            argv.append(flag)
        elif isinstance(v, list):
            for item in v:
                argv += [flag, str(item)]
        else:
            argv += [flag, str(v)]
    return p.parse_args(argv)


# ---------------------------------------------------------------------------
# End-to-end merge
# ---------------------------------------------------------------------------
class TestMergeEndToEnd:
    def test_dry_run_writes_nothing(self, tmp_path):
        src, _ = _make_source(tmp_path / "src")
        dest = tmp_path / "dest"
        rc = migrate.run(
            _args(
                source=[src],
                dest_dir=dest,
                dest_json=tmp_path / "d.json",
                **{"from": "/Volumes/ExternalDrive", "to": "/Users/me/Dev"},
            )
        )
        assert rc == 0
        assert not (dest / "projects").exists()

    def test_apply_relocates_and_rewrites(self, tmp_path):
        src, _ = _make_source(tmp_path / "src")
        dest = tmp_path / "dest"
        dest_json = tmp_path / "d.json"
        rc = migrate.run(
            _args(
                source=[src],
                dest_dir=dest,
                dest_json=dest_json,
                apply=True,
                i_have_a_backup=True,
                **{"from": "/Volumes/ExternalDrive", "to": "/Users/me/Dev"},
            )
        )
        assert rc == 0
        # project folder renamed to the rewritten, re-encoded path
        newdir = dest / "projects" / "-Users-me-Dev-Dev-app"
        assert (newdir / "sess1.jsonl").exists()
        # nested subagent transcript carried over
        assert (newdir / "sess1" / "subagents" / "agent-x.jsonl").exists()
        # no resume-critical stale cwd anywhere (jsonl OR text tool-results)
        stale = [
            p
            for p in newdir.rglob("*")
            if p.is_file() and "/Volumes/ExternalDrive" in p.read_text()
        ]
        assert stale == []
        # .claude.json project key remapped
        projects = json.loads(dest_json.read_text())["projects"]
        assert "/Users/me/Dev/Dev/app" in projects
        assert not any(k.startswith("/Volumes/ExternalDrive") for k in projects)

    def test_requires_backup_flag_for_apply(self, tmp_path):
        src, _ = _make_source(tmp_path / "src")
        rc = migrate.run(
            _args(
                source=[src],
                dest_dir=tmp_path / "d",
                dest_json=tmp_path / "d.json",
                apply=True,
            )
        )
        assert rc == 2  # refused: no --i-have-a-backup

    def test_non_destructive_config_conflict_sidecar(self, tmp_path):
        src, _ = _make_source(tmp_path / "src")
        dest = tmp_path / "dest"
        (dest).mkdir()
        (dest / "CLAUDE.md").write_text("# DIFFERENT existing config\n")
        migrate.run(
            _args(
                source=[src],
                dest_dir=dest,
                dest_json=tmp_path / "d.json",
                apply=True,
                i_have_a_backup=True,
                **{"from": "/Volumes/ExternalDrive", "to": "/Users/me/Dev"},
            )
        )
        # existing dest file preserved; incoming written as a sidecar
        assert (dest / "CLAUDE.md").read_text() == "# DIFFERENT existing config\n"
        assert (dest / "CLAUDE.md.from-src").exists()
