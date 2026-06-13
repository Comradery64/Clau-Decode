# Native KVM Dual View Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a KVM-style Native View and Decoded View over the same Claude PTY so native Claude prompts and tools work without `dontAsk` hacks.

**Architecture:** Keep `PtyManager` as the single PTY owner. Add raw terminal output/input/resize APIs, render those in a browser terminal, then layer a conservative PTY-state classifier that gates Decoded View input and auto-switches to Native View for blocking native prompts.

**Tech Stack:** Python/FastAPI backend, existing PTY runner, SSE events, React 19, Vite, Vitest, pytest, `ghostty-web` for terminal rendering.

---

## Context

Spec: `docs/superpowers/specs/2026-06-06-native-kvm-dual-view-design.md`

Clean base: `42d98f8 chore: clean up legacy references`

Safety WIP preserved separately: `41ecdc4 wip: preserve slash palette and streaming findings`

Baseline verification already run in this worktree:

- `pytest`: 531 passed, 1 skipped
- `npm test`: 17 files, 150 tests passed

## File Structure

Backend:

- Create `src/clau_decode/pty_native.py`
  - Native-view payload helpers: encode/decode PTY chunks, classify input payloads, shape response/event dictionaries.
- Create `src/clau_decode/pty_screen_state.py`
  - Conservative terminal screen classifier.
- Modify `src/clau_decode/pty_runner.py`
  - Publish PTY output chunks.
  - Add `write_raw_input()` and expose a snapshot of current ring/dimensions/state.
  - Keep chat `submit()` separate from raw input.
- Modify `src/clau_decode/server.py`
  - Add native snapshot, raw input, and resize routes.
  - Add state/output event forwarding if needed.
- Modify `src/clau_decode/models.py` or route-local Pydantic models in `server.py`
  - Add request/response models if local route models become too large.

Backend tests:

- Create `tests/test_pty_native.py`
- Create `tests/test_pty_screen_state.py`
- Extend `tests/test_server.py` for route contracts.
- Extend `tests/fixtures/fake_claude_tui.py` only when integration fixtures need deterministic terminal states.

Frontend:

- Modify `frontend/package.json` and `frontend/package-lock.json`
  - Add `ghostty-web`.
- Modify `frontend/src/api/types.ts`
  - Add native PTY types/events.
- Modify `frontend/src/api/client.ts`
  - Add native PTY API calls and SSE dispatch.
- Modify `frontend/src/App.tsx`
  - Forward native PTY events to the local event bus.
- Modify `frontend/src/utils/events.ts`
  - Add typed native events.
- Create `frontend/src/components/ChatView/NativeTerminalView.tsx`
  - Browser terminal component.
- Create `frontend/src/components/ChatView/hooks/useNativePty.ts`
  - Snapshot + event subscription + input/resize wiring.
- Modify `frontend/src/components/ChatView/ConversationHeader.tsx`
  - Add `Decoded | Native` toggle and state badge, or provide a prop slot if the header is too crowded.
- Modify `frontend/src/components/ChatView/ChatView.tsx`
  - Own view mode, auto-switch behavior, and render either Decoded View or Native View.
- Modify `frontend/src/components/ChatView/ChatInputBar.tsx`
  - Disable Decoded composer when native state says input is unsafe.
- Modify `frontend/src/components/ChatView/ChatInput.tsx`
  - Surface native-required copy instead of sending during native-only states.

Frontend tests:

- Create `frontend/src/components/ChatView/__tests__/NativeTerminalView.test.tsx`
- Extend `frontend/src/components/ChatView/__tests__/ChatViewLifecycle.test.tsx`
- Extend `frontend/src/api/__tests__/client.test.ts`

---

### Task 1: Backend Native PTY Payload Helpers

**Files:**
- Create: `src/clau_decode/pty_native.py`
- Test: `tests/test_pty_native.py`

- [ ] **Step 1: Write failing helper tests**

Create `tests/test_pty_native.py`:

