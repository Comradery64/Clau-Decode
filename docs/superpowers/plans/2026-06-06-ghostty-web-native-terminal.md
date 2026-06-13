# Ghostty Web Native Terminal Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Native view's xterm.js renderer with `ghostty-web` so Claude Code's terminal UI is rendered by Ghostty's VT engine with real scrollback instead of frontend redraw filtering.

**Architecture:** Keep the existing backend PTY APIs, SSE output chunks, decoded/native toggle, sizing contract, notices, and prompt lifecycle. Replace only the browser terminal renderer through a small adapter module that owns async WASM initialization, terminal construction, fit sizing, and theme/font options. Remove the xterm-specific redraw trimming once Ghostty owns terminal emulation state.

**Tech Stack:** Python/FastAPI backend, existing PTY runner, React 19, Vite 8, Vitest/jsdom, `ghostty-web@0.4.0` for browser terminal rendering.

---

## Research Notes

- `ghostty-web` latest checked version: `0.4.0`.
- npm metadata checked locally with `npm view ghostty-web ...`: MIT, `types: ./dist/index.d.ts`, UMD/module builds, bundled WASM.
- Published typings expose the APIs we need: `init()`, `Terminal`, `FitAddon`, `write`, `onData`, `resize`, `clear`, `scrollToBottom`, `scrollToTop`, `scrollLines`, `scrollPages`, `dispose`, `ITerminalOptions.scrollback`, and built-in scrollback access.
- GitHub README says migration is intended to be import-level compatible for many xterm.js uses, with `import { init, Terminal } from "ghostty-web"; await init();`.
- The package includes `ghostty-vt.wasm`; implementation must verify Vite copies and serves that asset correctly from the production static build.
- Plan-reviewer subagent was not dispatched because the current tool policy only allows subagents when the user explicitly requests delegation.

## Current Baseline

- WIP checkpoint commit: `8e8b1ed wip: native decoded dual view checkpoint`.
- Current renderer: `frontend/src/components/ChatView/NativeTerminalView.tsx`.
- Current xterm dependencies:
  - `@xterm/xterm`
  - `@xterm/addon-fit`
- Current workaround to remove:
  - `lastRedrawBoundary`
  - `prepareTerminalWrite`
  - tests that assert stale bytes are trimmed before terminal write
  - `docs/native-pty-rendering.md` references to xterm-specific replay behavior

## File Structure

- Modify: `frontend/package.json`
  - Replace xterm packages with `ghostty-web`.
- Modify: `frontend/package-lock.json`
  - Regenerate with npm.
- Create: `frontend/src/components/ChatView/nativeTerminal/ghosttyTerminal.ts`
  - Small adapter for `ghostty-web` imports, `init()` caching, terminal creation, and fit addon construction.
- Modify: `frontend/src/components/ChatView/NativeTerminalView.tsx`
  - Use adapter, async initialization, raw writes, Ghostty FitAddon, decoded theme/font.
- Modify: `frontend/src/components/ChatView/__tests__/NativeTerminalView.test.tsx`
  - Mock `ghostty-web` instead of xterm packages; assert async init, raw snapshot/live writes, sizing, input, cleanup, theme, and scrollback.
- Modify: `docs/native-pty-rendering.md`
  - Replace xterm workaround notes with Ghostty renderer invariants.
- Modify: `docs/superpowers/plans/2026-06-06-native-kvm-dual-view.md`
  - Update completed implementation notes to say renderer migrated from xterm to `ghostty-web`.
- Optional create: `frontend/src/components/ChatView/nativeTerminal/__tests__/ghosttyTerminal.test.ts`
  - Only if adapter logic grows beyond init caching and object construction.

