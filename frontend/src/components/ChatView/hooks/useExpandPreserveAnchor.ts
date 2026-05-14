import { useEffect } from "react";
import { toggleBlocksExpanded } from "../../../store/blocksState";

// Cmd/Ctrl+O — expand/collapse all tool + thinking blocks while preserving the
// viewport-relative position of whatever element sits at the top of the visible
// scroll area. Without this, expanding inserts content above the user's gaze
// and the message they were reading jumps off-screen.
export function useExpandPreserveAnchor(
  scrollElRef: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || e.key.toLowerCase() !== "o") return;
      e.preventDefault();
      const container = scrollElRef.current;

      // Snapshot an anchor element at the top of the visible area so we
      // can restore its position after the expansion changes layout.
      const anchor = (() => {
        if (!container) return null;
        const r = container.getBoundingClientRect();
        return document.elementFromPoint(r.left + r.width / 2, r.top + 4);
      })();

      // Desired distance of anchor from the container's top edge (viewport-relative).
      // We restore this after expand/collapse regardless of snap-to-bottom interference.
      const anchorTargetOffset = (() => {
        if (!anchor || !container) return 0;
        return anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;
      })();

      // Correct scroll after React's async render commits. We compute
      // anchorContentOffset (invariant to scrollTop) inside the callback so
      // the result is correct even if MessageList's snap-to-bottom ResizeObserver
      // already ran and changed scrollTop before ours fires.
      const inner = container?.firstElementChild;
      if (inner && anchor && container) {
        const ro = new ResizeObserver(() => {
          ro.disconnect();
          const anchorContentOffset =
            anchor.getBoundingClientRect().top -
            container.getBoundingClientRect().top +
            container.scrollTop;
          container.scrollTop = anchorContentOffset - anchorTargetOffset;
        });
        ro.observe(inner);
      }

      toggleBlocksExpanded();
    };
    document.addEventListener("keydown", onKeyDown, { capture: true });
    return () => document.removeEventListener("keydown", onKeyDown, { capture: true });
  }, [scrollElRef]);
}
