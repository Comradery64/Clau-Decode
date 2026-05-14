#!/usr/bin/env python3
"""Fake ``claude`` binary for unit tests.

Mimics ``claude --print --resume <id> --input-format stream-json
--output-format stream-json`` enough to exercise the
``ClaudeCodeRunner``: reads NDJSON from stdin and writes NDJSON to
stdout. Behavior is controlled via argv flags and environment vars so
tests can drive the assorted code paths without spawning the real CLI.

Flags (parsed loosely — unknown flags are ignored so a realistic
claude-style argv passes through):
  --echo (default)
        Echo each input line back as ``{"type": "assistant", "text":
        "echo:<input>"}`` then exit on EOF.
  --silent
        Drain stdin, emit *nothing* to stdout, exit. Simulates a hung
        default-mode turn (the runner's quiet-turn watchdog target).
  --slow N
        Sleep ``N`` seconds between reading a line and emitting the
        echo. Useful for "is_busy is True while the proc lives" tests.
  --burst N
        Emit ``N`` stdout lines rapidly for each input line. Tests the
        drain-pump under load.
  --bytes N
        Pad each emitted JSON line so the total stdout for one turn is
        at least ``N`` bytes. Used to verify the stdout drain doesn't
        block on long output.
  --capture-argv FILE
        Write ``json.dumps(sys.argv)`` to ``FILE`` (one shot, before
        anything else). Tests assert on the argv the runner spawned
        the subprocess with (e.g. ``--permission-mode <mode>``).
  --capture-stdin FILE
        Append every line read from stdin verbatim to ``FILE``. Tests
        assert that the runner wrote a correctly-shaped NDJSON line.
  --pulse PERIOD COUNT
        Before processing input, emit ``COUNT`` stdout lines with
        ``PERIOD`` seconds between them. Used by quiet-age tests to
        produce a stream that goes silent for a while then resumes
        (combine with ``--silent`` or stop after pulse).
  --emit-error
        On the first input line, emit a single
        ``{"type": "error", "message": "fake"}`` line. Exercises the
        runner's error-line capture path.

Note on injection
-----------------
``ClaudeCodeRunner.submit()`` resolves the binary by name (the caller
passes ``bin_name``). Tests inject this script by writing a thin shim
(``#!/usr/bin/env python3\\nexec python3 fake_claude.py "$@"``) under
the desired ``bin_name`` into a tmp dir and prepending that dir to
``$PATH``. The runner then uses ``shutil.which(bin_name)`` to find the
shim.
"""

from __future__ import annotations

import json
import os
import sys
import time


def _parse_argv(argv: list[str]) -> dict:
    opts: dict = {
        "mode": "echo",
        "slow": 0.0,
        "burst": 1,
        "bytes": 0,
        "capture_argv": None,
        "capture_stdin": None,
        "pulse_period": 0.0,
        "pulse_count": 0,
        "emit_error": False,
        "recap_mode": False,
        "recap_text": "fake recap text",
    }
    i = 0
    while i < len(argv):
        a = argv[i]
        if a == "--silent":
            opts["mode"] = "silent"
        elif a == "--echo":
            opts["mode"] = "echo"
        elif a == "--slow":
            opts["slow"] = float(argv[i + 1])
            i += 1
        elif a == "--burst":
            opts["burst"] = int(argv[i + 1])
            i += 1
        elif a == "--bytes":
            opts["bytes"] = int(argv[i + 1])
            i += 1
        elif a == "--capture-argv":
            opts["capture_argv"] = argv[i + 1]
            i += 1
        elif a == "--capture-stdin":
            opts["capture_stdin"] = argv[i + 1]
            i += 1
        elif a == "--pulse":
            opts["pulse_period"] = float(argv[i + 1])
            opts["pulse_count"] = int(argv[i + 2])
            i += 2
        elif a == "--emit-error":
            opts["emit_error"] = True
        elif a == "--recap-mode":
            opts["recap_mode"] = True
        elif a == "--recap-text":
            opts["recap_text"] = argv[i + 1]
            i += 1
        i += 1
    return opts


def _emit(obj: dict, pad_to: int) -> None:
    line = json.dumps(obj)
    if pad_to > len(line) + 1:
        # Pad inside the JSON so the line stays valid and big.
        slack = pad_to - len(line) - len('"_pad":""') - 2
        if slack > 0:
            obj = dict(obj)
            obj["_pad"] = "x" * slack
            line = json.dumps(obj)
    sys.stdout.write(line + "\n")
    sys.stdout.flush()


def main() -> int:
    # Env-var overrides — tests sometimes can't easily mutate argv (e.g.
    # the runner builds argv internally), but they can mutate env.
    raw = list(sys.argv[1:])
    env_extra = os.environ.get("FAKE_CLAUDE_EXTRA_ARGV", "")
    if env_extra:
        raw.extend(env_extra.split())
    opts = _parse_argv(raw)

    if opts["capture_argv"]:
        with open(opts["capture_argv"], "w", encoding="utf-8") as f:
            json.dump(sys.argv, f)

    if opts["recap_mode"]:
        _emit(
            {"type": "result", "result": opts["recap_text"], "is_error": False},
            opts["bytes"],
        )
        return 0

    capture_stdin_fp = None
    if opts["capture_stdin"]:
        capture_stdin_fp = open(opts["capture_stdin"], "a", encoding="utf-8")

    # Optional pulse phase before consuming stdin.
    for _ in range(opts["pulse_count"]):
        _emit({"type": "assistant", "text": "pulse"}, opts["bytes"])
        if opts["pulse_period"]:
            time.sleep(opts["pulse_period"])

    emitted_error = False
    try:
        for line in sys.stdin:
            if capture_stdin_fp is not None:
                capture_stdin_fp.write(line)
                capture_stdin_fp.flush()

            if opts["slow"]:
                time.sleep(opts["slow"])

            if opts["emit_error"] and not emitted_error:
                _emit({"type": "error", "message": "fake"}, opts["bytes"])
                emitted_error = True
                continue

            if opts["mode"] == "silent":
                # Read but do not emit.
                continue

            text = line.rstrip("\n")
            for i in range(max(1, opts["burst"])):
                _emit(
                    {"type": "assistant", "text": f"echo:{text}", "_i": i},
                    opts["bytes"],
                )
    finally:
        if capture_stdin_fp is not None:
            capture_stdin_fp.close()

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
