import { useEffect, useRef } from "react";
import { useAppStore } from "../../../store";
import { SCROLL } from "../../../config/ui";

// "Near bottom" (within ~one viewport) is the loose test used to decide whether
// a session-switch should restore an old read position or just let the snap
// hook land at the current bottom.
function isNearBottom(top: number, height: number, clientHeight: number): boolean {
  return height - top - clientHeight < clientHeight;
}

// "At bottom" is the STRICT test (within SNAP_THRESHOLD_PX). Resize/mutation
// re-pinning must use this, not isNearBottom: with the viewport-sized threshold,
// scrolling up even a little still counted as "near bottom", so every DOM
// mutation (e.g. a relative-timestamp tick) force-snapped the reader back down
// — the reported "scroll up a little → yanked to the bottom" bug. Only a reader
// genuinely parked at the bottom should be kept pinned as content grows.
function isAtBottom(top: number, height: number, clientHeight: number): boolean {
  return height - top - clientHeight <= SCROLL.SNAP_THRESHOLD_PX;
}

// Remember each session's scroll position so re-selecting a session lands the
// user where they left off. Skip the restore if they were within ~one viewport
// of the bottom — useSnapToBottom should land them at the current bottom in
// that case (the chat may have grown since they left).
//
// Also re-pins scroll across container resizes (sidebar collapse/expand,
// FileViewer open/close, sidebar mode toggle when it changes width). Some
// browsers preserve scrollTop across width changes and some don't; pinning
// makes the behaviour consistent so the user stays where they were reading.
export function useScrollPositionMemory(
  scrollElRef: React.MutableRefObject<HTMLElement | null>,
  sessionId: string | null,
  forceBottomRequest = 0,
): void {
  const scrollPositions = useRef(new Map<string, { top: number; height: number }>());
  const appliedForceBottomRequest = useRef(0);
  const forceBottomActiveUntil = useRef(0);
  // useSearchScroll clears pendingScrollMessageId (see its effect) before it
  // calls scrollTo(), so by the time that scroll actually starts animating,
  // this hook's own effect has already re-run with pendingScrollMessageId
  // back to null — a plain closure check on the prop would stop guarding
  // before the smooth-scroll animation (and its data-highlight mutation)
  // finish. This ref outlives that effect re-run, so the guard survives it.
  // It only needs to cover the brief click-to-scroll-start gap, NOT the
  // whole SEARCH_HIGHLIGHT_MS window — a fixed duration measured from click
  // time can't reliably outlast useSearchScroll's OWN timer, which starts
  // whenever its effect happens to run, not at a shared t=0. The rest of the
  // window is covered by isSearchHighlightActive() below, which checks the
  // actual DOM state useSearchScroll manages instead of guessing at timing.
  const searchScrollActiveUntil = useRef(0);
  const isSearchHighlightActive = () => !!document.querySelector('[data-highlight="1"]');
  const pendingScrollMessageId = useAppStore((s) => s.pendingScrollMessageId);

  useEffect(() => {
    const el = scrollElRef.current;
    if (!el || !sessionId) return;

    const forceBottom = () => {
      el.scrollTop = el.scrollHeight;
      scrollPositions.current.set(sessionId, {
        top: el.scrollTop,
        height: el.scrollHeight,
      });
    };

    if (pendingScrollMessageId) {
      searchScrollActiveUntil.current = Date.now() + 500;
    }

    // Skip restoration when a search-scroll is pending — useSearchScroll will
    // handle the navigation instead, and restoring here would cause a flicker.
    if (forceBottomRequest > appliedForceBottomRequest.current) {
      appliedForceBottomRequest.current = forceBottomRequest;
      forceBottomActiveUntil.current = Date.now() + 1000;
      forceBottom();
    } else if (!pendingScrollMessageId) {
      const saved = scrollPositions.current.get(sessionId);
      if (saved) {
        if (!isNearBottom(saved.top, saved.height, el.clientHeight)) {
          el.scrollTop = saved.top;
        }
      }
    }

    // Container/content resize → restore last saved position. rAF-coalesce so
    // a burst of resize/mutation callbacks during a sidebar/FileViewer or
    // OverlayScrollbars transition only restores once at the end.
    let pendingRaf = 0;
    const restorePinned = () => {
      pendingRaf = 0;
      // A search-driven scroll (or its data-highlight mutation) is in
      // flight — let it land instead of yanking the reader back to their
      // pre-search bottom position.
      if (Date.now() <= searchScrollActiveUntil.current || isSearchHighlightActive()) return;
      if (Date.now() <= forceBottomActiveUntil.current) {
        forceBottom();
        return;
      }
      const last = scrollPositions.current.get(sessionId);
      if (!last) return;
      if (isAtBottom(last.top, last.height, el.clientHeight)) {
        forceBottom();
        return;
      }
      if (Math.abs(el.scrollTop - last.top) > 1) {
        el.scrollTop = last.top;
      }
    };
    const scheduleRestore = () => {
      if (pendingRaf) return;
      pendingRaf = requestAnimationFrame(restorePinned);
    };

    // Was a scrollTop change caused by the user, vs. some non-user reset (e.g.
    // a scrollbar library re-render zeroing scrollTop)? Both produce an
    // identical `scroll` event, so this can't be told apart from the scroll
    // signal alone (see the sibling test asserting a non-user reset DOES get
    // restored) — it has to come from input.
    //
    // Armed by real input, listened for on `window` in the capture phase, not
    // just on `el`: OverlayScrollbars renders its scrollbar track/thumb as a
    // sibling of the viewport, so a scrollbar-thumb drag's `pointerdown`
    // never reaches `el` — the previous el-scoped listener missed it
    // entirely, treating a deliberate drag as a non-user reset and snapping
    // back mid-drag.
    //
    // Every `scroll` event that lands while intent is armed re-arms it, so a
    // trackpad's inertial/momentum scrolling — which keeps emitting `scroll`
    // long after the one real `wheel` event that started it — stays "user"
    // for the gesture's full duration instead of going stale after a fixed
    // window and getting yanked back mid-flick.
    const SCROLL_INTENT_DECAY_MS = 200;
    let scrollIntentActive = false;
    let decayTimer: ReturnType<typeof setTimeout> | undefined;
    const armScrollIntent = () => {
      scrollIntentActive = true;
      if (decayTimer !== undefined) clearTimeout(decayTimer);
      decayTimer = setTimeout(() => {
        scrollIntentActive = false;
      }, SCROLL_INTENT_DECAY_MS);
    };

    const onScroll = () => {
      if (scrollIntentActive) armScrollIntent(); // momentum: keep it warm

      if (Date.now() <= searchScrollActiveUntil.current || isSearchHighlightActive()) {
        // Track position through the search-driven scroll so comparisons
        // right after the guard window closes are against where it landed,
        // not the stale pre-search bottom.
        scrollPositions.current.set(sessionId, {
          top: el.scrollTop,
          height: el.scrollHeight,
        });
        return;
      }

      const last = scrollPositions.current.get(sessionId);
      const previousWasNearBottom = last
        ? isNearBottom(last.top, last.height, el.clientHeight)
        : false;
      const currentIsNearBottom = isNearBottom(el.scrollTop, el.scrollHeight, el.clientHeight);

      if (previousWasNearBottom && !currentIsNearBottom && !scrollIntentActive) {
        scheduleRestore();
        return;
      }

      scrollPositions.current.set(sessionId, {
        top: el.scrollTop,
        height: el.scrollHeight,
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("wheel", armScrollIntent, { passive: true, capture: true });
    window.addEventListener("touchstart", armScrollIntent, { passive: true, capture: true });
    window.addEventListener("touchmove", armScrollIntent, { passive: true, capture: true });
    window.addEventListener("pointerdown", armScrollIntent, { capture: true });
    window.addEventListener("keydown", armScrollIntent, { capture: true });

    const ro = new ResizeObserver(() => {
      scheduleRestore();
    });
    const mo = new MutationObserver(() => {
      scheduleRestore();
    });
    // ResizeObserver/MutationObserver require a real DOM node. In production
    // `el` is always the scroller's viewport element, but guard so a non-Node
    // ref never throws (jsdom's MutationObserver rejects non-Nodes); the scroll
    // event listeners attached above still work either way.
    if (el instanceof Node) {
      ro.observe(el);
      mo.observe(el, { attributes: true, childList: true, subtree: true });
    }

    return () => {
      el.removeEventListener("scroll", onScroll);
      window.removeEventListener("wheel", armScrollIntent, { capture: true });
      window.removeEventListener("touchstart", armScrollIntent, { capture: true });
      window.removeEventListener("touchmove", armScrollIntent, { capture: true });
      window.removeEventListener("pointerdown", armScrollIntent, { capture: true });
      window.removeEventListener("keydown", armScrollIntent, { capture: true });
      if (pendingRaf) cancelAnimationFrame(pendingRaf);
      if (decayTimer !== undefined) clearTimeout(decayTimer);
      ro.disconnect();
      mo.disconnect();
    };
  }, [scrollElRef, sessionId, pendingScrollMessageId, forceBottomRequest]);
}
