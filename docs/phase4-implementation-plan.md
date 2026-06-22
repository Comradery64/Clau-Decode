# Phase 4 — Live Codex driving (tmux ProviderDriver): executable plan

**Status:** ready to execute. Spike already done (see `codex-live-driving-phase4.md`
for the validated facts: tmux 3.6b + codex 0.137.0 ChatGPT-auth present;
`codex resume <SESSION_ID>` takes the session UUID which IS our `Session.id`).
**Execute in a fresh session inside a dedicated git worktree** off `main`
(another session shares the primary working tree — isolate to avoid interleaved
commits). This doc is self-contained; a fresh session can run it from here.

---

## 0. Decisions locked (by the user)
1. **v1 drives Codex only via tmux.** Claude stays on its tuned direct-PTY path,
   untouched. Protect the working/revenue path.
2. **Converging Claude onto tmux is a LATER, OPTIONAL feature** — behind an
   opt-in setting, not wired in v1. The driver abstraction must be built so
   Claude *could* be routed through it later with no rework, but v1 does not do it.
3. **tmux is the POSIX backend now; native Windows is a FUTURE backend** under
   the same `ProviderDriver` abstraction, not a dead end (see Platform below).

## Platform & portability (the resolved Windows question)
- **The recall lens — decode / view / search / analytics — is already
  cross-platform** (pure file parsing + SQLite). It is the bulk of the product
  value and is unaffected by anything here. Windows users keep it fully.
- **The CLIs run on Windows; clau-decode's *transport* does not (yet).** Both
  `claude` and `codex` install/run natively on Windows. The only thing that's
  POSIX-only is clau-decode's PTY transport — the existing Claude path uses
  `pty` / `termios` / `fcntl` / `pty.openpty()` (`pty_runner.py`) with zero
  Windows handling. So the limitation is ours to lift, not the CLIs'.
- **Choosing tmux does NOT cost us Windows.** Native Windows driving requires a
  **ConPTY / `pywinpty` backend regardless** of tmux (Python's `pty` is POSIX-
  only), and that backend would serve *both* providers' Windows driving. So the
  real design is not "tmux vs Windows" — it's "which backends live under
  `ProviderDriver`, in what order." tmux wins for mac/linux because it gives
  **persistence / idle-survival for free** (the fix for the 5-min-reaper-kills-
  long-tasks bug); a ConPTY backend is the separate, later path to Windows.
- **Multi-backend by design.** `ProviderDriver` is the seam; backends are chosen
  at runtime by `availability()`. v1 ships exactly one backend (`TmuxDriver` —
  POSIX + `tmux`). The interface stays backend-neutral (no tmux assumptions leak
  above it) so a `ConptyDriver` *could* be added later — but see the Windows
  stance below: it is intentionally NOT a committed work item.
- **Strategy = detect + degrade, never force.** Driving is gated on a runtime
  `DriverAvailability` check. If no backend is available, the provider stays
  **read-only** (the capability-gated UI from 4c) — no hard failure.
- **Windows = WSL2 is the blessed path, by design (a feature, not a fallback).**
  On native Windows: full recall lens out of the box (cross-platform already),
  read-only Codex. For live driving, **the recommended path is WSL2** — and we
  treat that as a deliberate positive: it onboards Windows devs to WSL2 (a
  better dev environment for these CLIs anyway), and inside WSL2 the exact same
  tmux backend works with zero special-casing. README should present WSL2 as
  *the* Windows driving setup, not an apology.
- **Native-Windows driving (ConPTY/`pywinpty`, tmux-free) is deferred, demand-
  gated.** The abstraction keeps the door open, but we do not build it unless
  real users who genuinely can't use WSL2 ask for it. WSL2 covers Windows for
  v1 and beyond.

---

## Architecture

### Driver abstraction (`src/clau_decode/drivers/`)
- `base.py` — `ProviderDriver` ABC: `spawn(session, cols, rows)`, `send(data)`,
  output stream/`read`, `resize(cols, rows)`, `capture_state()`, `kill()`,
  `is_alive()`, and a classmethod/staticmethod `availability() -> DriverAvailability`
  (`{available: bool, reason: str|None}`). Keep it transport-agnostic so the
  existing Native xterm.js byte-stream wiring can consume it.
