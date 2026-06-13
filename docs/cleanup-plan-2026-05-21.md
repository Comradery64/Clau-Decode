# Clau-Decode Cleanup & Optimization Plan — 2026-05-21

Successor to the 2026-05-07 frontend tech-debt audit (stored separately in
session memory; not superseded — items still applicable are referenced
here by number with `[2026-05-07 #N]`).

This plan reflects the **current** repo state on `dev` at 2026-05-21,
after the recent batch of UX bug-fixes (loading animation swap, chat-bubble
flip, stale-watchdog suppression, eager PTY warm-up, content_blocks dedupe
correctness, terminal button in the chat header).

Work top-to-bottom. Each numbered step is independently shippable; run
`npm run build` after each frontend item.

---

## Context — what changed in the 2026-05-21 session

Recent commits/edits that the plan below already assumes have landed:

| Area | File(s) | Change |
|---|---|---|
| Chat header | `ConversationHeader.tsx` | "Refresh" button removed; replaced with "Open in terminal" mirroring SessionItem context-menu logic |
| Loading UX | `components/ui/LoadingAnimation.tsx` (new) | Shared SMIL 4-dot bouncer; `currentColor` driven; cropped viewBox |
| Loading UX | `Dashboard.tsx`, `Messages/MessageList.tsx`, `Messages/StreamingIndicator.tsx` | Ring spinners + single-dot pulse → `<LoadingAnimation>` |
| Constants | `config/ui.ts` | `STREAMING.DOT_PULSE_MS` removed (orphaned after StreamingIndicator change) |
| Chat bubble | `Messages/UserMessage.tsx` | `borderRadius` flipped from `18px 18px 4px 18px` to `18px 4px 18px 18px` (sharp corner top-right) |
| Indicator gate | `Messages/MessageList.tsx` | Render gate no longer ANDs `!sseTimedOut`; unused `sseTimedOut` destructure dropped |
| Stop button | `ChatView.tsx` ChatInputBar | `effectiveActive` now bypasses `sseTimedOut` when `optimisticActive` |
| PTY UX | `ChatView/ChatInput.tsx` | Eager `api.ptyFocus` on chat mount so cold-boot overlaps with reading history |
| SSE correctness | `Messages/hooks/useSessionDetail.ts` | Refresh dedupe now also checks last-message `content_blocks.length` (was hanging the "thinking" indicator when assistant streamed text onto an existing message) |

The plan below does **not** include any of the above — they're already done.

---

## Current bloat snapshot (LOC)

```
853  frontend/src/components/Sidebar/Sidebar.tsx
972  frontend/src/components/Settings/SettingsModal.tsx
830  frontend/src/components/ChatView/ChatInput.tsx     ← new offender vs 2026-05-07
790  frontend/src/components/Messages/ThoughtChain.tsx
687  frontend/src/components/FileViewer/FileViewer.tsx
393  frontend/src/components/ChatView/ChatView.tsx       ← grew from 295
393  frontend/src/components/Messages/MessageList.tsx
```

11 plain `Loading…` text placeholders remain across the codebase that
do not yet use the new `LoadingAnimation` component.

---

## Tier A — Finish the 2026-05-07 plan that's still outstanding

### Step A1: Migrate remaining raw `localStorage` calls to helpers `[2026-05-07 #2]`

**Status today**: still partially done. Outstanding raw `localStorage`
call sites:

- `frontend/src/components/Sidebar/Sidebar.tsx:29,455` — `SIDEBAR_WIDTH_STORAGE_KEY`
- `frontend/src/components/FileViewer/FileViewer.tsx:17,190` — `LS.FILE_VIEWER_WIDTH`
- `frontend/src/components/Sidebar/SessionItem.tsx:22-35` — module-load IIFE migration block

**Task**:
- Add `LS.SIDEBAR_WIDTH` to `utils/localStorage.ts` and route Sidebar through `lsGetRaw`/`lsSetRaw`.
- Route FileViewer through the same.
- Extract the SessionItem IIFE into `migrateReadSessions()` exported from `utils/localStorage.ts`. Call it once from `main.tsx` before `createRoot`. Removes module-load side effects that fire under HMR and unit tests.

