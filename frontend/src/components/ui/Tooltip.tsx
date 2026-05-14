import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

const SHOW_DELAY_MS = 200;
const HIDE_DELAY_MS = 80;

/**
 * Lightweight hover tooltip — instant feel (200ms show) instead of the
 * browser's ~700ms native title delay, and styled to match the app.
 *
 * Renders the trigger inline. On hover, an absolutely-positioned popover
 * is portaled to document.body and positioned above the trigger (or below
 * if there isn't room above). Hides on mouse leave with a brief grace
 * period so the user can move the cursor onto the popover for selection
 * without it disappearing.
 *
 * Falls back to a native `title` attribute on the trigger when
 * `label` is a string, so users without pointers (screen readers,
 * keyboard navigation) still get the information.
 */
export function Tooltip({
  label,
  children,
}: {
  label: ReactNode;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [coords, setCoords] = useState<{ left: number; top: number; placement: "above" | "below" } | null>(null);
  const triggerRef = useRef<HTMLSpanElement>(null);
  const showTimer = useRef<number | null>(null);
  const hideTimer = useRef<number | null>(null);

  const clearTimers = () => {
    if (showTimer.current !== null) {
      window.clearTimeout(showTimer.current);
      showTimer.current = null;
    }
    if (hideTimer.current !== null) {
      window.clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
  };

  useEffect(() => () => clearTimers(), []);

  const computeCoords = () => {
    const t = triggerRef.current;
    if (!t) return null;
    const r = t.getBoundingClientRect();
    const TOOLTIP_GAP = 6;
    // Default above the trigger; if not enough room, flip below.
    const placement: "above" | "below" = r.top > 80 ? "above" : "below";
    const top = placement === "above" ? r.top - TOOLTIP_GAP : r.bottom + TOOLTIP_GAP;
    const left = r.left + r.width / 2;
    return { left, top, placement };
  };

  const onEnter = () => {
    clearTimers();
    showTimer.current = window.setTimeout(() => {
      setCoords(computeCoords());
      setOpen(true);
    }, SHOW_DELAY_MS);
  };

  const onLeave = () => {
    clearTimers();
    hideTimer.current = window.setTimeout(() => {
      setOpen(false);
      setCoords(null);
    }, HIDE_DELAY_MS);
  };

  const nativeTitle = typeof label === "string" ? label : undefined;

  return (
    <>
      <span
        ref={triggerRef}
        onMouseEnter={onEnter}
        onMouseLeave={onLeave}
        onFocus={onEnter}
        onBlur={onLeave}
        title={nativeTitle}
        style={{ display: "inline-flex", alignItems: "center" }}
      >
        {children}
      </span>
      {open && coords && createPortal(
        <div
          role="tooltip"
          onMouseEnter={() => clearTimers()}
          onMouseLeave={onLeave}
          style={{
            position: "fixed",
            left: coords.left,
            top: coords.top,
            transform: coords.placement === "above" ? "translate(-50%, -100%)" : "translate(-50%, 0)",
            background: "var(--bg-modal)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            boxShadow: "var(--shadow-md)",
            padding: "5px 9px",
            fontSize: "12px",
            fontFamily: "var(--font-ui)",
            lineHeight: 1.4,
            maxWidth: "320px",
            wordBreak: "break-word",
            zIndex: 1000,
            pointerEvents: "auto",
          }}
        >
          {label}
        </div>,
        document.body,
      )}
    </>
  );
}
