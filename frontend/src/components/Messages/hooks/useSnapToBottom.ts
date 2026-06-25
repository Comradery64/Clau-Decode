import { useEffect, useRef } from "react";
import type { SessionDetail } from "../../../api/types";
import { SCROLL } from "../../../config/ui";

type ScrollRef = { readonly current: HTMLElement | null };

export function useSnapToBottom(
  containerRef: ScrollRef | null,
  detail: SessionDetail | null,
  sessionId: string,
  pendingScrollMessageId: string | null,
  optimisticActive: boolean = false,
) {
  const scrolledSessionRef = useRef<string | null>(null);
  const nearBottomRef = useRef(true);

  // Track whether the user is *pinned to the bottom* (following) vs reading
  // history. The streaming snap (below) only re-pins while this is true.
  //
  // Direction-based, NOT a distance threshold: ANY upward scroll — even a few
  // px — stops the follow, and the user only re-engages it by returning to the
  // bottom. The old `dist < NEAR_BOTTOM_PX` (80px) check meant scrolling up "a
  // little" still counted as near-bottom, so the next detail update (e.g. a
  // `refresh` SSE event) yanked the user back down — the reported bug. A
  // distance threshold alone can't fix it (a scroll smaller than the threshold
  // still snaps), so we gate on intent: wheel-up or a decrease in scrollTop.
  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;
    let lastTop = container.scrollTop;
    const onScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (container.scrollTop < lastTop - 1) {
        // Moved up → reading history → stop following.
        nearBottomRef.current = false;
      } else if (dist <= SCROLL.SNAP_THRESHOLD_PX) {
        // At (or returned to) the bottom → follow the stream again.
        nearBottomRef.current = true;
      }
      lastTop = container.scrollTop;
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) nearBottomRef.current = false;
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    container.addEventListener("wheel", onWheel, { passive: true });
    return () => {
      container.removeEventListener("scroll", onScroll);
      container.removeEventListener("wheel", onWheel);
    };
  }, [sessionId]);

  // Streaming auto-scroll: snap to bottom on detail updates, but only while
  // the user is pinned to the bottom (following the stream).
  useEffect(() => {
    if (!detail || detail.id !== sessionId) return;
    if (scrolledSessionRef.current !== sessionId) return;
    if (!nearBottomRef.current) return;
    const container = containerRef?.current;
    if (container) container.scrollTop = container.scrollHeight;
  }, [detail, sessionId]);

  // Snap when the optimistic "thinking" indicator first appears. The
  // indicator is mounted at the bottom of the messages container and is
  // not part of `detail`, so the detail-driven effect above doesn't see
  // its growth. Bypass the near-bottom gate: the user just hit Send, so
  // they expect to see the indicator regardless of prior scroll position.
  useEffect(() => {
    if (!optimisticActive) return;
    if (scrolledSessionRef.current !== sessionId) return;
    const container = containerRef?.current;
    if (!container) return;
    container.scrollTop = container.scrollHeight;
  }, [optimisticActive, sessionId]);

  // Scroll to bottom on first load of each session. Depends on a stable
  // derived flag (`hasCurrentDetail`) instead of `detail` itself so that
  // SSE refreshes and late-rendering content (syntax highlighting, images)
  // don't tear down the snap window mid-flight. The ResizeObserver catches
  // content-height growth (syntax highlighting, image decode) for the full
  // 5s window.
  const hasCurrentDetail = !!detail && detail.id === sessionId;
  useEffect(() => {
    if (!hasCurrentDetail) return;
    if (scrolledSessionRef.current === sessionId) return;
    scrolledSessionRef.current = sessionId;
    if (pendingScrollMessageId) return;

    const container = containerRef?.current;
    if (!container) return;

    let stickToBottom = true;
    let lastTop = container.scrollTop;
    const snap = () => {
      if (stickToBottom) {
        container.scrollTop = container.scrollHeight;
        // Record our own downward snap so the scroll handler below doesn't
        // mistake it for the user moving.
        lastTop = container.scrollTop;
      }
    };

    // Cancel the snap window the moment the user scrolls UP. Detect intent by
    // direction (scrollTop decreased) and via the wheel event — both are
    // immune to the race where a ResizeObserver snap fires in the same tick
    // and would otherwise reset the position before a distance check noticed.
    const onUserScroll = () => {
      if (container.scrollTop < lastTop - 1) stickToBottom = false;
      lastTop = container.scrollTop;
    };
    const onWheel = (e: WheelEvent) => {
      if (e.deltaY < 0) stickToBottom = false;
    };
    container.addEventListener("scroll", onUserScroll, { passive: true });
    container.addEventListener("wheel", onWheel, { passive: true });

    let ro: ResizeObserver | null = null;
    const inner = container.firstElementChild as HTMLElement | null;
    if (inner) {
      ro = new ResizeObserver(snap);
      ro.observe(inner);
    }

    snap();

    const timeout = setTimeout(() => {
      stickToBottom = false;
    }, SCROLL.SNAP_TIMEOUT_MS);

    return () => {
      ro?.disconnect();
      container.removeEventListener("scroll", onUserScroll);
      container.removeEventListener("wheel", onWheel);
      clearTimeout(timeout);
    };
  }, [sessionId, hasCurrentDetail, pendingScrollMessageId]);
}