**Success criteria**: `grep -rn "window\\.localStorage\\|localStorage\\." frontend/src/ | grep -v utils/localStorage.ts | grep -v __tests__` returns nothing.

---

### Step A2: Centralise leftover UI constants `[2026-05-07 #4]`

**Status today**: `config/ui.ts` exists but lacks sidebar layout constants
and the bell-fade duration. Magic numbers still in `Sidebar.tsx` (52, 130, 141, 180, 260, 360, "352ms", 450).

**Task**:
- Add `SIDEBAR` namespace (`MIN_WIDTH`, `COLLAPSED_WIDTH`, `SNAP_THRESHOLD`, `DEFAULT_WIDTH`, `MIN_MAIN_PANE`, `FADE_TEXT_MIN_PX`, `FADE_TEXT_MAX_PX`).
- Add `UI.BELL_FADE_MS = 450` and consume from `SessionItem.tsx:159`.
- Define `--transition-medium: 352ms cubic-bezier(0, 0.9, 0.1, 1.0)` in `styles/`. Replace inline `352ms` literals.

**Success criteria**: zero `352ms` literal in `components/`; `Sidebar.tsx` has no local `SIDEBAR_*` constants.

---

## Tier B — Tame the god components

Sidebar and SettingsModal are still where they were on 2026-05-07. ChatInput has joined them.

### Step B1: Extract Sidebar icons + footer + nav item

Same as `[2026-05-07 #5/6/7]`. Specifically:

- Move `IconSearch`/`IconChats`/`IconHelp`/`IconKeyboard` from inline in `Sidebar.tsx` into `components/ui/icons.tsx` (which already hosts `IconStar`, `IconRename`, `IconFolder`, `IconTerminal`, `IconSettings`).
- Extract `SidebarFooter` (lines 157–370) into `Sidebar/SidebarFooter.tsx`.
- Extract `NavItem` into `Sidebar/NavItem.tsx`.
- Extract the duplicated `menuItemStyle()` profile-menu buttons into a `Sidebar/MenuButton.tsx` using a CSS class (`.sidebar-menu-item:hover`) instead of imperative `e.currentTarget.style.background = …`.

**Target**: `Sidebar.tsx` ≤ 500 LOC.

---

### Step B2: Deduplicate Sidebar fetches

Same as my earlier Step 5. `Sidebar.tsx` currently fires `getProjects` + `getAllSessions` from:

- the `[activeProfileId]` effect (lines ~545–557),
- the unconditional mount effect (lines ~560–576),
- the `[projects]`-keyed effect (lines ~579–593).

Collapse to one `[activeProfileId]` effect that fetches projects then sessions, plus the SSE-refresh effect. Three concurrent requests on first paint should become one of each.

---

### Step B3: Split `SettingsModal.tsx`

Same as my earlier Step 6. 972 LOC. Extract `ProfileSection`, `SortOrderSection`, `RecapSettings`, `RescanButton` into `Settings/*.tsx`. Leave `SettingsModal.tsx` as the modal shell ≤ 250 LOC.

---

### Step B4: NEW — Split `ChatInput.tsx`

**Why**: 830 LOC; eight `useEffect` hooks; model/permission picker, message-history (Up/Down) navigation, quiet warning, stash/restore logic, PTY focus warm-up, and submit pipeline all in one file.

**Task**:
- Extract `MessageHistoryStack` (Up/Down arrow navigation + cursor-at-0 guard) into `ChatView/hooks/useMessageHistory.ts`.
- Extract the model+permission picker (`pickerOpen` state + Cmd-K-style menu) into `ChatView/ModelPicker.tsx`.
- Extract the quiet-warning banner state into `ChatView/hooks/useQuietWarning.ts`.
- Keep `ChatInput.tsx` as the textarea + submit pipeline composing the above ≤ 350 LOC.

**Success criteria**: `wc -l ChatInput.tsx` < 400; effects per file ≤ 4.

---

### Step B5: NEW — `ChatView.tsx` has grown to 393

