import { useRef } from "react";
import { act, fireEvent, render, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useScrollPositionMemory } from "../useScrollPositionMemory";
import { useAppStore } from "../../../../store";

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
    useAppStore.setState({ pendingScrollMessageId: null });
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

  it("treats a scrollbar-thumb drag as a real scroll, not a spurious reset", async () => {
    // Regression: OverlayScrollbars renders its scrollbar thumb as a sibling
    // of the viewport element, so a thumb-drag's pointerdown never lands on
    // `el` itself. Intent detection has to listen on `window`, or a
    // deliberate drag gets misread as a non-user reset and snapped back.
    const el = document.createElement("div");
    Object.defineProperty(el, "scrollHeight", { value: 1200, configurable: true });
    Object.defineProperty(el, "clientHeight", { value: 300, configurable: true });
    document.body.appendChild(el);
    const scrollbarThumb = document.createElement("div");
    document.body.appendChild(scrollbarThumb);

    render(<Harness el={el} forceBottomRequest={0} />);
    el.scrollTop = 900; // near bottom (dist = 0)
    fireEvent.scroll(el);

    fireEvent.pointerDown(scrollbarThumb); // drag starts on the thumb, not `el`
    el.scrollTop = 200; // dragged far from the bottom (dist = 700)
    fireEvent.scroll(el);

    // No restore should be scheduled — give a rAF tick a chance to run one
    // if it were (it shouldn't be), then assert the drag position holds.
    await new Promise((r) => requestAnimationFrame(() => r(null)));
    expect(el.scrollTop).toBe(200);

    document.body.removeChild(el);
    document.body.removeChild(scrollbarThumb);
  });

  it("keeps scroll intent alive through momentum past the old fixed 750ms window", async () => {
    // Regression: the old design armed intent once per wheel event and let it
    // go stale after a single fixed 750ms window. Trackpad inertial
    // scrolling keeps emitting `scroll` events (no further `wheel`) well past
    // that, so a long momentum flick used to look "not recent" by the time it
    // crossed out of near-bottom, and got snapped back mid-flick. Each scroll
    // event should re-arm the (much shorter) decay window instead, so a
    // steady stream of momentum events — even 900ms after the one real wheel
    // event that started it — still counts as user-driven.
    vi.useFakeTimers();
    const el = document.createElement("div");
    try {
      Object.defineProperty(el, "scrollHeight", { value: 1200, configurable: true });
      Object.defineProperty(el, "clientHeight", { value: 300, configurable: true });
      // Must be connected to the document — the wheel listener that arms
      // scroll intent is attached on `window`, and events fired on a
      // detached node never bubble up to it.
      document.body.appendChild(el);

      render(<Harness el={el} forceBottomRequest={0} />);
      el.scrollTop = 900; // near bottom (dist = 0)
      fireEvent.scroll(el);

      fireEvent.wheel(el, { deltaY: -10 }); // the one real wheel event

      // Momentum: a steady stream of scroll events 150ms apart (comfortably
      // inside the new 200ms decay window), all still near bottom.
      const nearBottomSteps = [880, 860, 840, 820, 800];
      for (const top of nearBottomSteps) {
        vi.advanceTimersByTime(150);
        el.scrollTop = top;
        fireEvent.scroll(el);
      }

      // The crossing step: 150ms after the last momentum event (still inside
      // the decay window), but 900ms after the original wheel event — past
      // the old fixed 750ms cutoff.
      vi.advanceTimersByTime(150);
      el.scrollTop = 400; // dist = 500, now far from bottom
      fireEvent.scroll(el);

      // Flush any rAF-scheduled restore (fake timers also drive requestAnimationFrame).
      vi.advanceTimersByTime(20);

      expect(el.scrollTop).toBe(400); // held the momentum position, not snapped back
    } finally {
      document.body.removeChild(el);
      vi.useRealTimers();
    }
  });

  it("does not snap back to bottom when a search result scrolls the reader away from it", async () => {
    // Regression: useSearchScroll clears pendingScrollMessageId *before*
    // calling scrollTo(), so by the time the smooth scroll actually moves
    // scrollTop away from bottom, this hook's effect had already re-run
    // with pendingScrollMessageId back to null — indistinguishable from a
    // non-user scrollbar reset, which forces a restore back to bottom. The
    // reader should land on the search result, not get yanked back down.
    //
    // A second regression on top of that: useSearchScroll also removes its
    // data-highlight attribute after SCROLL.SEARCH_HIGHLIGHT_MS, which is
    // itself a mutation the MutationObserver reacts to. A fixed-duration
    // guard measured from click time can't reliably outlast that timer,
    // since useSearchScroll's setTimeout starts whenever ITS effect happens
    // to run, not at the same t=0 — caught live, where the reader held the
    // search-result position for ~1.8s, then got yanked to the bottom right
    // as the highlight faded, past a guard sized to "SEARCH_HIGHLIGHT_MS +
    // 200". The real fix checks the DOM state useSearchScroll manages
    // (whether a `[data-highlight="1"]` element still exists) instead of
    // guessing at timing — so this test advances well past the short
    // click-to-scroll-start timer and relies solely on that DOM check.
    vi.useFakeTimers();
    const el = document.createElement("div");
    const target = document.createElement("div");
    document.body.appendChild(target);
    try {
      Object.defineProperty(el, "scrollHeight", { value: 2000, configurable: true });
      Object.defineProperty(el, "clientHeight", { value: 300, configurable: true });

      const { rerender } = render(<Harness el={el} forceBottomRequest={0} />);
      // Parked at the bottom.
      el.scrollTop = 1700;
      fireEvent.scroll(el);

      // useSearchScroll's effect begins: pendingScrollMessageId goes non-null...
      act(() => {
        useAppStore.setState({ pendingScrollMessageId: "msg-1" });
      });
      rerender(<Harness el={el} forceBottomRequest={0} />);
      // ...then is cleared synchronously, before scrollTo() and the
      // data-highlight mutation run.
      act(() => {
        useAppStore.setState({ pendingScrollMessageId: null });
      });
      rerender(<Harness el={el} forceBottomRequest={0} />);
      target.setAttribute("data-highlight", "1");

      // The search-driven scroll lands far from the bottom.
      el.scrollTop = 200;
      fireEvent.scroll(el);

      // Past the short click-to-scroll-start timer, but the highlight is
      // still up — a mutation firing here must not restore.
      vi.advanceTimersByTime(600);
      mutationCallbacks.forEach((callback) => callback());
      vi.advanceTimersByTime(20);
      expect(el.scrollTop).toBe(200);

      // The highlight is removed (useSearchScroll's own cleanup) and the
      // mutation this causes must not restore either.
      target.removeAttribute("data-highlight");
      mutationCallbacks.forEach((callback) => callback());
      vi.advanceTimersByTime(20);
      expect(el.scrollTop).toBe(200);
    } finally {
      document.body.removeChild(target);
      vi.useRealTimers();
    }
  });
});
