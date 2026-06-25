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

  it("does NOT snap to bottom on a DOM mutation after the reader scrolls up a little", async () => {
    // Regression: scrolling up within one viewport of the bottom used to still
    // count as "near bottom", so a relative-timestamp tick (MutationObserver)
    // yanked the reader back down. The reader must stay put.
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollHeight", { value: 2000, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: 300, configurable: true });

    render(<Harness el={el} forceBottomRequest={0} />);
    // Parked at the bottom (max scrollTop = 2000 - 300 = 1700).
    el.scrollTop = 1700;
    fireEvent.scroll(el);
    // Scroll up a little (50px) — within a viewport, but past the snap threshold.
    el.scrollTop = 1650;
    fireEvent.scroll(el);

    // A DOM mutation fires (e.g. a relative-time label updates).
    mutationCallbacks.forEach((callback) => callback());

    // Give the rAF-coalesced restore a chance to run, then assert no snap-down.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(el.scrollTop).toBe(1650);
  });
});