The earlier review flagged it at 295. The new recap-orchestration state + `ChatInputBar` inner component + per-session "last active" plumbing pushed it past where it should be. Move recap fetch/regenerate into `ChatView/hooks/useRecaps.ts` and the inner `ChatInputBar` into its own file.

**Target**: `ChatView.tsx` ≤ 250 LOC.

---

## Tier C — New tech debt from the 2026-05-21 session

### Step C1: Roll out `LoadingAnimation` to remaining text-only loaders

11 text-only `Loading…` placeholders remain (`Sidebar.tsx`, `FileExplorer.tsx`, `ProjectGroup.tsx`, `Settings/SettingsModal.tsx`, `FileViewer.tsx`, `Analytics/*Tab.tsx`). Some of these have space for an inline bouncer; others (Analytics tabs) might want a smaller inline variant.

**Task**:
- Add a small inline variant: `<LoadingAnimation width="20px" />` next to text.
- Audit each call site; either prepend the bouncer or replace the text outright depending on layout.
- Leave `Sidebar/NewTaskButton.tsx` `IconSpinner` alone — the wide 4-dot bounce doesn't render well at ~12px in a button.

**Success criteria**: no plain `Loading…` text without a visual indicator next to it (except where layout truly can't host one).

---

### Step C2: NEW — Reconsider `sseTimedOut` semantics

After today's bug, the watchdog now only gates JSONL-derived `serverActive`. But the broader question is: should the watchdog also be cleared (not just bypassed) when the user submits? Currently it stays `true` even after a successful submit; the next refresh effect re-evaluates and clears it. Two improvements worth considering:

- Clear `sseTimedOut` immediately inside `useSessionDetail` when the SSE refresh fires (any fresh data invalidates "looks dead").
- Drop the watchdog entirely if the only consumer left is the (now correctly gated) Stop button — measure cost of "show Stop on stale sessions" vs the complexity of maintaining a watchdog with these edge cases.

Both are cheap; pick one rather than leaving the current state where the watchdog is logically necessary but rarely exercised correctly.

---

### Step C3: NEW — `useSessionDetail` refresh dedupe — robustness

Today's fix made the refresh dedupe also compare last-message `content_blocks.length`. That's enough for assistant text streaming, but not robust against:

- Edits to a non-last message (`session-mutated` covers it, but a future refresh-only edit would slip through).
- Growth of `content_blocks` on a non-last message (rare but possible).

**Two equally-good options**:
- Compare `detail.updated_at` ISO strings (server bumps this on any change). Single field, cheap, semantically correct.
- Drop the dedupe entirely and rely on React's `Object.is` referential comparison; only re-render when truly different.

`updated_at` is the cleaner answer — encode the invariant once in the hook and stop guessing.

---

### Step C4: NEW — Extend PTY warm-up to hover-prefetch in the sidebar

`SessionItem` already prefetches `api.getSession` on hover. Extending to a `ptyFocus` warm-up means: by the time the user actually clicks the session, the PTY is hot (or close to it).

**Cost**: spawn-on-hover would dramatically increase PTY churn — a user scrolling the sidebar would spawn dozens of `claude` processes. Don't do it naïvely. Three guards:

- Require the hover to last ≥ 300 ms before warm-up fires.
- Cap concurrent warm-ups to 1 (cancel the previous when a new one starts).
- Cancel the warm-up if the user moves away before it completes.

May not be worth shipping. Evaluate against the eager-on-mount warm-up that already landed today.

---

### Step C5: NEW — PTY ownership / "primary source" coordination

This is the larger discussion from today: the JSONL is the system of record, both terminal and clau-decode spawn their own `claude --resume` against it, neither is aware of the other. Detailed phasing (separate doc would be cleaner if you pursue this):

| Phase | Scope | Effort |
|---|---|---|
| **0** | `lsof`/`fuser` detection of terminal `claude` at focus time. UI badge: 🟢 here / 🟡 terminal / ⚪️ idle. Disable submit when terminal owns; offer "Take over" → SIGINT terminal claude. | Small |
| **1** | clau-decode writes `<sid>.lock` sidecar with `{owner_kind, pid, heartbeat_at, ui_endpoint}`. PID-not-alive → stale. Lock self-heals across reboots/power loss. | Small-medium |
| **2** | Opt-in `claude-wrapper` shell shim that terminal users alias to `claude`. Honors the lock, gives terminal a symmetric "Web UI is using this — take over?" prompt. | Medium |
| **3** | Per-session submit lock (`asyncio.Lock`) in PtyManager so two browser tabs can't race-submit. | Small |

Phase 0–1 are enough to remove most of the "feels like a new chat" weirdness; Phase 2 is the symmetric vision; Phase 3 is hygiene.

If pursued, this should be its own design doc — recommend `docs/pty-ownership-plan.md`.

---

## Tier D — Carried forward from the 2026-05-07 plan (still relevant, lower priority)

These didn't get touched today and aren't blocking. Listed here so they don't fall off the radar.

| Item | From | Notes |
|---|---|---|
| D1 | `[2026-05-07 #1]` `getElementById` → ref | ✅ Already done; only `main.tsx` root remains (expected). Remove from active list. |
| D2 | `[2026-05-07 #3]` Typed event bus | ✅ Already done. |
| D3 | `[2026-05-07 #5]` Split MessageList | Mostly done via hooks. Residual presentational components (`CommandBadge`, `RecapBlock`, `RecapPlaceholder`) could move to `Messages/recap/*` if you want a 250-line `MessageList`. Low priority. |
| D4 | `[2026-05-07 #6]` ChatView scroll restoration | ✅ Already done via `useScrollPositionMemory`. |
| D5 | `[2026-05-07 #7]` FileViewer lazy import | ✅ Already done. |
| D6 | `[2026-05-07 #9]` StreamingIndicator `useCycle` | ✅ Already done; further simplified today (no dot pulse). |
| D7 | Earlier Step 7 — fabricated ref in ChatView | `useMemo(() => ({ current: null }))` → `useRef(null)`. Trivial; do it during the ChatView split (Step B5). |
| D8 | Earlier Step 8 — Cmd-O hotkey unification | Merge `useExpandPreserveAnchor` into the central keymap in `App.tsx`. |
| D9 | Earlier Step 9 — defensive avatar initial + dead `var(--accent-green, #2ea043)` fallback | Two one-liners. |
| D10 | Earlier Step 10 — Suspense skeletons | Replace `<Suspense fallback={null}>` with a 200 ms-delayed skeleton. |

---

## Validation checklist (run after each batch)

- `npm run build` clean — required.
- `npm test` green — required.
- `grep -rn "window\\.localStorage\\|localStorage\\." frontend/src/ | grep -v utils/localStorage.ts | grep -v __tests__` empty after Tier A1.
- `wc -l` checks:
  - `Sidebar.tsx` < 500 after Tier B1.
  - `SettingsModal.tsx` < 250 after Tier B3.
  - `ChatInput.tsx` < 400 after Tier B4.
  - `ChatView.tsx` < 250 after Tier B5.
- No `352ms` literal in `frontend/src/components/` after Tier A2.
- Sidebar emits ≤ 1 `getProjects` and ≤ 1 `getAllSessions` on first paint after Tier B2.
- Smoke: open/close all overlays, switch sessions mid-stream, hit Stop mid-turn, watch the "thinking" indicator disappear within ~500ms of the closing text arriving (regression guard for today's `useSessionDetail` fix).

---

## Suggested execution order

If you want to walk this in one batch per sitting:

1. **Sitting 1** — Tier A (A1 + A2). Both small; gets `Sidebar.tsx`'s misc constants out of the way before B1 moves things around.
2. **Sitting 2** — Tier B1 + B2. Sidebar split + fetch dedup.
3. **Sitting 3** — Tier B3 (SettingsModal split).
4. **Sitting 4** — Tier B4 + B5 (ChatInput + ChatView splits).
5. **Sitting 5** — Tier C1 + C2 + C3 (LoadingAnimation rollout + sseTimedOut + dedupe robustness).
6. **Sitting 6** — Tier D7 + D8 + D9 + D10 (small carry-overs).
7. **Standalone** — Tier C5 (PTY ownership) needs its own design pass before any code lands.

C4 (hover warm-up) is optional and dependent on observed UX feedback.
