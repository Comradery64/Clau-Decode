# Code Review — 2026-05-27

**Superseded:** 2026-06-05

This review originally captured migration risks while the PTY work was still in
flight. The actionable findings have since been resolved or moved into current
maintenance docs.

## Current Status

- Chat submit, stop, focus, blur, sidebar busy state, and recap now use the PTY
  path.
- The stale cross-host takeover issue was resolved by clearing fresh foreign
  sidecars during takeover while leaving unreachable remote processes alone.
- Pending-session placeholders cover the brand-new-session JSONL race.
- Trust pre-flight logging is consistent.
- The obsolete warmup plan doc was removed.

## Verification Pointers

- `tests/test_server.py`
- `tests/test_locks.py`
- `tests/test_pty_runner.py`
- `tests/test_pty_runner_btw.py`
- Frontend Vitest suites under `frontend/src/`

Historical implementation names were removed from this file so broad repository
searches identify only active regressions.