## Task 1: Replace Dependencies

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`

- [ ] **Step 1: Update dependencies**

Run:

```bash
cd frontend
npm uninstall @xterm/xterm @xterm/addon-fit
npm install ghostty-web@0.4.0
```

Expected:
- `frontend/package.json` contains `"ghostty-web": "0.4.0"`.
- No `@xterm/*` packages remain in `frontend/package.json`.

- [ ] **Step 2: Verify dependency graph**

Run:

```bash
cd frontend
npm ls ghostty-web
npm ls @xterm/xterm @xterm/addon-fit
```

Expected:
- `ghostty-web@0.4.0` is installed.
- xterm packages are absent or reported as empty/missing from the project.

- [ ] **Step 3: Commit dependency swap**

Run:

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "chore: replace xterm with ghostty-web dependency"
```

## Task 2: Add Ghostty Terminal Adapter

**Files:**
- Create: `frontend/src/components/ChatView/nativeTerminal/ghosttyTerminal.ts`
- Test: `frontend/src/components/ChatView/__tests__/NativeTerminalView.test.tsx`

- [ ] **Step 1: Write failing test for async init**

In `NativeTerminalView.test.tsx`, replace xterm mocks with:

```ts
const { ghosttyInit, terminalInstances, fitAddonInstances, MockTerminal, MockFitAddon } = vi.hoisted(() => {
  const ghosttyInit = vi.fn(async () => undefined);
  // MockTerminal should match the ghostty-web methods NativeTerminalView uses.
  return { ghosttyInit, terminalInstances, fitAddonInstances, MockTerminal, MockFitAddon };
});

vi.mock("ghostty-web", () => ({
  init: ghosttyInit,
  Terminal: MockTerminal,
  FitAddon: MockFitAddon,
}));
```

Add an assertion:

```ts
it("initializes ghostty-web before opening the terminal", async () => {
  render(<NativeTerminalView sessionId="sess-native" />);

  await waitFor(() => expect(ghosttyInit).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(terminalInstances[0].open).toHaveBeenCalled());
});
```

- [ ] **Step 2: Run test to verify RED**

Run:

```bash
cd frontend
npm test -- NativeTerminalView.test.tsx
```

Expected:
- Fails because `ghostty-web` is not imported/initialized yet.

- [ ] **Step 3: Implement adapter**

Create `frontend/src/components/ChatView/nativeTerminal/ghosttyTerminal.ts`:

```ts
import { init, Terminal, FitAddon } from "ghostty-web";
import type { ITerminalOptions } from "ghostty-web";

let initPromise: Promise<void> | null = null;

export type NativeTerminal = Terminal;
export type NativeFitAddon = FitAddon;
export type NativeTerminalOptions = ITerminalOptions;

export function ensureGhosttyReady(): Promise<void> {
  initPromise ??= init();
  return initPromise;
}

export function createNativeTerminal(options: NativeTerminalOptions): NativeTerminal {
  return new Terminal(options);
}

export function createNativeFitAddon(): NativeFitAddon {
  return new FitAddon();
}
```

- [ ] **Step 4: Run focused test**

Run:

```bash
cd frontend
npm test -- NativeTerminalView.test.tsx
```

Expected:
- Still fails until `NativeTerminalView` uses the adapter.

## Task 3: Migrate NativeTerminalView

**Files:**
- Modify: `frontend/src/components/ChatView/NativeTerminalView.tsx`
- Modify: `frontend/src/components/ChatView/__tests__/NativeTerminalView.test.tsx`

- [ ] **Step 1: Remove xterm imports and CSS**

Remove:

```ts
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import type { ITheme } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
```

Add:

```ts
import type { ITheme } from "ghostty-web";
import {
  createNativeFitAddon,
  createNativeTerminal,
  ensureGhosttyReady,
  type NativeTerminal,
} from "./nativeTerminal/ghosttyTerminal";
```

- [ ] **Step 2: Remove redraw filtering**

Delete:

```ts
const terminalTextDecoder = new TextDecoder();
const terminalTextEncoder = new TextEncoder();
function lastRedrawBoundary(...)
function prepareTerminalWrite(...)
```

Update live output to raw terminal writes:

```ts
const handleOutputChunk = useCallback((chunk: Uint8Array) => {
  const terminal = terminalRef.current;
  if (!terminal) return;
  terminal.write(chunk);
  terminal.scrollToBottom();
}, []);
```

Update snapshot replay to raw terminal writes:

```ts
terminalRef.current.clear();
terminalRef.current.write(snapshotBytes);
terminalRef.current.scrollToBottom();
```

- [ ] **Step 3: Make terminal creation async and cancellation-safe**

Inside the terminal setup effect:

```ts
let cancelled = false;
let terminal: NativeTerminal | null = null;
let cleanup: (() => void) | null = null;

void ensureGhosttyReady().then(() => {
  if (cancelled || !hostRef.current) return;

  terminal = createNativeTerminal({
    cols: INITIAL_COLS,
    rows: INITIAL_ROWS,
    cursorBlink: true,
    fontFamily: TERMINAL_FONT_FAMILY,
    fontSize: TERMINAL_FONT_SIZE,
    scrollback: NATIVE_SCROLLBACK_ROWS,
    theme: readDecodedTerminalTheme(),
  });

  const fitAddon = createNativeFitAddon();
  terminalRef.current = terminal;
  terminal.loadAddon(fitAddon);
  terminal.open(hostRef.current);

  // Reuse the existing input, resize, font-ready, theme observer, and cleanup code.
});

return () => {
  cancelled = true;
  cleanup?.();
  terminal?.dispose();
  terminalRef.current = null;
  wroteSnapshotRef.current = null;
};
```

Important:
- Keep hooks unconditional.
- Do not call `useNativePty` conditionally.
- Initial snapshot should still wait for `initialSize`; this already happens through the `initialSize` option.
- If init rejects, emit `onNotice({ kind: "error", text: "Native terminal failed to load" })` and keep the main UI usable.

- [ ] **Step 4: Run focused tests**

Run:

```bash
cd frontend
npm test -- NativeTerminalView.test.tsx
```

Expected:
- Tests pass after mock and component updates.

- [ ] **Step 5: Commit component migration**

Run:

```bash
git add frontend/src/components/ChatView/NativeTerminalView.tsx \
  frontend/src/components/ChatView/nativeTerminal/ghosttyTerminal.ts \
  frontend/src/components/ChatView/__tests__/NativeTerminalView.test.tsx
git commit -m "feat: render native terminal with ghostty-web"
```

## Task 4: Update Tests for Raw Terminal Semantics

**Files:**
- Modify: `frontend/src/components/ChatView/__tests__/NativeTerminalView.test.tsx`

- [ ] **Step 1: Delete xterm workaround tests**

Remove tests whose expected behavior only exists because xterm replay was broken:

```ts
it("trims snapshot replay to the newest full-screen redraw frame", ...)
it("clears stale scrollback before live full-screen redraw chunks", ...)
it("does not clear scrollback for ordinary live terminal output", ...)
```

- [ ] **Step 2: Add raw write tests**

Add:

```ts
it("passes raw snapshot bytes to ghostty-web", async () => {
  vi.mocked(api.ptyNativeSnapshot).mockResolvedValue({
    session_id: "sess-native",
    ring_b64: textToBase64("stale\n\x1b[H\x1b[2Kfresh"),
    rows: 40,
    cols: 120,
    alive: true,
    native_state: "idle_chat_input",
    decoded_input_safe: true,
  });

  render(<NativeTerminalView sessionId="sess-native" />);

  await waitFor(() => expect(terminalInstances[0].write).toHaveBeenCalled());
  expect(terminalInstances[0].writes.map(bytesToText).join("")).toContain("stale\n\x1b[H\x1b[2Kfresh");
});
```

Add:

```ts
it("passes raw live PTY chunks to ghostty-web", async () => {
  render(<NativeTerminalView sessionId="sess-native" />);
  await waitFor(() => expect(terminalInstances[0]).toBeTruthy());

  emit("pty-output-chunk", {
    session_id: "sess-native",
    data_b64: textToBase64("old partial\x1b[H\x1b[2Kredrawn screen"),
  });

  await waitFor(() => {
    expect(terminalInstances[0].writes.map(bytesToText).join("")).toContain("old partial\x1b[H\x1b[2Kredrawn screen");
  });
});
```

- [ ] **Step 3: Keep existing integration contracts**

Preserve tests for:
- decoded theme tokens
- Fira Code preferred font
- positive scrollback config
- initial resize before snapshot
- fallback dimensions
- resize observer
- input forwarding
- stopped notices in the main window
- 404 missing native snapshot starts/focuses PTY cleanly

- [ ] **Step 4: Run frontend tests**

Run:

```bash
cd frontend
npm test
```

Expected:
- All Vitest tests pass.

- [ ] **Step 5: Commit tests**

Run:

```bash
git add frontend/src/components/ChatView/__tests__/NativeTerminalView.test.tsx
git commit -m "test: cover ghostty native terminal integration"
```

## Task 5: Verify Vite/WASM Production Build

**Files:**
- Modify only if needed: `frontend/vite.config.ts`
- Modify only if needed: `src/clau_decode/server.py`
- Modify generated assets under: `src/clau_decode/static/`

- [ ] **Step 1: Run production build**

Run:

```bash
cd frontend
npm run build
```

Expected:
- TypeScript compiles.
- Vite emits JS/CSS and includes `ghostty-vt.wasm` or an equivalent hashed WASM asset under `src/clau_decode/static/assets/`.

- [ ] **Step 2: Inspect emitted assets**

Run:

```bash
find src/clau_decode/static -maxdepth 3 -type f | sort | rg 'ghostty|wasm|ChatView|index.html'
```

Expected:
- A WASM file is present in the static output.
- The built JS references the emitted WASM through a URL Vite can serve.

- [ ] **Step 3: Fix asset serving only if build exposes a problem**

If the browser tries to fetch a `.wasm` path and receives the SPA `index.html`, update server static asset handling so `.wasm` files are served as static files and missing hashed assets still return 404.

Add or update backend tests in `tests/test_server.py`:

```python
def test_missing_hashed_wasm_asset_returns_404(client):
    response = client.get("/assets/missing-ghostty.wasm")
    assert response.status_code == 404
```

- [ ] **Step 4: Run backend static tests if server changed**

Run:

```bash
pytest tests/test_server.py::test_missing_hashed_asset_returns_404 -v
pytest tests/test_server.py::test_missing_hashed_wasm_asset_returns_404 -v
```

Expected:
- Both pass.

- [ ] **Step 5: Commit build/static changes**

Run:

```bash
git add frontend/vite.config.ts src/clau_decode/server.py tests/test_server.py src/clau_decode/static
git commit -m "build: serve ghostty wasm terminal assets"
```

Only include files that actually changed.

## Task 6: Browser Smoke Verification for Real Ghostty Rendering

**Files:**
- No required source changes.
- Optional create: `docs/native-pty-rendering.md` verification notes.

- [ ] **Step 1: Restart app from clean build**

Run:

```bash
lsof -nP -iTCP:4242 -sTCP:LISTEN || true
# kill any listed app PID
cd frontend && npm run build
cd ..
PYTHONPATH=src python -c 'from clau_decode.cli import main; main()' --host 127.0.0.1 --port 4242 --no-open
```

Expected:
- App listens on `http://127.0.0.1:4242`.
- `/api/health` returns `{"ok": true}`.

- [ ] **Step 2: Verify Native view loads**

In browser:
- Open an existing session.
- Switch to Native.
- Confirm no 404 for `.wasm`, no `ghostty-web` initialization error, and a visible terminal canvas appears.

- [ ] **Step 3: Reproduce the old failure**

In Native:
- Use a chat with enough output to scroll several screens.
- Trigger `ctrl+o`.
- Trigger `ctrl+l`.
- Scroll to top and bottom repeatedly.

Expected:
- No right-edge vertical text fragments.
- No broken line wrapping in the upper 3/4 of the scrollback.
- Scrollback reaches substantially farther than two wheel gestures when there is enough output.
- Returning to Decoded still scrolls to the bottom.

- [ ] **Step 4: Verify input parity**

In Decoded and Native:
- Submit with Enter using the current send-shortcut setting.
- Use Shift+Enter or the configured newline shortcut for multiline input.
- Verify the submit button shortcut status remains correct.
- Verify prompt appears immediately in decoded optimistic state and reconciles without visual jump.

- [ ] **Step 5: Capture evidence**

Record:
- Browser console: no errors.
- Network: `.wasm` status 200.
- Screenshot or brief notes for scrollback after `ctrl+o` and `ctrl+l`.

## Task 7: Update Documentation

**Files:**
- Modify: `docs/native-pty-rendering.md`
- Modify: `docs/superpowers/plans/2026-06-06-native-kvm-dual-view.md`

- [ ] **Step 1: Rewrite renderer doc**

Replace xterm-specific content with:

```markdown
# Native PTY Rendering

The Native view uses `ghostty-web`, a browser terminal renderer backed by Ghostty's VT engine compiled to WebAssembly. The frontend writes raw PTY bytes to the terminal; terminal emulation, alternate screen behavior, redraws, wrapping, and scrollback belong to Ghostty.

Rendering rules:

- Keep backend PTY resize invalidation because frames produced at different column counts cannot be replayed reliably.
- Do not trim or interpret PTY escape sequences in React.
- Do not disable terminal scrollback.
- Keep decoded UI as the canonical transcript view; Native is the terminal viewport over the live PTY stream.
```

- [ ] **Step 2: Update original implementation plan note**

In `docs/superpowers/plans/2026-06-06-native-kvm-dual-view.md`, add a short note near the terminal task:

```markdown
Update: xterm.js was replaced by `ghostty-web` after scrollback/redraw replay bugs surfaced with Claude Code's TUI output.
```

- [ ] **Step 3: Run docs/status check**

Run:

```bash
git diff -- docs/native-pty-rendering.md docs/superpowers/plans/2026-06-06-native-kvm-dual-view.md
```

Expected:
- Docs describe Ghostty, raw PTY writes, and no frontend redraw filtering.

- [ ] **Step 4: Commit docs**

Run:

```bash
git add docs/native-pty-rendering.md docs/superpowers/plans/2026-06-06-native-kvm-dual-view.md
git commit -m "docs: document ghostty native terminal renderer"
```

## Task 8: Final Gate and Restart

**Files:**
- No source edits unless tests fail.

- [ ] **Step 1: Run full frontend tests**

Run:

```bash
cd frontend
npm test
```

Expected:
- All Vitest tests pass.

- [ ] **Step 2: Run backend tests**

Run:

```bash
pytest
```

Expected:
- Existing pytest suite passes, with the known skipped test still skipped if unchanged.

- [ ] **Step 3: Kill running app, build, restart**

Run:

```bash
lsof -nP -iTCP:4242 -sTCP:LISTEN || true
# kill any listed app PID
cd frontend
npm run build
cd ..
PYTHONPATH=src python -c 'from clau_decode.cli import main; main()' --host 127.0.0.1 --port 4242 --no-open
```

Expected:
- Build succeeds.
- App listens on `127.0.0.1:4242`.
- `curl -sS http://127.0.0.1:4242/api/health` returns `{"ok": true}`.

- [ ] **Step 4: Commit final build assets**

Run:

```bash
git add src/clau_decode/static
git commit -m "build: update static assets for ghostty terminal"
```

Only commit if the build produced static asset changes not already committed.

## Rollback

If `ghostty-web` fails to initialize, fails production WASM loading, or cannot preserve input behavior:

```bash
git reset --hard 8e8b1ed
```

Only run that with explicit user approval because it is destructive. The WIP checkpoint exists so the current xterm-based state can be restored exactly.
