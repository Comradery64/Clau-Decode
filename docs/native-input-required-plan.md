# Surface "input required" in Decoded & Split views

> Plan approved 2026-06-28. Implementation not yet started — load this doc in a
> fresh session to begin. (Mirror of `~/.cc-mirror/zai/config/plans/deep-petting-horizon.md`.)

## Context

When the app is used in **Decoded-only** or **Split** view, it doesn't properly
tell the user that the driven agent (codex/claude) is blocked waiting for their
input — a permission prompt, a trust prompt, a question, or a btw modal. The
user can't see the live terminal in Decoded-only, so they don't realize they
need to act, and may navigate away or think the agent is stuck.

Two distinct gaps cause this:

1. **codex state is undetected in Decoded-only.** The tmux driver classifies
   state (`permission_prompt`, `trust_prompt`, `login_required`, …) **only**
   inside `DriverManager.native_snapshot()` (`driver_manager.py:228`), which the
   FE calls only when the Native pane mounts. So a codex session sitting at an
   approval prompt in Decoded-only is invisible. (claude does NOT have this gap
   — `PtyManager._flush_output` classifies on every output chunk regardless of
   view, `pty_runner.py:1812`.)
2. **The only surfacing is a subtle 12px chip** in `ConversationHeader`
   (`ConversationHeader.tsx:235`), easy to miss when reading the transcript.
   There is no prominent, actionable indicator and no path that says "switch to
   Native to approve."

The "runner" is irrelevant (no auto-advancing queue exists) — this is purely
about prominently surfacing an already-classifiable state to a human.

**Outcome:** in Decoded-only and Split, whenever the agent is blocked on user
input, show a prominent banner with a one-click "Switch to Native" action; and
make codex's blocked state actually detectable in Decoded-only.

## Approach

### Part A — Backend: detect codex state independent of Native-mount

Add a single, active-session-gated background poller in `DriverManager` that
reuses the existing `driver.capture_state()` + `_STATE_TO_NATIVE` map and emits
`pty_native_state` on change — mirroring how `PtyManager` already emits it for
claude. The FE already subscribes to `pty-native-state` (`ChatView.tsx:197`), so
no FE wiring is needed for detection.