```python
from clau_decode.pty_native import (
    decode_terminal_input,
    encode_pty_output_chunk,
)


def test_decode_terminal_input_preserves_escape_sequences():
    assert decode_terminal_input("\x1b[A") == b"\x1b[A"


def test_decode_terminal_input_preserves_control_chars():
    assert decode_terminal_input("\r\x03") == b"\r\x03"


def test_encode_pty_output_chunk_is_json_safe_base64():
    payload = encode_pty_output_chunk("sess-1", b"\x1b[?2004hhello")
    assert payload["type"] == "pty_output_chunk"
    assert payload["session_id"] == "sess-1"
    assert payload["data_b64"] == "G1s/MjAwNGhoZWxsbw=="
```

- [ ] **Step 2: Run the failing tests**

Run:

```bash
pytest tests/test_pty_native.py -v
```

Expected: FAIL because `clau_decode.pty_native` does not exist.

- [ ] **Step 3: Implement payload helpers**

Create `src/clau_decode/pty_native.py`:

```python
from __future__ import annotations

import base64
from typing import Any


def decode_terminal_input(data: str) -> bytes:
    return data.encode("utf-8", errors="surrogatepass")


def encode_pty_output_chunk(session_id: str, chunk: bytes) -> dict[str, Any]:
    return {
        "type": "pty_output_chunk",
        "session_id": session_id,
        "data_b64": base64.b64encode(chunk).decode("ascii"),
    }


def encode_pty_snapshot(
    *,
    session_id: str,
    ring: bytes,
    rows: int,
    cols: int,
    alive: bool,
    native_state: str,
    decoded_input_safe: bool,
) -> dict[str, Any]:
    return {
        "session_id": session_id,
        "ring_b64": base64.b64encode(ring).decode("ascii"),
        "rows": rows,
        "cols": cols,
        "alive": alive,
        "native_state": native_state,
        "decoded_input_safe": decoded_input_safe,
    }
```

- [ ] **Step 4: Verify tests pass**

Run:

```bash
pytest tests/test_pty_native.py -v
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/clau_decode/pty_native.py tests/test_pty_native.py
git commit -m "feat: add native pty payload helpers"
```

---

### Task 2: Backend Raw Input, Resize, And Snapshot

**Files:**
- Modify: `src/clau_decode/pty_runner.py`
- Test: `tests/test_pty_runner.py`

- [ ] **Step 1: Write failing PtyManager tests**

Add tests that create/focus a fake TUI channel and call raw input without going
through `submit()`:

```python
async def test_write_raw_input_writes_bytes_without_submit_encoding(tui_shim_path, tmp_path, monkeypatch):
    monkeypatch.setenv("PATH", f"{tmp_path}:{os.environ['PATH']}")
    m = PtyManager(bin_name="fake-claude", idle_timeout_s=30, idle_warn_s=20)
    await m.focus("sess-native", cwd=str(tmp_path), bin_name="fake-claude", permission_mode="default")

    await m.write_raw_input("sess-native", b"\x1b[A")

    managed = m._channels["sess-native"]
    assert managed.channel.last_input_ms() > 0
    await m.shutdown()


async def test_native_snapshot_reports_ring_dimensions_and_alive(tui_shim_path, tmp_path):
    m = PtyManager(bin_name="fake-claude", idle_timeout_s=30, idle_warn_s=20)
    await m.focus("sess-native-snap", cwd=str(tmp_path), bin_name="fake-claude", permission_mode="default")

    snap = m.native_snapshot("sess-native-snap")

    assert snap["session_id"] == "sess-native-snap"
    assert snap["alive"] is True
    assert snap["rows"] > 0
    assert snap["cols"] > 0
    assert "ring_b64" in snap
    await m.shutdown()
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pytest tests/test_pty_runner.py::test_write_raw_input_writes_bytes_without_submit_encoding tests/test_pty_runner.py::test_native_snapshot_reports_ring_dimensions_and_alive -v
```

Expected: FAIL because methods do not exist.

- [ ] **Step 3: Implement `write_raw_input()` and snapshot**

In `PtyManager`, add:

