import { useEffect } from "react";
import type { SessionDetail } from "../../../api/types";
import { SCROLL } from "../../../config/ui";

type ScrollRef = { readonly current: HTMLElement | null };

export function useSearchScroll(
  containerRef: ScrollRef | null,
  detail: SessionDetail | null,
  sessionId: string,
  msgToAnchorRef: React.RefObject<Map<string, string>>,
  pendingScrollMessageId: string | null,
  setPendingScrollMessageId: (id: null) => void,
) {
  useEffect(() => {
    if (!pendingScrollMessageId || !detail || detail.id !== sessionId) return;
    const anchorId = msgToAnchorRef.current?.get(pendingScrollMessageId) ?? pendingScrollMessageId;
    const el = document.querySelector(`[data-message-id="${anchorId}"]`) as HTMLElement | null;
    if (!el) return;
    setPendingScrollMessageId(null);
    const container = containerRef?.current;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const elRect = el.getBoundingClientRect();
      const top = container.scrollTop + elRect.top - containerRect.top - SCROLL.NEAR_BOTTOM_PX;
      container.scrollTo({ top: top < 0 ? 0 : top, behavior: "smooth" });
    }
    el.setAttribute("data-highlight", "1");
    const t = setTimeout(() => el.removeAttribute("data-highlight"), SCROLL.SEARCH_HIGHLIGHT_MS);
    return () => clearTimeout(t);
  }, [detail, sessionId, pendingScrollMessageId, setPendingScrollMessageId]);
}