- **File:** `src/clau_decode/driver_manager.py`
- Add `_last_driver_state: dict[str, tuple[str, bool]]` (dedup, mirroring
  `pty_runner.py:1361/1816`) and a single `asyncio.Lock` `_state_poll_lock`
  (separate from `_session_lock` so a slow `capture-pane` can't block submit/resize).
- Add `_ensure_state_poller()` (idempotent) that starts one long-lived task; call
  it from `focus()` after `_active_session_id` is set. Cancel it in `shutdown()`.
- The loop: `await asyncio.sleep(STATE_POLL_INTERVAL_S)` (constant, ~1.0s; 60
  `tmux capture-pane` forks/min for the one active session — cheap, ~2–8ms each),
  then read `_active_session_id`; if `None` or driver missing/dead, continue;
  else under `_state_poll_lock` call `driver.capture_state()`, map via
  `_STATE_TO_NATIVE`, and `self._bus.publish({"type": "pty_native_state", ...})`
  only when the `(state, decoded_input_safe)` key changed. Skip if the driver is
  dead (death is already emitted by `_make_on_dead`).
- Reuse `_STATE_TO_NATIVE` (line 35) and the bus unchanged. No changes to
  `capture_state()`, the markers, or `encode_pty_snapshot`.

Note: codex has no `ask_user_question` marker (claude-only via
`classify_screen`); this surfaces trust/permission/login/update/running/idle for
codex, which covers the approval/trust cases the user hit.

### Part B — Frontend: prominent, actionable banner in Decoded & Split

Add a `NativeActionBanner` (clone of `OwnershipBanner.tsx`, reusing the
`chatCard.ts` style helpers) shown whenever the agent is blocked, with a
"Switch to Native" button.

- **New file:** `frontend/src/components/ChatView/NativeActionBanner.tsx`
  - Props: `{ state: NativePtyState; decodedInputSafe: boolean; onSwitchToNative: () => void }`.
  - Reuse `chatCardOuterStyle` / `chatCardColumnStyle` / `chatCardStyle` /
    `chatCardButtonStyle` from `chatCard.ts`. `role="alert"` for
    `permission_prompt`/`login_required`, `role="status"` otherwise. Button calls
    `onSwitchToNative`.
- **`ChatView.tsx`:**
  - Add a `nativeNeedsAction(state)` predicate (states `permission_prompt`,
    `ask_user_question`, `trust_prompt`, `btw_modal`) near `nativeStateLabel`
    (line 59).
  - Render the banner immediately before the `OwnershipBanner` block (~line 682):
    `{viewMode !== "native" && canDriveLive && nativeNeedsAction(nativeState?.state) && !foreignOwned && (
      <NativeActionBanner state={nativeState.state} decodedInputSafe={nativeState.decodedInputSafe} onSwitchToNative={() => handleViewModeChange("native")} />)}`
    — `viewMode !== "native"` covers both Decoded and Split; `handleViewModeChange`
    (line 226) already enforces the `canDriveLive` guard.
- **`ConversationHeader.tsx`** (secondary): accept a `nativeNeedsAction?: boolean`
  prop (pass from `ChatView.tsx:557`); when true, recolor the existing chip
  (amber border/bg, e.g. `var(--accent-amber)`/a subtle alert bg) and make it a
  `<button>` calling `onViewModeChange?.("native")` — a third click target.

The banner is persistent (not a toast) — it stays until the state clears, which
is correct for a blocking prompt. Do NOT use the `nativeNotice` toast or the
global `toast` event (both auto-dismiss).

## Critical files

- `src/clau_decode/driver_manager.py` — add the active-session-gated state poller.
- `frontend/src/components/ChatView/NativeActionBanner.tsx` — new (clone of `OwnershipBanner.tsx`).
- `frontend/src/components/ChatView/ChatView.tsx` — `nativeNeedsAction` predicate + render the banner (≈line 682); pass `nativeNeedsAction` to header (line 557).
- `frontend/src/components/ChatView/ConversationHeader.tsx` — recolor+clickable chip when action needed.

Reuse: `OwnershipBanner.tsx`, `chatCard.ts` (4 style helpers), `handleViewModeChange`
(`ChatView.tsx:226`), `_STATE_TO_NATIVE` + `driver.capture_state()` (backend),
`pty_runner.py:1361/1816` (dedup pattern to mirror).

## Verification

1. **Backend tests:** `PYTHONPATH=src .venv/bin/python -m pytest tests/drivers/` —
   extend `tests/drivers/test_driver_manager.py` with a test that a driver at a
   `NEEDS_APPROVAL` state emits `pty_native_state` via the poller (without any
   `native_snapshot` call), gated to the active session, with dedup.
2. **FE tests:** `cd frontend && npx vitest run` (expect 205) + add a
   `NativeActionBanner` render test and a `nativeNeedsAction` unit test.
3. **Build:** `cd frontend && npm run build` (served from `src/clau_decode/static/`).
4. **Manual (codex, Decoded-only):** drive codex to a permission prompt from the
   Decoded composer (e.g. ask it to write to `/tmp/…`) → confirm the prominent
   banner appears in Decoded-only with "Switch to Native" → click → flips to
   Native at the prompt → approve → banner clears.
5. **Manual (Split):** same prompt in Split → banner shows in the decoded half →
   click flips to full Native.
6. **claude parity check:** confirm claude (already detected via PtyManager) also
   shows the banner in Decoded-only at a `permission_prompt`.
7. Build process: kill the old server + rebuild FE before verifying (per
   build-process memory); restart the server for the backend change.

## Notes for the fresh session

- Two earlier (unrelated) UI fixes from this session are **uncommitted** in the
  working tree: `frontend/src/components/Sidebar/SessionItem.tsx` (selected-item
  right rounded corners) and `frontend/src/components/Sidebar/Sidebar.tsx`
  (removed the STARRED section collapse arrow). Decide whether to commit those
  (Comradery64) before or alongside this work.
- Separate open work (documented, not fixed — see `docs/4f-handoff-2026-06-27.md`):
  the Native-view resize render regression (xterm can't replay resize-transition
  rings). Don't conflate with this plan.
