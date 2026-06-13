# PTY Ownership / "Primary Source" Coordination Plan

**Status:** Drafted (no code).
**Drafted:** 2026-05-26 (post Wave-1 sign-off).
**Companion to:** `pty-runner-plan.md`. That plan introduced clau-decode's hidden-PTY runner; this one covers what happens when *another* `claude` process is reading/writing the same JSONL on the side.
**Estimated scope:** ~1 week for Phase 0+1 (the load-bearing ones). Phase 2 is opt-in and additive. Phase 3 is hygiene.

## Companion docs

- `pty-runner-plan.md` — the original PTY runner design. Currently through Phase 7 in flight; the runner spawns one hidden `claude` PTY per focused session.
- `cleanup-plan-2026-05-21.md` Tier C5 — the original sketch this doc expands. References preserved for traceability.

## Context

clau-decode's hidden PTY runner spawns `claude --resume <sid>` against `~/.claude/projects/<mangled-cwd>/<sid>.jsonl`. The JSONL is the system of record and is **the only thing that ties a logical "session" together**. Anyone — clau-decode, an interactive terminal, a CI script — can `claude --resume` the same `<sid>` against the same file at the same time. There is no mutual exclusion at the claude-binary layer.

The day-to-day failure mode this produces, observed during Wave 1 testing:

> User has a `claude` open in Terminal on session `abc`. User clicks `abc` in clau-decode's sidebar. clau-decode spawns its own `claude --resume abc`. Two claude processes now share one JSONL: each one's input clobbers the other's view, the TUI in Terminal seems to "lose" messages, JSONL writes may interleave in confusing orders, and the user thinks clau-decode is broken.

We need to **detect** the collision and **either coordinate or refuse**, with a UI affordance the user can drive.

## Conflict model

Roles for any given `<sid>`:

| Role | Description |
|---|---|
| **clau-decode owner** | A live `PtyChannel` in `PtyManager._channels[sid]`. Writes to JSONL via the spawned claude. |
| **terminal owner** | A `claude --resume <sid>` started outside clau-decode (interactive terminal, IDE plugin, etc). |
| **wrapped terminal owner** | A `claude --resume <sid>` started via the Phase 2 wrapper shim. Lock-aware. |
| **none** | No live claude has the JSONL open. |

Pairs of concern:

| A | B | Behavior we want |
|---|---|---|
| clau-decode | none | Normal operation. |
| terminal | none | Don't care; clau-decode is read-only via the file watcher. |
| clau-decode | terminal | **Avoid.** UI prompts; user picks a primary. |
| clau-decode | clau-decode (two tabs/processes) | Phase 3 serializes via submit lock. |
| terminal | terminal | Out of scope; the user did that and they get what they get. |

## Architecture overview

```
  ~/.claude/projects/<mangled-cwd>/
    └─ <sid>.jsonl                  ← system of record (untouched by this plan)
    └─ <sid>.jsonl.lock             ← NEW: sidecar written by clau-decode + wrapper shim
                                       JSON: {owner_kind, pid, hostname, heartbeat_at, ui_endpoint}
                                       Stale-eligible: heartbeat_at >5min OR pid not alive on hostname.
```

Detection happens at the boundary where it matters — on `PtyManager.focus(sid)`, before we spawn. Detection methods, in preference order:

1. **Lock sidecar present + fresh** — the authoritative signal once Phase 1 ships. Tells us not just "someone has it" but "this PID at this endpoint."
2. **`pgrep -f "(--resume|--session-id|-r)[= ]<sid>"`** — primary signal for unwrapped terminal claudes. Catches idle terminal TUIs (which empirically *do not* hold the JSONL fd between turns — see `pty-ownership-phase0-findings.md`). The flag-anchored regex avoids matching shell history / scripts that have the sid as plain text.
3. **`lsof -t <jsonl_path>`** — backstop. Catches the brief append window when a sid-hiding wrapper is mid-write. Originally specified as the sole Phase-0 detector; falsified during the spike — terminal claude opens / appends / closes per turn, so lsof at focus time has near-zero probability of catching an idle attachment.

The PTY runner already has `self._lock: asyncio.Lock` as a coarse top-level lock (`pty_runner.py:638`). Phase 3 adds per-session locks beneath it for submit serialization.

## Locked-in decisions

