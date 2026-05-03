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

  it("does not call onRefresh for malformed JSON", async () => {
    const { createEventSource } = await import("../client");
    const onRefresh = vi.fn();
    createEventSource(onRefresh);

    MockEventSource.lastInstance!.emit("not-valid-json{{{");

    expect(onRefresh).not.toHaveBeenCalled();
  });

  it("opens EventSource at /api/events", async () => {
    const { createEventSource } = await import("../client");
    createEventSource(vi.fn());

    expect(MockEventSource.lastInstance!.url).toBe("/api/events");
  });

  it("returned object has a close() method", async () => {
    const { createEventSource } = await import("../client");
    const es = createEventSource(vi.fn());

    es.close();

    expect(MockEventSource.lastInstance!.closed).toBe(true);
  });
});
