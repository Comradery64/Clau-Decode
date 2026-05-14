import { useRef, useLayoutEffect } from "react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { PartialOptions } from "overlayscrollbars";

export const SCROLLBAR_OPTIONS: PartialOptions = {
  scrollbars: {
    // "leave" → visible while pointer is over the viewport AND while scrolling;
    // hides on pointer-leave + autoHideDelay. Combined with autoHideSuspend:false
    // so the scrollbar starts hidden on mount instead of waiting for a first
    // scroll to activate auto-hiding.
    autoHide: "leave",
    autoHideDelay: 800,
    autoHideSuspend: false,
    dragScroll: true,
    clickScroll: true,
    pointers: ["mouse", "touch", "pen"],
  },
  overflow: { x: "hidden", y: "scroll" },
  paddingAbsolute: true,
};

export const SCROLLBAR_OPTIONS_BOTH: PartialOptions = {
  ...SCROLLBAR_OPTIONS,
  overflow: { x: "scroll", y: "scroll" },
};

/** Horizontal-only scrolling for code blocks, tables, and similar.
 *  Module-level constant so prop reference is stable across re-renders —
 *  inline option objects cause OverlayScrollbars to detect "changed options"
 *  and re-initialize the instance on every parent render. */
export const SCROLLBAR_OPTIONS_X: PartialOptions = {
  ...SCROLLBAR_OPTIONS,
  overflow: { x: "scroll", y: "hidden" },
};

/**
 * Scroll container using OverlayScrollbars. Uses the library's
 * OverlayScrollbarsComponent (not the hook) so the DOM lifecycle
 * is managed correctly — React children go into a content div
 * that OverlayScrollbars owns, preventing removeChild crashes.
 */
export function ScrollContainer({ children, style, className }: {
  children: React.ReactNode;
  style?: React.CSSProperties;
  className?: string;
}) {
  return (
    <OverlayScrollbarsComponent
      options={SCROLLBAR_OPTIONS}
      style={style}
      className={className}
    >
      {children}
    </OverlayScrollbarsComponent>
  );
}

/**
 * Returns a stable ref-like object whose `.current` points to the
 * OverlayScrollbars viewport (the actual scrolling element).
 */
export function useScrollableViewport(hostRef: React.RefObject<HTMLDivElement | null>) {
  const scrollEl = useRef<HTMLElement | null>(null);

  useLayoutEffect(() => {
    const el = hostRef.current;
    if (!el) return;
    // If OverlayScrollbars already initialized this element, get its viewport
    const osInstance = (window as any).OverlayScrollbars?.osInstance?.(el);
    if (osInstance) {
      scrollEl.current = osInstance.elements().viewport;
      return;
    }
    // Fallback: the host element itself is the scrollable element
    scrollEl.current = el;
  }, [hostRef]);

  return scrollEl;
}