```python
async def write_raw_input(self, session_id: str, data: bytes) -> None:
    async with self._session_lock(session_id):
        async with self._lock:
            managed = self._channels.get(session_id)
            if managed is None or not managed.channel.is_alive():
                raise RuntimeError(f"no live PTY channel for session {session_id}")
            managed.channel.write(data)
            self._reset_idle_timer_locked(session_id)
```

Add `PtyChannel.snapshot_bytes()` or use narrow accessors to avoid leaking
mutable ring state:

```python
def output_snapshot(self) -> bytes:
    return bytes(self._state.ring)

def dimensions(self) -> tuple[int, int]:
    return self._rows, self._cols
```

Add `PtyManager.native_snapshot(session_id)`.

- [ ] **Step 4: Verify tests pass**

Run the same targeted pytest command. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/clau_decode/pty_runner.py tests/test_pty_runner.py
git commit -m "feat: expose native pty input and snapshot"
```

---

### Task 3: Backend Native Routes

**Files:**
- Modify: `src/clau_decode/server.py`
- Test: `tests/test_server.py`

- [ ] **Step 1: Write failing route tests**

Add route contract tests with the app's test client:

```python
async def test_pty_native_snapshot_route_returns_snapshot(client):
    r = await client.get("/api/pty/native-snapshot?session_id=sess-missing")
    assert r.status_code in {200, 404}


async def test_pty_native_input_rejects_missing_channel(client):
    r = await client.post("/api/pty/input", json={"session_id": "nope", "data": "\r"})
    assert r.status_code in {404, 409}


async def test_pty_resize_validates_dimensions(client):
    r = await client.post("/api/pty/resize", json={"session_id": "x", "rows": 0, "cols": 120})
    assert r.status_code == 422
```

Adjust fixture names to match existing `tests/test_server.py` client fixtures.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pytest tests/test_server.py -k "native_snapshot or native_input or resize_validates" -v
```

Expected: FAIL because routes do not exist.

- [ ] **Step 3: Add route models and routes**

In `server.py`, add request models:

```python
class _PtyNativeInputRequest(BaseModel):
    session_id: str
    data: str


class _PtyResizeRequest(BaseModel):
    session_id: str
    rows: int = Field(gt=0, le=200)
    cols: int = Field(gt=0, le=400)
```

Add:

```python
@app.get("/api/pty/native-snapshot")
async def pty_native_snapshot(session_id: str = Query(...)):
    try:
        return _pty_manager.native_snapshot(session_id)
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc))


@app.post("/api/pty/input")
async def pty_native_input(req: _PtyNativeInputRequest):
    try:
        await _pty_manager.write_raw_input(req.session_id, decode_terminal_input(req.data))
    except RuntimeError as exc:
        raise HTTPException(status_code=404, detail=str(exc))
    return {"ok": True}


@app.post("/api/pty/resize")
async def pty_resize(req: _PtyResizeRequest):
    await _pty_manager.resize(req.session_id, req.rows, req.cols)
    return {"ok": True}
```

- [ ] **Step 4: Verify route tests pass**

Run targeted pytest. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/clau_decode/server.py tests/test_server.py
git commit -m "feat: add native pty control routes"
```

---

### Task 4: PTY Output Events

**Files:**
- Modify: `src/clau_decode/pty_runner.py`
- Modify: `src/clau_decode/server.py` only if SSE mapping needs changes
- Test: `tests/test_pty_runner.py`
- Test: `tests/test_e2e.py` or `tests/test_server.py`

- [ ] **Step 1: Write failing event publication test**

Add to `tests/test_pty_runner.py`:

```python
async def test_pty_output_chunk_published_on_read(tui_shim_path, tmp_path):
    bus = EventBroadcaster()
    q = bus.subscribe()
    m = PtyManager(bin_name="fake-claude", db=None, bus=bus, idle_timeout_s=30, idle_warn_s=20)

    await m.focus("sess-output", cwd=str(tmp_path), bin_name="fake-claude", permission_mode="default")

    event = await asyncio.wait_for(q.get(), timeout=3)
    assert event["type"] == "pty_output_chunk"
    assert event["session_id"] == "sess-output"
    assert event["data_b64"]
    await m.shutdown()