- `tmux_driver.py` — `TmuxDriver(ProviderDriver)`. **Generic CLI driver over an
  isolated tmux server**, parameterized by a `spawn_command: list[str]` builder
  so it is NOT Codex-specific (this is what enables the later optional Claude
  convergence). Mechanics validated in the spike:
  - Isolated server socket: `tmux -L clau-decode` (never the user's default
    server). One tmux *session* per driven clau-decode session: `cd_<sessionid>`.
  - Spawn (resume an existing read session — the v1 happy path):
    `tmux -L clau-decode new-session -d -s cd_<id> -x <cols> -y <rows> -c <cwd> \
      'codex resume <uuid>'`  (fresh-session spawn = `codex` with no resume; v1
    focuses on resume so a viewed Codex session becomes continuable).
  - **Input:** `tmux send-keys -t cd_<id> -l "<chunk>"` (literal, chunked for
    long pastes) + `send-keys -t cd_<id> Enter`.
  - **Output:** attach a thin client inside a Python pty
    (`tmux -L clau-decode attach -t cd_<id>`) and stream its raw bytes to the
    existing Native transport. **KEY BUILD-SPIKE DECISION (validate in 4a):**
    prefer *send-keys for input + attached-pty purely for output* (clean
    separation, avoids the attach client re-interpreting keys); fall back to
    writing directly to the attached client's stdin (lets us reuse `pty_runner`
    almost verbatim) only if send-keys proves lossy for the Codex TUI.
  - **State detection:** poll `tmux -L clau-decode capture-pane -p -e -t cd_<id>`
    for Codex's ready / idle / login / approval-prompt markers (this REPLACES
    Claude's `pty_screen_state` machine for Codex — Codex markers differ; capture
    real ones in 4a). Reference omnigent `inner/codex_harness.py` /
    `codex_native_harness.py`.
  - **Persistence / idle-survival:** the tmux session outlives the app process
    and any disconnect. Reattach = re-`attach` to the existing `cd_<id>`. The
    existing PTY reaper MUST NOT kill tmux sessions on disconnect — only on
    explicit user-stop or a long TTL. This is the feature that fixes
    "5-min reaper kills long tasks."
  - **Teardown:** `tmux -L clau-decode kill-session -t cd_<id>` on explicit stop;
    leave the server running across reconnects (kill the server only on a clean
    app shutdown or when no sessions remain).
- `registry.py` (or extend the provider registry) — provider → driver factory.
  v1: `codex → TmuxDriver(codex_spawn_builder)`; `claude → existing direct-PTY`.
  Shaped so a future setting can map `claude → TmuxDriver(claude_spawn_builder)`.

