# Phase 4 (deferred) — Live Codex driving via a tmux-backed ProviderDriver

Phases 0–3 of the multi-provider plan shipped (provider seam, ClaudeAdapter,
CodexAdapter decode, ChatGPT-native skin). Phase 4 — driving a **live** Codex
session — is deferred. This note preserves the de-risking spike so the next
session can start from a known-good baseline instead of re-discovering it.

## Spike findings (verified 2026-06-18 on this machine)

- **tmux**: `3.6b` present at `/opt/homebrew/bin/tmux`.
- **codex**: `codex-cli 0.137.0` at `~/.nvm/.../bin/codex`. Auth: **logged in via ChatGPT** (`codex login status` → "Logged in using ChatGPT"). No API key plumbing needed for the local user.
- **Spawn (new interactive session)**: `codex [OPTIONS] [PROMPT]`, run with `cwd` = the session's working dir. Relevant flags:
  - `-m, --model <MODEL>` (e.g. `gpt-5.5`).
  - `-s, --sandbox <read-only|workspace-write|danger-full-access>`.
  - `-c key=value` to override `~/.codex/config.toml` values (TOML-parsed).
- **Resume by id**: `codex resume <SESSION_ID> [PROMPT]` where `SESSION_ID` is the **session UUID**. This is exactly the value `CodexAdapter.parse` already stores as `Session.id` (from `session_meta.payload.id`), so resume wiring is trivial — no id translation needed.
- **Fork**: `codex fork` exists (`--last` or by id) → maps to a future `can_fork`.

## Why tmux (not Claude's direct-PTY path)

Claude's `pty_native`/`pty_runner` ready/idle/login state machine is tuned to
Claude's TUI. Reusing it for Codex would mean rebuilding a Codex-specific TUI
state machine and re-hitting the scroll/persistence bugs. A tmux-backed driver
is generic across future CLIs, gives persistence/idle-survival for free (fixes
the 5-min-reaper-kills-long-tasks problem), and decouples session lifetime from
the app. **Claude stays on its tuned direct-PTY path untouched** — the tmux
driver is additive, proven first on Codex.

## Proposed implementation (unchanged from the plan)

1. **`src/clau_decode/drivers/tmux_driver.py`** — a `ProviderDriver`:
   - Lifecycle: isolated tmux server (`tmux -L clau-codex new-session -d -s <sid> -x <cols> -y <rows> 'codex resume <uuid> ...'`), `send-keys` for input (chunked for long pastes), `capture-pane -p -e` for state, `kill-session`/`kill-server` on teardown.
   - Bridge the pane PTY to the existing xterm.js Native view (raw byte bridge, same transport as the current Native terminal).
   - Ready/idle detection by polling `capture-pane` for Codex's prompt/idle markers (reference omnigent `inner/codex_harness.py` / `codex_native_harness.py`).
   - **Detect tmux absence and degrade**: if `tmux` is not on PATH, Codex stays read-only (caps already False) — never hard-fail.
2. **Capability gates (server)** — add `_require_capability(session, attr)` that looks up `registry.get(session.provider).capabilities` and returns **409** for unsupported ops. Gate `pty_submit`, `open-terminal`, fork/edit endpoints. `SessionDetail.provider` is already exposed (Phase 0/3) so the FE can enable/disable affordances per provider.
3. **FE affordance gating (the read-only-honesty gap — found 2026-06-21).** With the skin shipped, a read-only Codex session (`can_send=False`) still renders Claude's **composer** verbatim: the "How can I help you today?" placeholder, the `Auto · bypassPermissions` mode footer, and an **enabled send button**. This is not just cosmetic — submitting routes to `pty_submit`, which would try to spawn a **`claude`** PTY against the Codex session's `cwd` (wrong binary, and the cwd is often deleted). The same applies to the **Decoded/Native/Split** view toggle (Native = the Claude PTY bridge, meaningless for Codex until the tmux driver exists) and the fork/edit buttons (`can_fork/can_edit=False`). Phase 4 must drive ALL these affordances off the provider's `ProviderCaps` (fetch caps or read them off `SessionDetail`): hide/disable the composer when `!can_send`, hide the Native toggle until the Codex driver is wired, hide fork/edit when unsupported, and swap the Claude-specific placeholder/footer for provider-aware text. **Interim option (if Phase 4 stays on hold):** a small FE guard that, for `provider==="codex"`, hides the composer + Native toggle and shows a "read-only — live Codex driving not yet supported" note. This stops the misleading/incorrect affordances now; replace the hardcoded `provider` check with the real `ProviderCaps` gate when Phase 4 lands.
4. **Native-view FE wiring** — enable the Native terminal for Codex sessions; the "login required" label is already provider-aware (Phase 3).
5. **Flip caps** — `CodexAdapter.capabilities` → `can_send=True, can_resume=True` (keep `can_fork=False, can_edit=False` until those flows exist). This is what re-enables the composer/Native affordances gated in step 3.

## Verification that requires a human (why this was deferred)

The driver *core* (spawn/send/capture/resume/kill) is headlessly testable
against the real `codex` binary. But the plan's Phase-4 manual check — drive a
live Codex session in the Native view, disconnect/idle, confirm the task
survives and reattaches — needs a browser and real model turns, so it can't be
certified headlessly. Land the tested backbone first, then do the live drive
with a human in the loop.

## Open risks
- Codex TUI ready/idle markers are the main unknown — confirm against
  `capture-pane` output before trusting them.
- tmux is a new runtime dependency; gate + degrade (above).
