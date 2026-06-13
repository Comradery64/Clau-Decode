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

  // Track whether the user is reading history (scrolled up) vs at the bottom
  useEffect(() => {
    const container = containerRef?.current;
    if (!container) return;
    const onScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      nearBottomRef.current = dist < SCROLL.NEAR_BOTTOM_PX;
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [sessionId]);

  // Streaming auto-scroll: snap to bottom on detail updates
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
    const snap = () => {
      if (stickToBottom) container.scrollTop = container.scrollHeight;
    };

    const onUserScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (dist > SCROLL.SNAP_THRESHOLD_PX) stickToBottom = false;
    };
    container.addEventListener("scroll", onUserScroll, { passive: true });

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
      clearTimeout(timeout);
    };
  }, [sessionId, hasCurrentDetail, pendingScrollMessageId]);
}