### Effective capability = static caps AND runtime availability
`ProviderCaps` are static per adapter, but real drivability depends on runtime
(tmux present). Compute `effective_can_send = adapter.caps.can_send AND
TmuxDriver.availability().available`. The server gates on the *effective* value;
the FE reflects runtime availability (e.g. "live driving unavailable: tmux not
found"). Do NOT make Codex look drivable on a box without tmux.

---

## Phased build (each phase ends green; 4a–4c are headlessly verifiable)

### 4a. Driver core + availability — the de-risking build-spike (no UI)
- Implement `drivers/base.py` + `drivers/tmux_driver.py` + the driver registry.
- Resolve the input/output bridge decision above against the REAL `codex` binary.
- Capture the actual Codex TUI ready/idle/login/approval markers from
  `capture-pane` and encode them in `capture_state()`.
- **Tests** (`tests/drivers/test_tmux_driver.py`): gate on
  `shutil.which("tmux") and shutil.which("codex")` with `pytest.mark.skipif`
  (so CI without them just skips). Cover: `availability()` true/false paths;
  spawn a trivial `codex` turn in tmux, `send()` a one-line prompt, `capture_state()`
  transitions running→idle, `kill()` tears down, double-kill is safe, reattach
  finds a live session. Also a pure-unit test of the spawn-command builder and
  the degrade path (availability false → no spawn).
- **Verify:** `pytest tests/drivers/ -q` green locally (skips on CI). Manually
  confirm `tmux -L clau-decode ls` is clean after teardown.

### 4b. Server capability gates + driver routing
- Add `_require_capability(session, attr)` → **409** for unsupported ops; gate
  `pty_submit`, `open-terminal`, fork/edit. Use *effective* caps (4 = caps AND
  availability).
- Route Codex submit/native through `TmuxDriver`; Claude unchanged.
- Add an availability field to `SessionDetail` (or a small `/api/providers`
  endpoint) so the FE knows driving is possible.
- Ensure the reaper excludes tmux-backed sessions from disconnect-kill.
- **Tests:** 409 on a read-only/no-tmux Codex submit; Claude submit path
  untouched; capability resolution unit tests. `pytest -q` green.

### 4c. FE affordance gating — "read-only honesty" (ships value even before 4d)
This is the gap found 2026-06-21 (see `codex-live-driving-phase4.md` item 3).
Drive every affordance off effective caps:
- Hide/disable the **composer** when `!effective_can_send` (today submitting on a
  read-only Codex session would wrongly spawn a *claude* PTY on the Codex cwd).
- Hide the **Decoded/Native/Split** toggle's Native option until Codex driving is
  wired (Native = the Claude PTY bridge).
- Hide **fork/edit** when unsupported.
- Replace Claude-specific composer text (`How can I help you today?`,
  `Auto · bypassPermissions` footer) with provider-aware copy.
- **Verify:** vitest green; dev-browser — a Codex session shows read-only
  affordances; a Claude session is byte-identical. Rebuild bundle.

### 4d. FE Native-view wiring to the Codex driver (the interactive part)
- Point the existing xterm.js Native transport at the Codex driver's byte stream
  + send path. Reuse the Native terminal component; the renderer is already
  provider-agnostic.
- Reconnect/reattach UX: returning to a driven Codex session re-attaches.
- **Verify:** needs a human (next phase).

### 4e. Flip capabilities (runtime-gated)
- `CodexAdapter.capabilities` → `can_send=True, can_resume=True` (keep
  `can_fork/can_edit=False`). Gating stays *effective* (availability-aware), so a
  no-tmux box still degrades to read-only. This re-enables the 4c affordances.

### 4f. Human-in-the-loop verification (cannot be done headlessly)
With a real ChatGPT-auth'd `codex` + tmux: drive a live Codex session in the
Native view; send a prompt; watch streamed output; **disconnect / idle past the
old reaper window and confirm the task survives and reattaches**; resume a
previously-viewed Codex session and continue it. Confirm Claude driving is
completely unchanged throughout.

### Future (NOT v1): optional Claude-on-tmux convergence
A setting that maps `claude → TmuxDriver(claude_spawn_builder)`. Revisit only
after the tmux driver proves out on Codex. The 4a abstraction must already
support it; v1 just doesn't wire it.

---

## Critical files
- **Add:** `src/clau_decode/drivers/{base,tmux_driver,registry}.py`;
  `tests/drivers/test_tmux_driver.py`.
- **Change:** `server.py` (`_require_capability`, Codex driver routing,
  availability exposure, reaper exclusion); `providers/codex.py` (cap flip, 4e);
  FE `ChatView` + composer + Native toggle (4c/4d); `api/types.ts`
  (availability); README (platform matrix + WSL2 note).
- **Untouched:** Claude `pty_runner.py` / `pty_native.py` direct-PTY path.

## Risks (watch these)
- **Codex TUI markers** (ready/idle/login/approval) are the main unknown — 4a
  must capture the real ones; don't trust assumed strings.
- **Input/output bridge** (send-keys vs attached-stdin) — decide in 4a with the
  real binary before building 4d on top of it.
- **Reaper** must exclude tmux sessions from disconnect-kill, or persistence
  breaks (regresses the very bug this fixes).
- **tmux absent** → must degrade to read-only cleanly (4 = effective caps).

## Execution checklist for the fresh session
1. `EnterWorktree` (or `git worktree add`) off `main`; confirm clean isolation
   from the other session in the primary tree.
2. Build 4a → 4f in order; each phase green before the next; commit per phase by
   explicit path; keep `ruff check .` **and** `ruff format --check .` clean
   (CI runs both, pinned ruff 0.15.12 — a prior phase shipped format drift).
3. 4a–4c are headlessly verifiable; pause at 4f for the human live drive.
4. Open a PR or merge to `main` per the user's call (commits local until asked).
