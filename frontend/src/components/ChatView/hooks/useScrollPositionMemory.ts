import { useEffect, useRef } from "react";
import { useAppStore } from "../../../store";
import { SCROLL } from "../../../config/ui";

const USER_SCROLL_INTENT_MS = 750;

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
  const lastUserScrollIntentAt = useRef(0);
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
    const markUserScrollIntent = () => {
      lastUserScrollIntentAt.current = Date.now();
    };
    const onScroll = () => {
      const last = scrollPositions.current.get(sessionId);
      const previousWasNearBottom = last
        ? isNearBottom(last.top, last.height, el.clientHeight)
        : false;
      const currentIsNearBottom = isNearBottom(el.scrollTop, el.scrollHeight, el.clientHeight);
      const recentUserScroll =
        Date.now() - lastUserScrollIntentAt.current <= USER_SCROLL_INTENT_MS;

      if (previousWasNearBottom && !currentIsNearBottom && !recentUserScroll) {
        scheduleRestore();
        return;
      }

      scrollPositions.current.set(sessionId, {
        top: el.scrollTop,
        height: el.scrollHeight,
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("wheel", markUserScrollIntent, { passive: true });
    el.addEventListener("touchmove", markUserScrollIntent, { passive: true });
    el.addEventListener("pointerdown", markUserScrollIntent, { passive: true });
    el.addEventListener("keydown", markUserScrollIntent);

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
      el.removeEventListener("wheel", markUserScrollIntent);
      el.removeEventListener("touchmove", markUserScrollIntent);
      el.removeEventListener("pointerdown", markUserScrollIntent);
      el.removeEventListener("keydown", markUserScrollIntent);
      if (pendingRaf) cancelAnimationFrame(pendingRaf);
      ro.disconnect();
      mo.disconnect();
    };
  }, [scrollElRef, sessionId, pendingScrollMessageId, forceBottomRequest]);
}