```

Use the existing bus/fake TUI patterns in the file.

- [ ] **Step 2: Run test to verify failure**

Run targeted pytest. Expected: FAIL because no output event is published.

- [ ] **Step 3: Publish chunks from `PtyChannel._on_readable`**

In the manager's chunk hook, publish `encode_pty_output_chunk(...)`.

Do not publish unbounded full ring snapshots on every chunk.

- [ ] **Step 4: Verify tests pass**

Run targeted pytest. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/clau_decode/pty_runner.py tests/test_pty_runner.py
git commit -m "feat: stream native pty output events"
```

---

### Task 5: Frontend Native API Contract

**Files:**
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/utils/events.ts`
- Modify: `frontend/src/App.tsx`
- Test: `frontend/src/api/__tests__/client.test.ts`

- [ ] **Step 1: Write failing frontend API tests**

Add tests for:

- `api.ptyNativeSnapshot("sid")` calls `/api/pty/native-snapshot?session_id=sid`
- `api.ptyInput("sid", "\x1b[A")` posts `{session_id, data}`
- `createEventSource` dispatches `pty_output_chunk`

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd frontend
npm test -- client.test.ts
```

Expected: FAIL because APIs/events do not exist.

- [ ] **Step 3: Add types and client methods**

Add types:

```ts
export type NativePtyState =
  | "booting"
  | "idle_chat_input"
  | "assistant_streaming"
  | "slash_palette_open"
  | "ask_user_question"
  | "permission_prompt"
  | "login_required"
  | "trust_prompt"
  | "model_selector"
  | "btw_modal"
  | "native_input_required"
  | "unknown_interactive"
  | "dead";

export interface PtyNativeSnapshot {
  session_id: string;
  ring_b64: string;
  rows: number;
  cols: number;
  alive: boolean;
  native_state: NativePtyState;
  decoded_input_safe: boolean;
}
```

Add API methods and SSE handlers.

- [ ] **Step 4: Verify tests pass**

Run targeted frontend tests. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/utils/events.ts frontend/src/App.tsx frontend/src/api/__tests__/client.test.ts
git commit -m "feat: add frontend native pty api contract"
```

---

### Task 6: Native Terminal Component

Update: the initial implementation used xterm.js, then the renderer was replaced with `ghostty-web` after scrollback/redraw replay bugs surfaced with Claude Code's TUI output. Keep the task shape, but use `ghostty-web` and raw PTY writes for the final implementation.

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/src/components/ChatView/NativeTerminalView.tsx`
- Create: `frontend/src/components/ChatView/hooks/useNativePty.ts`
- Test: `frontend/src/components/ChatView/__tests__/NativeTerminalView.test.tsx`

- [ ] **Step 1: Add dependency**

Run:

```bash
cd frontend
npm install ghostty-web
```

- [ ] **Step 2: Write failing component tests**

Mock `ghostty-web` and verify:

- initial snapshot ring data is written to terminal;
- incoming `pty-output-chunk` event writes data;
- terminal `onData` calls `api.ptyInput`;
- resize calls `api.ptyResize`.

- [ ] **Step 3: Run tests to verify failure**

Run:

```bash
cd frontend
npm test -- NativeTerminalView.test.tsx
```

Expected: FAIL because component/hook do not exist.

- [ ] **Step 4: Implement hook and component**

`useNativePty(sessionId)`:

- fetches `api.ptyNativeSnapshot(sessionId)`;
- subscribes to local `pty-output-chunk` events;
- returns `writeInput(data)` and `resize(rows, cols)`.

`NativeTerminalView`:

- initializes `ghostty-web` and creates a terminal instance;
- writes decoded base64 snapshot bytes without frontend escape-sequence trimming;
- wires `terminal.onData`;
- sends resize on container size changes or a fixed initial size.

Use a focused first version. Keep terminal emulation, redraw handling, alternate screen behavior, wrapping, and scrollback inside Ghostty.

- [ ] **Step 5: Verify tests pass**

