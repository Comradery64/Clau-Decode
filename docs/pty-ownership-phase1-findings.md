# PTY-Ownership Phase 1 — Lock Sidecar

**Date:** 2026-05-27.
**Companion to:** `pty-ownership-plan.md` (Phase 1 section) and `pty-ownership-phase0-findings.md`.
**Verdict:** Shipped. Lock sidecar (`<jsonl>.lock`) now appears on every clau-decode-spawned channel and is consulted by the Phase-0 detector as a third signal alongside `pgrep` and `lsof`.

## What was built

- New module `src/clau_decode/locks.py`:
  - `LockSidecar` dataclass — `acquire(jsonl_path, owner_kind, ui_endpoint=None)`, `release()`, `start_heartbeat()`, `read(jsonl_path)`, `is_self()` / `is_fresh()` / `is_stale()`.
  - `LockAlreadyHeld` exception, caught in `PtyChannel.start` and promoted to `PtyOwnershipConflict` so the existing HTTP-409 path handles it uniformly.
- `PtyChannel` acquires on `start()` (before allocating the PTY pair, so a lost race never starts a subprocess), releases on `kill()` (after subprocess reap, so a peer can't acquire while we're still mid-tear-down).
- `PtyManager.__init__` gains a `ui_endpoint` parameter; the server passes `http://<host>:<port>` so peer clau-decodes reading the sidecar can render a clickable link in their take-over banner.
- `_session_conflict_pids` now unions three signals: `pgrep -f` (primary), `lsof -t` (backstop), and the lock sidecar (authoritative for cooperating writers — clau-decode now, Phase 2's `claude-wrapper` later). Same-host sidecars contribute their pid; cross-host sidecars contribute only metadata.
- `PtyManager.ownership` returns a new `foreign_owner: {kind, pid, hostname, ui_endpoint, heartbeat_at} | null` block — populated from the sidecar when present.
- FE `ConversationHeader` badge tooltip and `OwnershipBanner` render the structured metadata when available, falling back to the bare-pid copy when only Phase-0 signals fired (unwrapped terminal claude).

## Implementation deviation from the plan

**Atomic acquire uses `O_EXCL`, not "atomic rename + re-read."** The plan drafted *"write to `<lock>.tmp` then `os.replace` over `.lock`; re-read to detect race losers."* That pattern can't actually detect a lost race — every writer's content wins on `os.replace`, so each subsequent re-read sees its own write and thinks it won. There is no race-detection signal.

The implementation uses `os.open(O_CREAT|O_EXCL|O_WRONLY)`:
- Success path: we hold the lock; write payload, close fd.
- `FileExistsError`: read the existing sidecar. If self → refresh in place. If fresh foreign → raise `LockAlreadyHeld`. If stale → `os.unlink` and retry (3 attempts).

Heartbeat refresh still uses tmp + `os.replace` — that's exclusive by virtue of being run only from the owning channel's heartbeat task.

Plan updated inline so the next reader sees the as-built pattern, not the drafted one.

## Staleness contract — what "stale" actually means

The plan describes one staleness rule ("heartbeat >5 min OR pid not alive on hostname"). The implemented rule is more nuanced:

- **Same host (`hostname == socket.gethostname()`):** `os.kill(pid, 0)` is authoritative.
  - `ESRCH` → process gone → stale (taken over silently).
  - `EPERM` → process exists but owned by another user → considered fresh (we treat it as foreign-but-uncoordinable; the operator must clean up).
  - alive → fresh, regardless of heartbeat age (a busy event loop can defer a heartbeat without meaning the lock is stale).
- **Cross host:** we can't probe the pid. Fall back to the heartbeat threshold (`STALE_AFTER_S = 5 min`). Older than that → stale (taken over silently). Newer → fresh; surfaced via `foreign_owner` so the FE can render "Open on peer-host" — the **Take over** button is still shown but the BE's `os.kill` would fail, which is fine: it produces the existing 403 with "take over manually" copy.

This is what the test suite encodes: same-host-dead-pid → taken over; cross-host-old-heartbeat → taken over; same-host-alive-pid → raises `LockAlreadyHeld` regardless of heartbeat freshness.

## What this Phase didn't change

- **Detection coverage for unwrapped terminal claudes.** Still relies on Phase 0's `pgrep`. A `claude --resume <sid>` launched without the Phase-2 wrapper still writes no sidecar; pgrep sees its argv; lsof catches the mid-write window. Phase 1's value is *for cooperating writers* — i.e. clau-decode now, `claude-wrapper` later.
- **Cross-host signalling.** Plan documented as out of scope. The sidecar carries `hostname` so we surface "open on peer-laptop.local" honestly in the UI, but the BE's `os.kill` is local-only. Cross-host take-over would require an RPC channel we deliberately haven't built.
- **NFS / network filesystems.** O_EXCL semantics vary on NFS. Out of scope, documented in `locks.py` docstring. If a user reports symptoms there, the workaround is to keep `~/.claude/projects` on a local FS (which it is by default).

## Verified end-to-end

- Lock file (`<jsonl>.lock`) appears immediately on `/api/pty/focus` and disappears on `/api/pty/kill`. Verified via `ls` + the live server's HTTP endpoints.
- `GET /api/pty/ownership/{sid}` returns `foreign_owner: null` when only Phase-0 signals fire, populated when a sidecar is present.
- FE renders the foreign owner inline:
  - Badge tooltip: `Open in claude-wrapper @ peer-laptop.local (pid 3106) — http://192.168.1.99:4242`.
  - Banner: full sentence + clickable `<a href="http://192.168.1.99:4242">` link.
- Hand-written foreign sidecar (different hostname, alive pid) triggers the badge → 🟡; removing the sidecar flips back to ⚪️ on the next 5 s poll tick.
- 13 new unit tests in `tests/test_locks.py` cover acquire / release, O_EXCL exclusion, `is_self`, stale-pid-dead takeover, cross-host heartbeat-expired takeover, heartbeat task refresh, release-cancels-heartbeat. Full BE suite: 408 passed (+19 from the 389 baseline after Phase 3; the delta is the 13 lock tests plus 6 that flowed in via the parallel-session WIP).

## Carry-overs for Phase 2

- `LockSidecar.acquire` can be called with `owner_kind="claude-wrapper"` — that's the entire BE-side contract. Phase 2 writes a sidecar with that kind from inside the wrapper's Python entry point before exec'ing real claude.
- The atexit + signal-handler release pattern from the plan (lines ~200 of `pty-ownership-plan.md` Phase 2 section) is still the right shape — daemon-thread heartbeat instead of asyncio task, because the wrapper isn't in an event loop.
- The FE already renders `kind: "claude-wrapper"` correctly; no FE work needed for Phase 2.
