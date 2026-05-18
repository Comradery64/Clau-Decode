import { useEffect, useRef } from "react";

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
): void {
  const scrollPositions = useRef(new Map<string, { top: number; height: number }>());

  useEffect(() => {
    const el = scrollElRef.current;
    if (!el || !sessionId) return;

    const saved = scrollPositions.current.get(sessionId);
    if (saved) {
      const distFromBottom = saved.height - saved.top - el.clientHeight;
      if (distFromBottom >= el.clientHeight) {
        el.scrollTop = saved.top;
      }
    }

    const onScroll = () => {
      scrollPositions.current.set(sessionId, {
        top: el.scrollTop,
        height: el.scrollHeight,
      });
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    // Container resize → restore last saved position. rAF-coalesce so a burst
    // of resize callbacks during a sidebar/FileViewer transition only restores
    // once at the end. Same near-bottom skip as the session-switch restore.
    let pendingRaf = 0;
    const restorePinned = () => {
      pendingRaf = 0;
      const last = scrollPositions.current.get(sessionId);
      if (!last) return;
      const distFromBottom = last.height - last.top - el.clientHeight;
      if (distFromBottom < el.clientHeight) return;
      if (Math.abs(el.scrollTop - last.top) > 1) {
        el.scrollTop = last.top;
      }
    };
    const ro = new ResizeObserver(() => {
      if (pendingRaf) return;
      pendingRaf = requestAnimationFrame(restorePinned);
    });
    ro.observe(el);

    return () => {
      el.removeEventListener("scroll", onScroll);
      if (pendingRaf) cancelAnimationFrame(pendingRaf);
      ro.disconnect();
    };
  }, [scrollElRef, sessionId]);
}
