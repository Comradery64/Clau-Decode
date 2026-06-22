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


# ---------------------------------------------------------------------------
# Self-driving wizard: discovery, inference, phase detection, guard, guided merge
# ---------------------------------------------------------------------------
def _src_with_cwds(root, cwds):
    """A source dir whose projects carry the given cwds (one session each)."""
    proj = root / "projects"
    for i, cwd in enumerate(cwds):
        d = proj / f"p{i}"
        d.mkdir(parents=True)
        (d / "s.jsonl").write_text(json.dumps({"cwd": cwd, "type": "user"}) + "\n")
    return root


class TestDiscoverSources:
    def test_finds_native_and_mirror_profiles_with_projects(self, tmp_path):
        home = tmp_path
        (home / ".claude" / "projects").mkdir(parents=True)
        (home / ".cc-mirror" / "crad" / "config" / "projects").mkdir(parents=True)
        (home / ".cc-mirror" / "zai" / "config" / "projects").mkdir(parents=True)
        (home / ".cc-mirror" / "empty" / "config").mkdir(parents=True)  # no projects/
        found = {str(p) for p in migrate._discover_sources(home)}
        assert str(home / ".claude") in found
        assert str(home / ".cc-mirror" / "crad" / "config") in found
        assert str(home / ".cc-mirror" / "zai" / "config") in found
        assert not any("empty" in p for p in found)


class TestInferFromPrefix:
    def test_single_root(self, tmp_path):
        s = _src_with_cwds(tmp_path / "s", ["/Volumes/ExternalDrive/Dev/a", "/Volumes/ExternalDrive/Dev/b"])
        assert migrate._infer_from_prefix([s]).startswith("/Volumes/ExternalDrive")

    def test_picks_dominant_root_not_lookalike(self, tmp_path):
        s = _src_with_cwds(
            tmp_path / "s",
            ["/Volumes/ExternalDrive/Dev/a", "/Volumes/ExternalDrive/Work/b", "/Volumes/ExternalDriveCard/c"],
        )
        # most common depth-2 root wins; must NOT broaden to /Volumes
        assert migrate._infer_from_prefix([s]) == "/Volumes/ExternalDrive"

    def test_none_when_no_cwds(self, tmp_path):
        (tmp_path / "s" / "projects").mkdir(parents=True)
        assert migrate._infer_from_prefix([tmp_path / "s"]) is None


class TestDetectPhase:
    def test_merge_when_bundle_staged_and_dest_sparse(self, tmp_path):
        (tmp_path / "b" / "native" / "dot-claude" / "projects").mkdir(parents=True)
        # dest ~/.claude has no sessions → new machine importing the bundle
        assert migrate._detect_phase(tmp_path / "b", tmp_path / "dest") == "merge"

    def test_capture_when_no_staged_bundle(self, tmp_path):
        (tmp_path / "b").mkdir()
        assert migrate._detect_phase(tmp_path / "b", tmp_path / "dest") == "capture"

    def test_capture_when_staged_but_dest_rich(self, tmp_path):
        # bundle staged AND local ~/.claude already full → old machine, re-capture
        (tmp_path / "b" / "native" / "dot-claude" / "projects").mkdir(parents=True)
        dest_proj = tmp_path / "dest" / "projects"
        for i in range(6):
            d = dest_proj / f"p{i}"
            d.mkdir(parents=True)
            (d / "s.jsonl").write_text("{}\n")
        assert migrate._detect_phase(tmp_path / "b", tmp_path / "dest") == "capture"


class TestGuided:
    def test_non_tty_guard_returns_2(self, tmp_path, monkeypatch):
        monkeypatch.setattr(migrate.sys.stdin, "isatty", lambda: False)
        assert migrate._guided(_args(bundle=tmp_path / "b")) == 2

    def test_guided_merge_end_to_end(self, tmp_path, monkeypatch):
        # A staged bundle → the wizard auto-detects the 'merge' phase.
        bundle = tmp_path / "bundle"
        _make_source(bundle / "native" / "dot-claude")  # cwd /Volumes/ExternalDrive/Dev/app
        dest = tmp_path / "dest"

        monkeypatch.setattr(migrate.sys.stdin, "isatty", lambda: True)
        answers = iter(
            [
                "",  # Proceed with merge? (default Y)
                "",  # FROM prefix (accept the inferred default)
                "/Users/me/Dev",  # TO prefix
                "y",  # Apply?
            ]
        )
        monkeypatch.setattr("builtins.input", lambda *a, **k: next(answers))

        # No --source/--capture → run() dispatches to the guided wizard.
        rc = migrate.run(
            _args(bundle=bundle, dest_dir=dest, dest_json=tmp_path / "d.json")
        )
        assert rc == 0

        # The staged session relocated under the new prefix, cwd rewritten.
        relocated = dest / "projects" / "-Users-me-Dev" / "sess1.jsonl"
        assert relocated.exists()
        assert not any(
            '"cwd":"/Volumes/ExternalDrive' in p.read_text()
            for p in (dest / "projects").rglob("*.jsonl")
        )


class TestReRunAndSupersede:
    """Re-running a real (path-rewriting) migration must be idempotent, and a newer
    (longer) version of the same session UUID must win under the canonical name —
    never a .dup file that `claude --resume` can't see."""

    def _merge(self, src, dest, dj, tmp):
        return migrate.run(
            argparse.Namespace(
                source=[src],
                source_json=[],
                dest_dir=dest,
                dest_json=dj,
                frm="/Volumes/ExternalDrive",
                to="/Users/me/Dev",
                no_configs=True,
                apply=True,
                i_have_a_backup=True,
                capture=False,
                guided=False,
                bundle=tmp / "b",
            )
        )

    def test_rerun_with_rewrite_is_idempotent(self, tmp_path):
        src, _ = _make_source(tmp_path / "src")
        dest, dj = tmp_path / "dest", tmp_path / "dj.json"
        self._merge(src, dest, dj, tmp_path)
        before = {p.name for p in (dest / "projects").rglob("*.jsonl")}
        self._merge(src, dest, dj, tmp_path)  # re-run, same rewrite
        after = {p.name for p in (dest / "projects").rglob("*.jsonl")}
        assert before == after, "re-run added/renamed files"
        assert not any(".dup-" in n for n in after), (
            "re-run produced junk .dup sidecars"
        )

    def test_newer_session_wins_under_canonical_name(self, tmp_path):
        src, _ = _make_source(tmp_path / "src")
        dest, dj = tmp_path / "dest", tmp_path / "dj.json"
        self._merge(src, dest, dj, tmp_path)
        # the session grows (a turn is appended) in the source, same UUID/filename
        sess = src / "projects" / "-Volumes-SD-Dev-app" / "sess1.jsonl"
        sess.write_text(
            sess.read_text()
            + json.dumps({"sessionId": "sess1", "type": "assistant"})
            + "\n"
        )
        self._merge(src, dest, dj, tmp_path)
        canon = dest / "projects" / "-Users-me-Dev-Dev-app" / "sess1.jsonl"
        siblings = sorted(p.name for p in canon.parent.glob("*.jsonl"))
        assert siblings == ["sess1.jsonl"], (
            f"expected only the canonical file, got {siblings}"
        )
        assert len(canon.read_text().splitlines()) == 2, (
            "canonical file is not the newer/longer one"
        )