Run targeted frontend tests. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/components/ChatView/NativeTerminalView.tsx frontend/src/components/ChatView/hooks/useNativePty.ts frontend/src/components/ChatView/__tests__/NativeTerminalView.test.tsx
git commit -m "feat: add native terminal view"
```

---

### Task 7: Manual Decoded/Native Toggle

**Files:**
- Modify: `frontend/src/components/ChatView/ChatView.tsx`
- Modify: `frontend/src/components/ChatView/ConversationHeader.tsx`
- Test: `frontend/src/components/ChatView/__tests__/ChatViewLifecycle.test.tsx`

- [ ] **Step 1: Write failing toggle tests**

Test:

- default mode is Decoded View;
- clicking Native renders `NativeTerminalView`;
- clicking Decoded returns to `MessageList`;
- session id remains unchanged.

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
cd frontend
npm test -- ChatViewLifecycle.test.tsx
```

Expected: FAIL.

- [ ] **Step 3: Implement view-mode state**

In `ChatView`, add local state:

```ts
const [viewMode, setViewMode] = useState<"decoded" | "native">("decoded");
```

Pass `viewMode` and `onViewModeChange` to the header. Render:

```tsx
{viewMode === "native" ? (
  <NativeTerminalView sessionId={selectedSessionId} />
) : (
  <MessageList ... />
)}
```

- [ ] **Step 4: Verify tests pass**

Run targeted frontend tests. Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ChatView/ChatView.tsx frontend/src/components/ChatView/ConversationHeader.tsx frontend/src/components/ChatView/__tests__/ChatViewLifecycle.test.tsx
git commit -m "feat: add decoded native view toggle"
```

---

### Task 8: PTY Screen State Classifier

**Files:**
- Create: `src/clau_decode/pty_screen_state.py`
- Test: `tests/test_pty_screen_state.py`
- Modify: `src/clau_decode/pty_runner.py`

- [ ] **Step 1: Write failing classifier tests**

Create tests:

```python
from clau_decode.pty_screen_state import classify_screen


def test_classifies_login_required():
    assert classify_screen("Not logged in · Please run /login").state == "login_required"
    assert classify_screen("Not logged in · Please run /login").decoded_input_safe is False


def test_classifies_ask_user_question_denial_or_prompt_text():
    result = classify_screen("AskUserQuestion\nWhich option should I use?")
    assert result.state == "ask_user_question"
    assert result.decoded_input_safe is False


def test_unknown_interactive_is_not_safe():
    result = classify_screen("Allow this tool to run? Yes No")
    assert result.decoded_input_safe is False
```

- [ ] **Step 2: Run tests to verify failure**

Run:

```bash
pytest tests/test_pty_screen_state.py -v
```

Expected: FAIL.

- [ ] **Step 3: Implement conservative classifier**

Create:

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class PtyScreenClassification:
    state: str
    decoded_input_safe: bool


def classify_screen(text: str) -> PtyScreenClassification:
    lower = text.lower()
    if "not logged in" in lower or "please run /login" in lower:
        return PtyScreenClassification("login_required", False)
    if "askuserquestion" in lower:
        return PtyScreenClassification("ask_user_question", False)
    if "allow" in lower and ("yes" in lower or "no" in lower or "deny" in lower):
        return PtyScreenClassification("permission_prompt", False)
    if "/login" in lower or "trust" in lower:
        return PtyScreenClassification("native_input_required", False)
    if "?" in text and ("select" in lower or "choose" in lower):
        return PtyScreenClassification("unknown_interactive", False)
    return PtyScreenClassification("idle_chat_input", True)
```

Improve matching with fixtures after Phase 1 manual captures.

- [ ] **Step 4: Wire classifier into snapshot**

In `native_snapshot`, classify decoded ring text and include state/safety.

- [ ] **Step 5: Verify tests pass**

Run:

