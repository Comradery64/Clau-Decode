"""A deterministic fake TUI for exercising ``TmuxDriver`` without the real
``codex`` binary (no auth, no network, no model spend, no flakiness).

It mimics the *shape* the driver cares about — and reuses the real Codex
marker strings — so the same ``capture_state`` detection code is exercised:

  * Idle: clears the screen and prints a composer line with "Context 100%
    left" (no dialog/running marker → classified IDLE).
  * On any input line: clears and prints "esc to interrupt" (→ RUNNING) for a
    beat, echoes the input, then returns to idle.

Run under a real TTY (the tmux pane). Input arrives bracket-pasted + Enter, so
ANSI/paste escapes are stripped before echoing.
"""

from __future__ import annotations

import sys
import time

_CLEAR = "\033[2J\033[3J\033[H"
_IDLE = "FAKE codex ready\n> _\ngpt-fake · Context 100% left · /tmp"
# Contains the real running marker so TmuxDriver.capture_state sees RUNNING.
_RUNNING = "• Working (1s · esc to interrupt)"

# Strip CSI escape sequences (incl. bracketed-paste ESC[200~/201~).
_CSI = "\033["


def _strip_escapes(s: str) -> str:
    out: list[str] = []
    i = 0
    while i < len(s):
        if s[i] == "\033":
            # skip ESC then up to the first letter or '~' terminator
            j = i + 1
            if j < len(s) and s[j] == "[":
                j += 1
            while j < len(s) and not (s[j].isalpha() or s[j] == "~"):
                j += 1
            i = j + 1
            continue
        if s[i].isprintable() or s[i] in " \t":
            out.append(s[i])
        i += 1
    return "".join(out)


def _emit(text: str) -> None:
    sys.stdout.write(_CLEAR + text + "\n")
    sys.stdout.flush()


def main() -> int:
    _emit(_IDLE)
    for raw in sys.stdin:
        line = _strip_escapes(raw).strip()
        if line == "__quit__":
            break
        _emit(_RUNNING)
        time.sleep(1.2)
        _emit(f"reply: {line}\n{_IDLE}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