### Detection scope
- **Hybrid: argv pattern + JSONL file handles.** `pgrep -f "(--resume|--session-id|-r)[= ]<sid>"` is the primary signal — required because terminal claude doesn't hold the JSONL fd between turns (verified 2026-05-26; see findings doc). `lsof -t <jsonl_path>` is a backstop for the in-flight append moment. We *do* now enumerate by cmdline, with a flag-anchored regex to keep false-positive rate near zero. Wrappers / IDE plugins that hide the sid from argv remain uncaught until Phase 2's lock sidecar.
- **macOS + Linux only.** Windows users get a graceful fallback (Phase 0 just skips the checks; the lock sidecar in Phase 1 still functions but `pgrep`/`lsof` detection is unavailable). Documented as an explicit limitation.

### Lock sidecar
- **Path:** `<jsonl_path>.lock` next to the JSONL. Same directory, same mangled-cwd structure, no separate cache dir to keep in sync.
- **Format:** JSON. Schema:
  ```json
  {
    "owner_kind": "clau-decode",
    "pid": 12345,
    "hostname": "alans-mbp.local",
    "heartbeat_at": "2026-05-26T14:30:01.234Z",
    "ui_endpoint": "http://127.0.0.1:4242"
  }
  ```
- **Heartbeat:** 30 s while the channel is alive. Stale threshold: `heartbeat_at` >5 min old. The threshold is the **cross-host** signal; on the same host the `pid`-alive probe is authoritative (a busy event loop may delay a heartbeat without meaning the lock is stale).
- **Self-healing:** if `pid` is not alive on `hostname` *and* the hostname matches ours, the lock is stale (ESRCH). For a different hostname we fall back to the heartbeat threshold. Survives reboot / power loss without manual cleanup.
- **Atomic acquire — O_EXCL, not rename + re-read.** Implementation uses `os.open(O_CREAT|O_EXCL|O_WRONLY)`; on `FileExistsError` we read the existing sidecar and decide (self → refresh, fresh foreign → raise, stale → unlink + retry). The plan originally drafted "atomic-rename write + re-read for race detection," but that pattern can't actually detect a lost race (every writer's content wins on `os.replace`). O_EXCL gives real exclusion at the FS layer. *Heartbeat refresh* still uses the tmp + `os.replace` pattern — that's exclusive by virtue of being run only from the owning channel's heartbeat task. The watcher already filters by exact `.jsonl` suffix so `.lock` / `.lock.tmp` files are silently ignored — no scanner change needed.

### Take-over semantics
- **Soft signal first.** `SIGINT` (Ctrl-C equivalent) to the terminal claude. It interrupts any in-flight turn but lets claude flush its JSONL state. If the user has unsent typing, it's lost — that's true of Ctrl-C in any terminal already.
- **Confirmation required.** Take-over is destructive (kills another process); never auto-take. UI shows the foreign owner's metadata (PID, hostname, "Web UI at ..." if the wrapper supplied it) and a "Take over" button. No "Take over without confirming" shortcut.
- **No SIGTERM/SIGKILL fallback.** If `SIGINT` doesn't free the JSONL within ~3 s, we surface a "still busy" error instead of escalating. Users can clean up themselves.

### Per-session submit lock (Phase 3)
- The current `self._lock` in `PtyManager` serializes all sessions; that's overkill and means a slow submit on session A blocks focus on session B. Phase 3 replaces it with `dict[str, asyncio.Lock]` keyed on session id, allocated lazily, cleaned up when the channel is killed.
- Submit, focus, and kill on the **same** session id contend; cross-session ops don't.

## Phase 0 — Detection + UI badge

**Goal:** clau-decode notices when an external `claude` already has the JSONL open, surfaces it in the UI, refuses to spawn until the user picks. No new on-disk state.

**BE — `pty_runner.py` / `server.py`:**
- New helper `_session_conflict_pids(session_id, jsonl_path) -> list[int]`. Unions `pgrep -f "(--resume|--session-id|-r)[= ]<sid>"` (primary) and `lsof -t <jsonl_path>` (backstop), filters our server pid and any pid in `_OWN_CLAUDE_PIDS` (the module-level set maintained by `PtyChannel.start/kill`). Both subprocesses are cheap; tolerate either tool missing → its arm returns `[]`.
- `PtyManager.focus()` at the top:
  1. If we already have an alive channel for `sid`: fast-path (existing Wave-1 logic), nothing changes.
  2. Else, call `_session_conflict_pids(...)`. If non-empty → **don't spawn**; raise `PtyOwnershipConflict(foreign_pids=[...])`.
