import { useEffect } from "react";
import { subscribeBlocksExpanded } from "../../../store/blocksState";

// Preserve the viewport-relative position of whatever element sits at the top
// of the visible scroll area when expand-all toggles. Without this, expanding
// inserts content above the user's gaze and the message they were reading
// jumps off-screen.
//
// The Cmd/Ctrl+O keybinding itself lives in App.tsx's central keymap — this
// hook only handles the scroll-preserve layout side-effect, triggered by any
// caller of `toggleBlocksExpanded()`.
export function useExpandPreserveAnchor(
  scrollElRef: React.RefObject<HTMLElement | null>,
): void {
  useEffect(() => {
    return subscribeBlocksExpanded(() => {
      const container = scrollElRef.current;
      if (!container) return;

      // Snapshot an anchor element at the top of the visible area so we
      // can restore its position after the expansion changes layout.
      const r = container.getBoundingClientRect();
      const anchor = document.elementFromPoint(r.left + r.width / 2, r.top + 4);
      if (!anchor) return;

      // Desired distance of anchor from the container's top edge (viewport-relative).
      // We restore this after expand/collapse regardless of snap-to-bottom interference.
      const anchorTargetOffset =
        anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;

      // Correct scroll after React's async render commits. We compute
      // anchorContentOffset (invariant to scrollTop) inside the callback so
      // the result is correct even if MessageList's snap-to-bottom ResizeObserver
      // already ran and changed scrollTop before ours fires.
      const inner = container.firstElementChild;
      if (!inner) return;
      const ro = new ResizeObserver(() => {
        ro.disconnect();
        const anchorContentOffset =
          anchor.getBoundingClientRect().top -
          container.getBoundingClientRect().top +
          container.scrollTop;
        container.scrollTop = anchorContentOffset - anchorTargetOffset;
      });
      ro.observe(inner);
    });
  }, [scrollElRef]);
}
