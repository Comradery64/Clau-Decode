import { useRef } from "react";
import { fireEvent, render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useScrollPositionMemory } from "../useScrollPositionMemory";

function Harness({
  el,
  forceBottomRequest,
}: {
  el: HTMLElement;
  forceBottomRequest: number;
}) {
  const ref = useRef<HTMLElement | null>(el);
  useScrollPositionMemory(ref, "sess-scroll", forceBottomRequest);
  return null;
}

describe("useScrollPositionMemory", () => {
  let resizeCallbacks: Array<() => void>;
  let mutationCallbacks: Array<() => void>;

  beforeEach(() => {
    resizeCallbacks = [];
    mutationCallbacks = [];
    vi.stubGlobal("ResizeObserver", class {
      constructor(callback: () => void) {
        resizeCallbacks.push(callback);
      }
      observe = vi.fn();
      disconnect = vi.fn();
    });
    vi.stubGlobal("MutationObserver", class {
      constructor(callback: () => void) {
        mutationCallbacks.push(callback);
      }
      observe = vi.fn();
      disconnect = vi.fn();
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("forces bottom when requested and does not restore an old read position on resize", async () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollHeight", {
      value: 1200,
      configurable: true,
    });
    Object.defineProperty(el, "clientHeight", {
      value: 300,
      configurable: true,
    });

    const { rerender } = render(<Harness el={el} forceBottomRequest={0} />);
    el.scrollTop = 120;
    fireEvent.scroll(el);

    rerender(<Harness el={el} forceBottomRequest={1} />);

    await waitFor(() => {
      expect(el.scrollTop).toBe(1200);
    });

    el.scrollTop = 0;
    resizeCallbacks.forEach((callback) => callback());

    await waitFor(() => {
      expect(el.scrollTop).toBe(1200);
    });
  });

  it("restores bottom after a non-user scrollbar rerender resets scrollTop", async () => {
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollHeight", {
      value: 1200,
      configurable: true,
    });
    Object.defineProperty(el, "clientHeight", {
      value: 300,
      configurable: true,
    });

    render(<Harness el={el} forceBottomRequest={0} />);
    el.scrollTop = 900;
    fireEvent.scroll(el);

    el.scrollTop = 0;
    fireEvent.scroll(el);
    mutationCallbacks.forEach((callback) => callback());

    await waitFor(() => {
      expect(el.scrollTop).toBe(1200);
    });
  });
});
