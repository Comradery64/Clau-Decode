# PTY Runner Current State

**Last reconciled:** 2026-06-05

The PTY runner migration is shipped. This document now records the current
contract instead of the superseded phased plan.

## Current Contract

- Chat submit uses `POST /api/pty/submit`.
- Focus warmup uses `POST /api/pty/focus`.
- Blur cleanup uses `POST /api/pty/blur` only when a session is focused.
- Stop uses `POST /api/pty/kill`.
- Sidebar busy state is derived from `PtyManager` via the current batch status
  endpoint.
- Recap generation drives a hidden PTY against a forked session.
- Authentication environment handling is centralized in `_auth_env.py` and is
  shared by PTY-backed spawn sites.
- Ownership sidecars protect PTY sessions from duplicate writers and stale
  cross-host metadata is cleared by takeover.

## Runtime Shape

```text
React ChatView
  -> api.ptyFocus / api.ptySubmit / api.ptyKill / api.ptyBlur
  -> FastAPI PTY endpoints
  -> PtyManager
  -> hidden pseudo-terminal
  -> local claude-compatible binary
  -> JSONL watcher
  -> SQLite index
  -> SSE refresh
  -> React ChatView
```

The browser never displays terminal output directly. JSONL remains the
canonical message source; PTY output is used for readiness, input
acknowledgement, stalled-input detection, auth prompts, trust prompts, stuck
session detection, and idle lifecycle signals.

## Verification Anchors

- `tests/test_pty_runner.py`
- `tests/test_pty_runner_btw.py`
- `tests/test_server.py`
- `tests/test_recaps.py`
- `frontend/src/components/ChatView/__tests__/ChatInput.test.tsx`

## Notes

Older planning text was removed from this file after the migration shipped so
searches for retired implementation names only reflect live regressions, not
historical prose.
