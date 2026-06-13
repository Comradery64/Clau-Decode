# Native KVM Dual View Design

Date: 2026-06-06
Branch: `feature/native-kvm-dual-view`
Base: `42d98f8 chore: clean up legacy references`

## Goal

Make clau-decode a KVM-style interface over Claude's real terminal session.
The PTY is the runtime. The decoded chat UI is a readable projection of that
runtime, not a replacement for it.

This replaces the current pattern of hiding terminal states and patching around
them with JSONL/SSE heuristics. Native Claude features such as
`AskUserQuestion`, slash menus, permission prompts, login prompts, trust prompts,
and modal UI should be handled in a native terminal view.

## Product Model

Each session has one live Claude PTY and two views over it:

- **Decoded View**: the existing polished transcript, search/archive metadata,
  message renderer, tool summaries, recaps, file viewer, and sidebar workflows.
- **Native View**: a browser terminal viewport showing Claude's actual TUI and
  routing raw keyboard input to the same PTY.

Switching views must not respawn Claude, change session id, change model, change
permission mode, or discard terminal state. It only changes presentation.

The intended feel is a seamless "old/new graphics" toggle: Decoded View is the
reader-friendly skin; Native View is the real cockpit.

## Core Policy Changes

1. **Stop using `dontAsk` as the primary web interaction strategy.**
   The app should launch normal user-facing sessions in an interactive,
   native-compatible permission mode so Claude can ask questions through its
   own TUI.

2. **Do not suppress native features in Decoded View.**
   If a state needs native interaction, the UI should switch or guide the user
   to Native View. It should not hide denied tool results, fake replies, or
   translate native prompts into partial web controls unless that translation is
   explicitly designed.

3. **JSONL is not the live interaction authority.**
   JSONL remains the transcript/history source for Decoded View. PTY screen
   state is the authority for whether the runtime is waiting for input, showing
   a native prompt, or accepting chat text.

## Architecture

### Backend PTY Session

`PtyManager` continues to own one `PtyChannel` per focused session. It should
grow two capabilities:

- **Frame broadcast**: publish terminal output frames, resize state, and process
  lifecycle events to browser clients.
- **Raw input endpoint**: accept encoded terminal input from Native View and
  write it to the PTY without the chat-submit encoding path.

The existing `submit()` path may remain for Decoded View chat submits, but it
must become conditional: it is only safe when the PTY state classifier says the
screen is in normal chat-input mode.

### Terminal Screen State

Add a PTY screen model/classifier that consumes terminal output and exposes a
small state machine:

- `booting`
- `idle_chat_input`
- `assistant_streaming`
- `slash_palette_open`
- `ask_user_question`
- `permission_prompt`
- `login_required`
- `trust_prompt`
- `model_selector`
- `btw_modal`
- `native_input_required`
- `unknown_interactive`
- `dead`

Initial implementation can use pragmatic screen-text and escape-sequence
classification. It should be isolated behind a narrow interface so the matching
logic can improve without rewriting frontend behavior.

The classifier must be conservative. If it is unsure whether Decoded View input
would be swallowed, it should report `unknown_interactive` or
`native_input_required`.

### Events/API

Add or adapt endpoints/events around native terminal control:

- `GET /api/pty/native-status?session_id=...`
  returns current PTY state, dimensions, alive/dead state, and whether Decoded
  View input is safe.
- `GET /api/pty/frames?session_id=...` or SSE event stream additions
  broadcast terminal frame deltas/snapshots.
- `POST /api/pty/input`
  sends raw terminal input bytes/events to the PTY.
- `POST /api/pty/resize`
  updates PTY rows/cols from the browser terminal viewport.

The existing `/api/events` stream can carry native-state updates if that keeps
client wiring simpler.

### Frontend Views

Add a session-level mode:

- `decoded`
- `native`

The mode is local UI state, not session data. It should persist per browser tab
or per session in local storage only if that proves useful; it should not alter
session history.

Decoded View keeps the current message layout. Native View renders a terminal
component that receives frame data and sends keyboard input to `/api/pty/input`.

The header gets a compact segmented toggle:

`Decoded | Native`

Native-required states affect that toggle:

- hard-blocking native states automatically switch to Native View by default;
- optional native states can show a badge and leave the user in Decoded View;
- a user preference can later choose auto-switch vs prompt-only.

Recommended first behavior:

- Auto-switch for `ask_user_question`, `permission_prompt`, `login_required`,
  `trust_prompt`, `btw_modal`, and `unknown_interactive`.
- Show a non-blocking badge for `slash_palette_open` and `model_selector` if the
  user is already in Decoded View.

### Input Routing

Decoded composer is enabled only when:

