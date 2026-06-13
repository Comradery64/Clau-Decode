# PTY Runner Findings

**Last reconciled:** 2026-06-05

The Phase 1 findings have been superseded by the shipped PTY architecture. This
file keeps the durable lessons that still matter for maintenance.

## Durable Lessons

- `uvloop` cannot be trusted with `preexec_fn`; PTY child setup belongs in the
  wrapper module that becomes the child process before `exec`.
- Brand-new sessions need a pending metadata placeholder until the first JSONL
  appears on disk.
- PTY readiness is inferred from bracketed-paste enablement; submit may still
  proceed after a readiness timeout, but the server logs the race.
- Input acknowledgement and stalled-input events are PTY signals, not message
  content signals.
- The browser should render messages from JSONL-backed session detail and SSE,
  not raw terminal output.
- PTY ownership is enforced through lock sidecars plus process discovery, with
  takeover responsible for clearing stale cross-host metadata.

## Current Maintenance Surface

- Backend PTY lifecycle: `src/clau_decode/pty_runner.py`
- Server endpoints and pending-session placeholders: `src/clau_decode/server.py`
- Auth spawn environment: `src/clau_decode/_auth_env.py`
- Recap PTY fork flow: `src/clau_decode/recap_runner.py`
- Frontend submit/focus wiring: `frontend/src/components/ChatView/`
- Sidebar busy snapshots: `frontend/src/components/Sidebar/`

Historical endpoint and module names were removed from this note so repository
searches stay useful for detecting real regressions.
