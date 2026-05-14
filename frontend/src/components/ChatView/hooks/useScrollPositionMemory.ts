import { useEffect, useRef } from "react";

// Remember each session's scroll position so re-selecting a session lands the
// user where they left off. Skip the restore if they were within ~one viewport
// of the bottom — useSnapToBottom should land them at the current bottom in
// that case (the chat may have grown since they left).
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
    return () => el.removeEventListener("scroll", onScroll);
  }, [scrollElRef, sessionId]);
}