- PTY is alive or can be focused safely;
- classifier says `idle_chat_input`;
- no foreign owner currently holds the session;
- cwd still exists.

Otherwise Decoded View shows a clear inline control:

> Native input required
> Switch to Native View to answer Claude's prompt.

Native View always owns keyboard input when focused. It should not go through
the chat-submit path; it sends terminal key events/bytes directly.

## Migration From Current WIP Findings

The safety WIP commit `41ecdc4` preserves useful discoveries but should not be
the implementation base. The KVM branch intentionally starts from `42d98f8`.

Items from that WIP that should be treated as findings, not architecture:

- slash-command probing proves native slash state matters, but probing should
  not be the primary UX once Native View exists;
- optimistic JSONL delivery timeouts prove JSONL is insufficient as a live
  interaction authority;
- hiding denied `AskUserQuestion` proves `dontAsk` conflicts with native Claude
  behavior;
- the early streaming indicator fix is useful only as a transition patch, not
  the final runtime model.

## Implementation Phases

### Phase 1: Native Terminal View Skeleton

- Add a frontend terminal viewport component.
- Broadcast PTY output to the browser as append-only bytes or decoded frames.
- Add raw input and resize endpoints.
- Add manual `Decoded | Native` toggle.
- Keep existing Decoded View working.

Success criteria:

- opening Native View shows the live Claude TUI;
- typing in Native View controls the same PTY;
- switching back to Decoded View does not respawn or interrupt Claude.

### Phase 2: PTY State Classifier

- Implement backend screen/classifier module with unit tests and fixtures.
- Publish `native_state` events to the frontend.
- Add Decoded View composer gating based on classifier state.

Success criteria:

- app detects native-required prompts;
- Decoded composer is disabled when it would be unsafe;
- Native View is reachable with one action.

### Phase 3: Auto-Switch For Blocking Native States

- Add auto-switch behavior for hard-blocking native states.
- Add a visible state badge in the header.
- Keep manual toggle available at all times.

Success criteria:

- `AskUserQuestion` moves user into Native View instead of failing in `dontAsk`;
- permission/login/trust prompts are visible and answerable;
- decoded transcript updates after native interaction completes.

### Phase 4: Permission Mode Cleanup

- Change normal session launch defaults away from `dontAsk`.
- Keep Keychain-backed `ANTHROPIC_API_KEY` injection behavior for `zai`.
- Confirm Claude can ask native questions without charging through the wrong
  provider path or exposing secrets in frontend/runtime logs.

Success criteria:

- no "Not logged in" regression when launched through Keychain-backed env;
- native `AskUserQuestion` works;
- secrets remain server-side only.

### Phase 5: Remove Transitional Bandaids

Remove or de-emphasize code whose only purpose was to compensate for the hidden
terminal model:

- slash-command probe/autocomplete as primary UX;
- special hiding of denied `AskUserQuestion` results;
- JSONL-only swallowed-message timeout as the main live-state guard;
- any input routing that assumes Decoded View can safely type during native
  modals.

Keep transcript rendering, search/archive metadata, recaps, and file viewing.

## Testing Plan

Backend:

- unit-test raw input encoding/writes separately from chat submit encoding;
- unit-test resize propagation;
- unit-test classifier states using terminal-output fixtures;
- integration-test state event publication from a fake TUI.

Frontend:

- test manual Decoded/Native toggle preserves session id and does not refocus
  unrelated sessions;
- test Decoded composer disables when state is native-required;
- test auto-switch for blocking states;
- test terminal input calls raw input endpoint, not chat submit;
- test existing transcript rendering remains intact.

Manual:

- launch with Keychain-backed `zai` env;
- trigger `/` slash menu in Native View;
- trigger `AskUserQuestion`;
- trigger a permission prompt;
- switch views while Claude is streaming;
- resume existing sessions and verify Decoded View still catches up from JSONL.

## Risks

- Browser terminal rendering may require a dependency such as `xterm.js`.
  This is acceptable if it keeps native behavior accurate.
- Classifier matching can drift with Claude TUI changes. Keep it conservative
  and fixture-driven.
- Auto-switch can feel jarring. Start with hard-blocking states only.
- Two input paths can diverge. Keep raw terminal input and decoded chat submit
  clearly separated in names, routes, and tests.

## Non-Goals

- Reimplement Claude's native prompts as custom web forms in the first pass.
- Support multiple simultaneous writers to one PTY.
- Replace transcript/search/archive features with terminal scrollback.
- Expose secrets or API keys to the browser.

## Open Questions

- Which browser terminal library should be used? Recommendation: evaluate
  `xterm.js` first because it is mature and built for PTY-backed web terminals.
- Should auto-switch be user-configurable in Phase 3 or later?
- Should Native View state be persisted per session or remain per tab?
