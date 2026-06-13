# PTY-Ownership Phase 0 — Empirical Findings

**Date:** 2026-05-26.
**Companion to:** `pty-ownership-plan.md` (Q3 spike + a plan-premise revision).
**Verdicts:**
- **SIGINT** for `/api/pty/takeover/{sid}`, 3 s polling budget. (Q3)
- **Hybrid detector** — `pgrep -f` is the primary signal; `lsof -t` is a backstop. Plan's lsof-only premise empirically fails for idle terminal claudes; mitigation below.

## Q3 — SIGINT vs SIGTERM for take-over

The plan picks SIGINT a priori (claude's TUI has explicit Ctrl-C handling and the runner already trusts it for `PtyChannel.kill()`). The spike was scoped to confirm or upend that choice with measurements.

### Setup

- Binary: `zai` (cc-mirror profile; same as the project's test profile).
- Spawned through a real `pty.fork()` so claude sees a slave TTY indistinguishable from a terminal launch — closest analogue to "terminal claude" that the runner does NOT control.
- Drained the master fd in the polling loop (see "v1 measurement artifact" below).
- Three states attempted, against a `--session-id` newly minted in a throwaway cwd:
  - **healthy** — TUI idle at the input prompt.
  - **mid-stream (API pending)** — prompt submitted, waiting on first token from zai.
  - **mid-stream (JSONL writes in flight)** — *not reproducible against zai inside a 90 s wait window.* zai latency masks this state; documented as a limitation, not a finding.

### Numbers

| Scenario                                | Signal           | Process exit | JSONL fd release |
|-----------------------------------------|------------------|--------------|------------------|
| healthy                                 | SIGINT (single)  | 0.31 s       | n/a (no JSONL)   |
| healthy                                 | SIGINT × 2 @200ms| 0.41 s       | 0.21 s           |
| healthy                                 | SIGTERM (single) | 0.32 s       | n/a (no JSONL)   |
| mid-stream (API pending)                | SIGINT (single)  | 0.31 s       | n/a (no JSONL)   |
| mid-stream (API pending)                | SIGINT × 2 @200ms| 0.41 s       | 0.21 s           |
| mid-stream (API pending)                | SIGTERM (single) | 0.31 s       | n/a (no JSONL)   |

Source: `/tmp/spike_q3_v2_results.json` and `/tmp/spike_q3_v3_results.json` on alans-mbp (not committed — re-run with `python3 tests/spike_q3.py` if you want fresh numbers; the scripts live under `/tmp/spike_q3*.py` for this run).

### Findings

1. **Both signals work** within the 3 s budget the plan calls for. The choice is on cleanliness, not viability.
2. **SIGINT is the canonical exit path.** claude's TUI registers an explicit SIGINT handler that emits the "Resume this session with: …" banner before reaping. SIGTERM exits faster but bypasses the user-visible goodbye banner — surprising in a terminal where the human can see the output, even if invisible in our HTTP-driven case.
3. **No empirical signal that one is safer than the other for JSONL writes** in the data we could collect. The 90 s wait window wasn't enough to drag zai through to "claude is actively appending to JSONL"; the mid-write case is the actual risk the plan's risk register addresses, and the spike couldn't synthesize it. **Inherit the plan's mitigation as-is:** the runner can heuristic-guard via `jsonl.stat().st_mtime > now - 100 ms` if we observe corruption in production. Nothing about SIGINT vs SIGTERM changes that.

### Decision

**SIGINT, no escalation.** Matches the plan's a priori pick and the existing `PtyChannel.kill()` first step. Implementation in `server.pty_takeover`:

- `os.kill(pid, signal.SIGINT)` to each foreign PID.
- Poll `_jsonl_owners(jsonl_path)` at 100 ms intervals up to 3 s.
- If still held at 3 s → 409 `{kind: "pty_takeover_timeout", still_held_by: [...]}` (no SIGTERM/SIGKILL fallback, per plan locked-in decision).
- `PermissionError` (e.g. process owned by another user) → 403 with a "take over manually" hint.

## Methodology note — v1 vs v2

A first-pass spike (`spike_q3.py`, v1) reported "claude did not exit within 5 s" for every scenario. That turned out to be a **measurement artifact**, not a finding:

- v1 did not drain the master_fd during the post-signal wait loop.
- claude's tear-down writes the goodbye banner + the terminal-restore escape sequence to its stdout (the pty slave).
- The pty buffer filled (\~few KB).
- claude blocked on a write to its now-stuck pty and could not finish exiting within the window.

v2 added an `os.read(fd, 4096)` inside the polling loop. Exit times dropped from "never within 5 s" to "~310 ms reliably."

In production this drain happens naturally — a terminal emulator continuously reads the master end of the user's pty. Our runner does NOT own the foreign claude's pty, but the user's terminal emulator does. So real-world take-over reproduces the v2 conditions, not v1.

**Lesson worth keeping:** when measuring signal-driven shutdown of a PTY-attached process, the PTY buffer is a load-bearing detail. Stuck buffers look identical to "signal ignored."

## Plan-premise revision — lsof alone is blind to idle terminal claudes

The plan picks `lsof -t <jsonl_path>` as the canonical detector for an attached terminal claude. The spike falsified that assumption.

**Setup:** spawned a real `zai --resume <existing-sid>` in a pty (via `pty.fork()` + `execvp`, cwd matching the session's mangled project dir), TUI mounted into the input prompt, no input sent. Polled `lsof -t <jsonl>` at 250 ms intervals for 15 s.

**Result:** zero PIDs reported in every tick, even though:

- The JSONL grew by 248 bytes at startup (claude opened it briefly on resume, wrote metadata, closed it).
- The claude process was alive and rendering its TUI throughout.
- `pgrep` confirmed the binary was running with the expected `--resume <sid>` argv.

**Interpretation:** terminal claude opens → appends → closes the JSONL per turn. The fd isn't held between turns. lsof only sees the fd during the tiny write window (~ms wide). Probability that a focus-time `lsof` happens to coincide with an in-flight append is effectively zero.

**Operational impact:** the canonical failure mode the plan was designed to prevent — "user has claude open in Terminal, clicks the same session in clau-decode, both attach and stomp on each other" — would not be caught by lsof at focus time. The badge would show 🟢 / ⚪️ even with terminal claude active.

### Mitigation — hybrid detector

`_session_conflict_pids(session_id, jsonl_path)` unions two signals (see `src/clau_decode/pty_runner.py`):

1. **`pgrep -f "(--resume|--session-id|-r)[= ]<sid>"` — primary.** Catches idle terminal claudes whose argv carries the sid. The flag-anchored regex eliminates false positives from shells / scripts that have the sid as plain text in their argv (verified — without the flag prefix, the test rig's own `python3 -c '... --resume <sid> ...'` was matching).
2. **`lsof -t <jsonl>` — backstop.** Catches the ~ms append window when a sid-hiding wrapper is mid-write. Phase 1's lock sidecar will subsume this for wrapped instances.

Filters: server pid (`os.getpid()`) and any pid in `_OWN_CLAUDE_PIDS` (a module-level set that `PtyChannel.start`/`kill` maintains). Without the own-set filter, focus-time detection would incorrectly flag a clau-decode-spawned claude as foreign.

### Known gaps (carry into Phase 1 + Phase 2)

- **Wrappers / IDE plugins that exec `claude` with the sid hidden in a config file or via stdin** are invisible to both signals. Phase 2's lock sidecar is the only path to coverage. Documented.
- **Brief window during a wrapper script's startup, before it exec's claude:** the wrapper's argv may not yet match the flag-anchored regex. Sub-second window; tolerated.
- **Multi-machine sessions** (the JSONL is on a shared FS, terminal claude is on another host): pgrep is local-only, lsof is local-only. The plan already documented this as out of scope.

## What we deliberately did NOT measure

- **Stuck-in-permission-prompt claude.** The plan listed it as one of the three states; we couldn't synthesize one in a non-interactive harness. If we see permission-prompt-stuck reports from users, re-run the spike against a real "Allow / Deny" prompt state and amend this doc.
- **Mid-tool-call claude.** Same shape — the spike would need an actual tool invocation in flight, which against zai means waiting 30 s–7 min per attempt. Out of scope for Phase 0; the plan's mtime-heuristic mitigation covers the operational risk.
- **Cross-user take-over.** Out of scope by design (the plan documents it as a future enhancement); the take-over endpoint returns 403 via `PermissionError` on `os.kill` if encountered.
