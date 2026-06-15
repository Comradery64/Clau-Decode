/**
 * SSE client contract tests.
 *
 * The backend emits  data: {"type": "refresh", "path": "..."}
 * createEventSource  checks  data.type === "refresh"  to fire onRefresh.
 *
 * If either side renames the field the live-update loop silently breaks —
 * these tests lock both ends of that contract.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Minimal EventSource mock
// ---------------------------------------------------------------------------

type MessageListener = (e: { data: string }) => void;

class MockEventSource {
  static lastInstance: MockEventSource | null = null;
  url: string;
  private listeners: Map<string, MessageListener[]> = new Map();
  closed = false;

  constructor(url: string) {
    this.url = url;
    MockEventSource.lastInstance = this;
  }

  addEventListener(type: string, fn: MessageListener) {
    if (!this.listeners.has(type)) this.listeners.set(type, []);
    this.listeners.get(type)!.push(fn);
  }

  /** Helper: simulate an incoming SSE message event. */
  emit(data: string) {
    this.listeners.get("message")?.forEach((fn) => fn({ data }));
  }

  /** Helper: simulate the connection opening (initial connect or reconnect). */
  emitOpen() {
    this.listeners.get("open")?.forEach((fn) => fn({ data: "" }));
  }

  close() {
    this.closed = true;
  }
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createEventSource — SSE payload contract", () => {
  let originalEventSource: typeof EventSource;

  beforeEach(() => {
    originalEventSource = globalThis.EventSource;
    globalThis.EventSource = MockEventSource as unknown as typeof EventSource;
    MockEventSource.lastInstance = null;
  });

  afterEach(() => {
    globalThis.EventSource = originalEventSource;
  });

  it("calls onRefresh when type === 'refresh'", async () => {
    const { createEventSource } = await import("../client");
    const onRefresh = vi.fn();
    createEventSource(onRefresh);

    MockEventSource.lastInstance!.emit(
      JSON.stringify({ type: "refresh", path: "/some/session.jsonl" })
    );

    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("does not call onRefresh for unknown type", async () => {
    const { createEventSource } = await import("../client");
    const onRefresh = vi.fn();
    createEventSource(onRefresh);

    MockEventSource.lastInstance!.emit(
      JSON.stringify({ type: "update", path: "/some/session.jsonl" })
    );

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("fires onReconnect only on re-open, not the initial connect", async () => {
    const { createEventSource } = await import("../client");
    const onReconnect = vi.fn();
    createEventSource({ onRefresh: vi.fn(), onReconnect });

    // Initial connect — must NOT count as a reconnect.
    MockEventSource.lastInstance!.emitOpen();
    expect(onReconnect).not.toHaveBeenCalled();

    // Drop + auto-reconnect: EventSource fires "open" again.
    MockEventSource.lastInstance!.emitOpen();
    expect(onReconnect).toHaveBeenCalledOnce();

    // A second reconnect fires it again.
    MockEventSource.lastInstance!.emitOpen();
    expect(onReconnect).toHaveBeenCalledTimes(2);
  });

  it("does not call onRefresh for malformed JSON", async () => {
    const { createEventSource } = await import("../client");
    const onRefresh = vi.fn();
    createEventSource(onRefresh);

    MockEventSource.lastInstance!.emit("not-valid-json{{{");

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("opens EventSource at /api/events", async () => {
    const { createEventSource } = await import("../client");
    createEventSource(vi.fn() as () => void);

    expect(MockEventSource.lastInstance!.url).toBe("/api/events");
  });

  it("returned object has a close() method", async () => {
    const { createEventSource } = await import("../client");
    const es = createEventSource(vi.fn() as () => void);

    es.close();

    expect(MockEventSource.lastInstance!.closed).toBe(true);
  });

  // ---- session-meta fan-out (issue #11) ----

  it("calls onSessionMeta for type === 'session-meta'", async () => {
    const { createEventSource } = await import("../client");
    const onRefresh = vi.fn();
    const onSessionMeta = vi.fn();
    createEventSource({ onRefresh, onSessionMeta });

    MockEventSource.lastInstance!.emit(
      JSON.stringify({ type: "session-meta", id: "abc", title: "New" })
    );

    expect(onSessionMeta).toHaveBeenCalledWith({ id: "abc", title: "New" });
    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("session-meta with null title (clear) round-trips faithfully", async () => {
    const { createEventSource } = await import("../client");
    const onSessionMeta = vi.fn();
    createEventSource({ onRefresh: vi.fn(), onSessionMeta });

    MockEventSource.lastInstance!.emit(
      JSON.stringify({ type: "session-meta", id: "abc", title: null })
    );

    expect(onSessionMeta).toHaveBeenCalledWith({ id: "abc", title: null });
  });

  it("legacy onRefresh-only callers still work", async () => {
    const { createEventSource } = await import("../client");
    const onRefresh = vi.fn();
    createEventSource(onRefresh);

    MockEventSource.lastInstance!.emit(JSON.stringify({ type: "refresh" }));
    expect(onRefresh).toHaveBeenCalledOnce();
  });

  it("calls onPtySubmitCompleted for submit lifecycle events", async () => {
    const { createEventSource } = await import("../client");
    const onPtySubmitCompleted = vi.fn();
    createEventSource({ onRefresh: vi.fn(), onPtySubmitCompleted });

    MockEventSource.lastInstance!.emit(
      JSON.stringify({
        type: "pty_submit_completed",
        session_id: "sess-1",
        kind: "btw",
        status: "completed",
        input_id: 1,
        response_id: 2,
      }),
    );

    expect(onPtySubmitCompleted).toHaveBeenCalledWith({
      session_id: "sess-1",
      kind: "btw",
      status: "completed",
      input_id: 1,
      response_id: 2,
    });
  });

  it("calls onPtyOutputChunk for native PTY output events", async () => {
    const { createEventSource } = await import("../client");
    const onPtyOutputChunk = vi.fn();
    createEventSource({ onRefresh: vi.fn(), onPtyOutputChunk });

    MockEventSource.lastInstance!.emit(
      JSON.stringify({
        type: "pty_output_chunk",
        session_id: "sess-1",
        data_b64: "aGVsbG8=",
      }),
    );

    expect(onPtyOutputChunk).toHaveBeenCalledWith({
      session_id: "sess-1",
      data_b64: "aGVsbG8=",
    });
  });
});

describe("api — native PTY contract", () => {
  let originalFetch: typeof fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn(() =>
      Promise.resolve(
        new Response(
          JSON.stringify({
            session_id: "sid",
            ring_b64: "",
            rows: 40,
            cols: 120,
            alive: true,
            native_state: "idle_chat_input",
            decoded_input_safe: true,
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    ) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("ptyNativeSnapshot calls the native snapshot route", async () => {
    const { api } = await import("../client");

    await api.ptyNativeSnapshot("sid");

    expect(globalThis.fetch).toHaveBeenCalledWith(
      "/api/pty/native-snapshot?session_id=sid",
    );
  });

  it("ptyInput posts raw terminal input", async () => {
    const { api } = await import("../client");

    await api.ptyInput("sid", "\x1b[A");

    expect(globalThis.fetch).toHaveBeenCalledWith("/api/pty/input", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ session_id: "sid", data: "\x1b[A" }),
    });
  });
});