- New `/api/pty/ownership/{sid}` endpoint: returns `{status: "ours"|"terminal"|"idle", foreign_pids: [...], jsonl_path: "..."}`. Used by the FE to render the badge without provoking a spawn.
- New `/api/pty/takeover/{sid}` endpoint: `kill(pid, SIGINT)` each foreign pid, polls `_session_conflict_pids` for ~3 s until clear, and returns 200 so the frontend can follow up with `/api/pty/focus`. Returns 409 if still occupied after the timeout. (Q3 finding: SIGINT exits claude in ~310 ms when the foreign terminal is draining its pty; no SIGTERM/SIGKILL fallback per locked-in decision.)

**FE:**
- `useSessionDetail` already polls; expose `ownership.status` and `ownership.foreign_pids` on it (one extra column, BE-derived per request).
- `ChatView` renders a badge near `ConversationHeader` matching the cleanup-plan colour code: 🟢 here / 🟡 terminal / ⚪️ idle.
- If `status === "terminal"`: input is disabled (similar to `is_fork`), and a banner appears with "Open in your terminal — [Take over]". Clicking calls `/api/pty/takeover/{sid}`; success closes the banner, failure surfaces the error.

**Verify:**
- Open a session in `claude --resume <sid>` from a terminal. Click that session in clau-decode. Badge shows 🟡, input disabled, banner offers Take over.
- Click Take over. Terminal claude receives SIGINT, exits. Badge flips to 🟢. Submit works.
- Repeat with terminal claude in mid-stream (force a long turn). SIGINT interrupts; JSONL has a partial assistant turn (claude's normal behavior).

**Out of scope for Phase 0:**
- No lock sidecar yet — `lsof` is the only source of truth.
- No symmetric prompting from the terminal side (Phase 2).

## Phase 1 — Lock sidecar

**Goal:** Make the detection authoritative. `lsof` tells you "someone has the file"; the sidecar tells you "this clau-decode at this endpoint, last heartbeat 12 s ago." Enables Phase 2 symmetry.

**BE — new `src/clau_decode/locks.py` module:**

Promoted to its own module so Phase 2's `wrapper.py` can `import` the same lock-acquire/release/heartbeat logic without duplicating it in shell. Phase 2 depends on this.

- `LockSidecar` class (no longer leading-underscore; exported):
  - `LockSidecar.read(jsonl_path) -> LockSidecar | None`: read existing lock, return parsed record or `None`.
  - `LockSidecar.is_fresh()` / `is_stale()`: heartbeat >5 min old OR pid not alive on hostname → stale.
  - `LockSidecar.is_self()`: matches our own pid + hostname.
  - `LockSidecar.acquire(jsonl_path, owner_kind, ui_endpoint=None) -> LockSidecar`: atomic-rename write. If a fresh, non-self lock exists → raises `PtyOwnershipConflict`.
  - `LockSidecar.heartbeat_forever()`: 30 s loop bumping `heartbeat_at`. Designed to run as either an `asyncio.Task` (clau-decode side) or a daemon thread (wrapper side).
  - `LockSidecar.release()`: best-effort `os.remove`. Idempotent.

**BE — `pty_runner.py` integration:**
- `PtyChannel.__init__` calls `LockSidecar.acquire(...)`. `PtyChannel.kill()` calls `release()`. `_on_idle_kill` triggers release through the kill path.
- `_jsonl_owners` augmented: lock sidecar present + fresh → `[pid_from_lock]` even if `lsof` shows nothing (the wrapped terminal case). lsof-only + no lock → still trust `lsof`.

**FE:**
- `ownership.kind` field surfaced on the badge: 🟡 with hover tooltip showing `owner_kind`, `pid`, `hostname`, optional `ui_endpoint` link if the foreign owner is a wrapped clau-decode on the same machine.

**Edge cases the sidecar must handle:**
- Two clau-decodes on the same box racing `acquire` → atomic-rename + re-read pattern. Loser raises `PtyOwnershipConflict`.
- Stale lock from prior crash → pid not alive → treated as stale, taken silently.
- NFS / network filesystems → out of scope. Document as known limitation.
- Lock for a session whose JSONL got deleted out from under us → `acquire` succeeds (the lock file write doesn't depend on the JSONL existing); subsequent focus fails as it would anyway.

**Verify:**
- Cold start: lock sidecar appears on focus, disappears on kill / idle-kill.
- Kill `clau-decode` process with `SIGKILL` mid-channel. Restart. Lock is stale (pid dead), re-acquired silently.
- Two clau-decodes (different ports) racing the same session: second one's focus fails with conflict, UI offers Take over.

## Phase 2 — `claude-wrapper` shim (opt-in)

**Goal:** Symmetric coordination. A terminal user who aliases `claude` to the wrapper gets the same "this is open in clau-decode — take over?" prompt that clau-decode users get for terminal-owned sessions.

**Distribution:** Python `console_script` entry point in `pyproject.toml` (decision Q1 below). Ships alongside clau-decode via `pip install`. User opts in with one line in their shell rc:

```sh
alias claude=claude-wrapper
```

`pyproject.toml`:
```toml
[project.scripts]
claude-wrapper = "clau_decode.wrapper:main"
```

**`src/clau_decode/wrapper.py` (new module):**

```python
def main() -> None:
    argv = sys.argv[1:]
    sid = _extract_resume_sid(argv)  # parse --resume <sid> / --session-id <sid>
    if sid is None:
        # Pass-through fast path. Most invocations don't touch a session
        # (e.g. `claude --help`, `claude /login`) — keep the Python
        # overhead off them so the alias is invisible.
        os.execvp(_real_claude_path(), ["claude", *argv])
        return  # unreachable

    jsonl_path = _derive_jsonl_path(sid)         # reuse parser._unmangle_project_id
    existing = _LockSidecar.read(jsonl_path)
    if existing is not None and existing.is_fresh() and not existing.is_self():
        print(
            f"Session {sid} is open in clau-decode "
            f"({existing.ui_endpoint}). Take over here? [y/N] ",
            end="",
            flush=True,
        )
        ans = sys.stdin.readline().strip().lower()
        if ans != "y":
            sys.exit(0)
        _request_takeover(existing.ui_endpoint, sid)   # POST /api/pty/takeover/{sid}
        _wait_for_vacancy(jsonl_path)                  # poll lsof, up to 3s

    lock = _LockSidecar.acquire(
        jsonl_path,
        owner_kind="claude-wrapper",
        ui_endpoint=None,         # terminal has no UI endpoint
    )
    atexit.register(lock.release)
    signal.signal(signal.SIGINT,  lambda *_: (lock.release(), sys.exit(130)))
    signal.signal(signal.SIGTERM, lambda *_: (lock.release(), sys.exit(143)))
    threading.Thread(target=lock.heartbeat_forever, daemon=True).start()

    os.execvp(_real_claude_path(), ["claude", *argv])
```

**Implementation notes:**
- `_real_claude_path()` resolves to the genuine `claude` binary, not back to the wrapper. Strategy: scan `$PATH` for `claude`, skip the entry whose realpath matches `sys.argv[0]`. (Plus respect a `CLAU_DECODE_REAL_CLAUDE` env override for cc-mirror users whose `claude` is itself a wrapper.)
- HTTP take-over request uses stdlib `urllib.request` — no `curl` dependency.
- Lock heartbeat in a daemon thread: 30 s interval, atomic write via `os.replace`. Daemon dies with the process so we never leak the heartbeat past `os.execvp` (the exec replaces the whole process image, threads included).
- `_LockSidecar` module lives in `src/clau_decode/locks.py` (new), imported by both `pty_runner.py` (Phase 1) and `wrapper.py`. Single source of truth.

**Verify:**
- Aliased terminal, session active in clau-decode: terminal prompts; "Take over" works; clau-decode's badge flips 🟡.
- Aliased terminal, no clau-decode running: terminal opens normally, lock is written, clau-decode (if started later) sees 🟡 from the wrapped terminal.
- `claude --help` through the wrapper: ~80–150 ms Python startup overhead before exec'ing real claude; argv pass-through is bit-exact.
- Wrapper SIGKILL'd mid-session: lock is stale on next read (pid not alive); self-heals.

## Phase 3 — Per-session submit lock

**Goal:** Prevent two clau-decode tabs from racing each other to submit on the same session. Pure hygiene, no UX change.

**BE:**
- `PtyManager._session_locks: dict[str, asyncio.Lock]`, defaulted via `setdefault`.
- `PtyManager.submit(sid, ...)`, `focus(sid, ...)`, `kill(sid)` all `async with self._session_locks[sid]:` for their session-id-touching critical section.
- Existing `self._lock` retained for `_channels` table mutations only — it stops being the contention point for the hot path.

**Verify:**
- Two browser tabs on the same session, both submit at ~the same instant. JSONL records exactly two user turns in order (no interleaving). Backend logs show one submit completing before the other starts the PTY write.

## Phase dependencies

```
Phase 0 (lsof + UI)
    └── Phase 1 (lock sidecar)        ← upgrades Phase 0 detection to authoritative
            └── Phase 2 (wrapper shim) ← needs lock to be authoritative
    └── Phase 3 (per-session lock)    ← independent of detection; can ship parallel with 0
```

Suggested order: **Phase 0 → Phase 3 → Phase 1 → Phase 2**. Phase 0 unblocks the visible UX problem; Phase 3 is a small de-risking step in the same neighbourhood; Phase 1 promotes detection to authoritative; Phase 2 is the symmetric "complete the loop" story.

## Risk register

| Risk | Mitigation |
|---|---|
| `lsof` not installed on user's box | Detection fails open (returns `[]`); we'd spawn anyway. Same behavior as today. Documented limitation. |
| `lsof` syscall slow on large fd tables (e.g., long-running tmux) | Only called at focus time (not per-keystroke). Worst-case ~50 ms; acceptable. |
| Stale lock blocks legitimate take-over | Self-heal via pid-alive check; 5 min heartbeat threshold. |
| SIGINT to terminal claude corrupts JSONL mid-write | claude already handles SIGINT cleanly (it's the same as Ctrl-C in the TUI). Pre-flight: if `lsof` shows mid-write activity (heuristic: file mtime within last 100 ms), warn the user. |
| User aliases `claude` to wrapper and wrapper is broken | Wrapper script is shell, passes through on any unhandled case (`set -e` only inside parseable subcommands). README documents how to unalias if anything goes wrong. |
| Cross-host sessions (NFS, network mount) | Out of scope; document. Cross-host take-over is meaningless anyway (we can't `kill(remote_pid)`). |
| Same session opened on two machines simultaneously | Lock includes `hostname`. UI shows "Open on `<other-host>`" — Take over is disabled (no cross-host kill). Read-only mode would be a future enhancement. |

## Out of scope (explicit non-goals)

- **Read-only / shadow mode** for foreign-owned sessions. The lock badge could grow into "follow live updates without taking over" — file watcher already gives us the data, but the UX is more involved (live indicator while another process types, read-only input, etc). Punt to a future doc.
- **Windows native** support beyond the no-op detection path. PR welcome.
- **Locking the JSONL itself** via OS file locks (`fcntl`, `flock`). Tempting but punishes claude — we don't want clau-decode's lock state to affect the binary we're coordinating with. The sidecar pattern keeps claude oblivious.
- **Multi-tab same-machine clau-decode UX** beyond the submit lock. If you open clau-decode in two browser tabs and click the same session in both, both UIs show 🟢 (same `ui_endpoint`); submits serialize. The "you have two tabs open" prompt is overkill.

## Resolved decisions

**Q1 — Wrapper distribution: `console_script` in `pyproject.toml`** ✅ (resolved 2026-05-26).

Locked in over the standalone `scripts/claude-wrapper` shell option. Reasoning:
- Wrapper version always matches the running clau-decode. Eliminates the "I shipped Phase 2 but my wrapper is still on Phase 0" skew bug that the standalone option silently invites.
- Python wrapper can `import` from `clau_decode`: reuses `parser._unmangle_project_id`, the `locks.py` module Phase 1 introduces, the scanner's cwd-mangling logic. Zero duplication, zero drift.
- Updates ride along with `pip install --upgrade clau-decode`.
- Overhead: ~80–150 ms Python startup on `claude` invocations that hit a `--resume`. Pass-through path (no `--resume`) is exec'd immediately — only one parse + one `os.execvp` before the user sees claude itself, so the alias is effectively invisible for non-session calls. Acceptable in context of claude's own ~500 ms boot.

**Q2 — Default behaviour when a foreign owner is detected: disable submit + show "Take over" banner** ✅ (resolved 2026-05-26).

Locked in over "allow submit + warn." Reasoning:
- The feature exists to prevent on-disk JSONL interleaving from two simultaneous claudes. Letting submit through after detection defeats that.
- The escape hatch (Take over) is one click. We aren't cornering the user — we're handing them the recovery action front-and-centre.
- "Allow + warn" banners decay into noise within days of regular use. Disable forces the explicit decision exactly once per conflict.
- Fallback line: if Phase 0 finds that SIGINT-to-take-over is unreliable (see Q3), we can revisit "allow + warn" as the lesser evil — but that's a Phase 0 empirical finding, not a default.

## Still open — Phase 0 empirical spike

**Q3 — SIGINT vs. SIGTERM for take-over.** The plan picks SIGINT (matches Ctrl-C in claude's TUI, claude is known to handle it cleanly). SIGTERM might be more reliable on a wedged/stuck claude that's stopped responding to the TUI. Phase 0 implementation should include a small spike: kill a healthy terminal claude both ways, kill a stuck-in-permission-prompt claude both ways, kill a mid-tool-call claude both ways. Lock in whichever both (a) exits within ~3 s and (b) leaves the JSONL in a parseable state. Document the finding in a Phase 0 findings doc; revisit if either signal proves flaky.