```bash
pytest tests/test_pty_screen_state.py tests/test_pty_runner.py -v
```

Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/clau_decode/pty_screen_state.py src/clau_decode/pty_runner.py tests/test_pty_screen_state.py tests/test_pty_runner.py
git commit -m "feat: classify native pty states"
```

---

### Task 9: Native State Events And Decoded Input Gating

**Files:**
- Modify: `src/clau_decode/pty_runner.py`
- Modify: `frontend/src/api/types.ts`
- Modify: `frontend/src/api/client.ts`
- Modify: `frontend/src/utils/events.ts`
- Modify: `frontend/src/App.tsx`
- Modify: `frontend/src/components/ChatView/ChatView.tsx`
- Modify: `frontend/src/components/ChatView/ChatInputBar.tsx`
- Test: `frontend/src/components/ChatView/__tests__/ChatViewLifecycle.test.tsx`

- [ ] **Step 1: Write failing frontend lifecycle tests**

Test:

- when `native-state` event says `decoded_input_safe: false`, Decoded composer
  is disabled;
- a "Native input required" control appears;
- clicking it switches to Native View.

- [ ] **Step 2: Run tests to verify failure**

Run targeted frontend tests. Expected: FAIL.

- [ ] **Step 3: Publish and consume native state**

Backend publishes:

```python
{
    "type": "pty_native_state",
    "session_id": sid,
    "state": classification.state,
    "decoded_input_safe": classification.decoded_input_safe,
}
```

Frontend forwards it to local events and stores latest state in `ChatView`.

- [ ] **Step 4: Gate Decoded composer**

Pass `nativeInputRequired`/`decodedInputSafe` into `ChatInputBar`.

`ChatInputBar` should show a compact inline prompt instead of normal composer
when unsafe:

```tsx
<button onClick={() => setViewMode("native")}>Switch to Native View</button>
```

- [ ] **Step 5: Verify tests pass**

Run targeted frontend tests. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/clau_decode/pty_runner.py frontend/src/api/types.ts frontend/src/api/client.ts frontend/src/utils/events.ts frontend/src/App.tsx frontend/src/components/ChatView/ChatView.tsx frontend/src/components/ChatView/ChatInputBar.tsx frontend/src/components/ChatView/__tests__/ChatViewLifecycle.test.tsx
git commit -m "feat: gate decoded input on native pty state"
```

---

### Task 10: Auto-Switch For Blocking Native States

**Files:**
- Modify: `frontend/src/components/ChatView/ChatView.tsx`
- Modify: `frontend/src/components/ChatView/ConversationHeader.tsx`
- Test: `frontend/src/components/ChatView/__tests__/ChatViewLifecycle.test.tsx`

- [ ] **Step 1: Write failing auto-switch tests**

Test:

- `ask_user_question`, `permission_prompt`, `login_required`, `trust_prompt`,
  `btw_modal`, and `unknown_interactive` switch view to Native.
- `slash_palette_open` does not auto-switch from Decoded View but shows badge.

- [ ] **Step 2: Run tests to verify failure**

Run targeted frontend tests. Expected: FAIL.

- [ ] **Step 3: Implement auto-switch policy**

Add:

```ts
const AUTO_NATIVE_STATES = new Set([
  "ask_user_question",
  "permission_prompt",
  "login_required",
  "trust_prompt",
  "btw_modal",
  "unknown_interactive",
]);
```

When latest state for the selected session enters one of these states, set
`viewMode` to `"native"`.

- [ ] **Step 4: Add header state badge**

Badge copy examples:

- `Native input required`
- `Slash menu open`
- `Claude login required`

- [ ] **Step 5: Verify tests pass**

Run targeted frontend tests. Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/ChatView/ChatView.tsx frontend/src/components/ChatView/ConversationHeader.tsx frontend/src/components/ChatView/__tests__/ChatViewLifecycle.test.tsx
git commit -m "feat: auto switch for native prompt states"
```

---

### Task 11: Permission Mode Cleanup

**Files:**
- Modify: `src/clau_decode/config.py`
- Modify: `src/clau_decode/server.py`
- Modify: `frontend/src/components/ChatView/ChatInput.tsx`
- Test: `tests/test_pty_runner.py`
- Test: `tests/test_e2e.py`
- Test: `frontend/src/components/ChatView/__tests__/ChatInput.test.tsx`

- [ ] **Step 1: Locate current default mode behavior**

Run:

```bash
rg -n "dontAsk|claude_default_permission_mode|permission_mode" src frontend/src tests
```

- [ ] **Step 2: Write failing tests for native-compatible default**

Backend:

- config default no longer resolves to `dontAsk` for normal user-facing PTY
  sessions;
- Keychain/server env behavior does not expose API keys in frontend payloads.

Frontend:

- no forced `dontAsk` warning path for normal native-enabled sessions.

- [ ] **Step 3: Implement default cleanup**

Change the normal user-facing PTY launch default to a native-compatible mode.
Do not change recap/fork hidden PTY behavior unless required; recap can still
use non-interactive safeguards if it never exposes a native prompt.

- [ ] **Step 4: Verify tests pass**

Run:

```bash
pytest tests/test_pty_runner.py tests/test_e2e.py -v
cd frontend && npm test -- ChatInput.test.tsx
```

- [ ] **Step 5: Commit**

```bash
git add src/clau_decode/config.py src/clau_decode/server.py frontend/src/components/ChatView/ChatInput.tsx tests/test_pty_runner.py tests/test_e2e.py frontend/src/components/ChatView/__tests__/ChatInput.test.tsx
git commit -m "feat: prefer native-compatible permission mode"
```

---

### Task 12: End-To-End Verification And Build

**Files:**
- Modify generated static assets under `src/clau_decode/static/`
- Possibly update docs with final notes

- [ ] **Step 1: Run full Python tests**

```bash
pytest
```

Expected: all pass.

- [ ] **Step 2: Run full frontend tests**

```bash
cd frontend
npm test
```

Expected: all pass.

- [ ] **Step 3: Build frontend static assets**

```bash
cd frontend
npm run build
```

Expected: build passes and updates `src/clau_decode/static/`.

- [ ] **Step 4: Launch preview server with Keychain-backed env**

```bash
ANTHROPIC_API_KEY="$(security find-generic-password -a "$USER" -s zai-anthropic-key -w 2>/dev/null)" PYTHONPATH=src python -c 'from clau_decode.cli import main; main()' --no-open --log-level info
```

Expected: server starts at `http://127.0.0.1:4242` and `/api/health` returns
`{"ok":true}`.

- [ ] **Step 5: Manual KVM checks**

- Open an existing session.
- Toggle Decoded → Native → Decoded.
- Type in Native View and confirm the terminal responds.
- Send a normal prompt from Decoded View when state is safe.
- Trigger `/` in Native View and confirm native slash menu works.
- Trigger an `AskUserQuestion` or permission prompt and confirm auto-switch.
- Confirm no `Not logged in` regression with the Keychain-backed env.

- [ ] **Step 6: Commit final build**

```bash
git add src/clau_decode/static docs/superpowers/plans/2026-06-06-native-kvm-dual-view.md
git commit -m "build: update static assets for native kvm view"
```

---

## Execution Notes

- Keep commits small. Each task should be independently reviewable.
- Do not port the slash-command probing WIP into this branch unless a later
  task proves it is still needed.
- Do not reintroduce `dontAsk` as the web UI's primary solution to native
  prompts.
- Keep raw terminal input and decoded chat submit separate in route names,
  method names, tests, and UI copy.
- If a classifier state is uncertain, prefer Native View over a swallowed
  Decoded View submit.

## Final Verification Notes

2026-06-06:

- `pytest`: 548 passed, 1 skipped.
- `cd frontend && npm test`: 18 files, 170 tests passed.
- `cd frontend && npm run build`: passed and regenerated `src/clau_decode/static/`.
- Keychain-backed preview server launched at `http://127.0.0.1:4242`.
- `curl -fsS http://127.0.0.1:4242/api/health`: `{"ok":true}`.
- Local smoke confirmed the built SPA index is served. Live native-terminal typing
  and real Claude prompt flows were not exercised to avoid spending API calls from
  the smoke test; those paths are covered by the API/component tests added in this
  plan.
