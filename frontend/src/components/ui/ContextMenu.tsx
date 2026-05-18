import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { IconChevronRight } from "./icons";

// ---------------------------------------------------------------------------
// Context menu types
// ---------------------------------------------------------------------------

export interface ActionItem {
  kind?: "action";
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  danger?: boolean;
  disabled?: boolean;
}
export interface SubmenuItem {
  kind: "submenu";
  label: string;
  icon?: React.ReactNode;
  items: (ActionItem | SeparatorItem)[];
}
export interface SeparatorItem {
  kind: "separator";
}
export type MenuItem = ActionItem | SubmenuItem | SeparatorItem;

// ---------------------------------------------------------------------------
// ContextMenu component with submenu support
// ---------------------------------------------------------------------------

export const MENU_ITEM_STYLE: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "9px",
  width: "100%",
  padding: "7px 10px",
  background: "none",
  border: "none",
  borderRadius: "var(--radius-sm)",
  cursor: "pointer",
  textAlign: "left",
  fontSize: "13px",
  fontFamily: "var(--font-ui)",
  whiteSpace: "nowrap",
};

const MENU_MIN_WIDTH = 210;

export function ContextMenu({
  items,
  anchorRect,
  onClose,
}: {
  items: MenuItem[];
  anchorRect: DOMRect;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);
  const [expandedSubmenu, setExpandedSubmenu] = useState<number | null>(null);
  const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number } | null>(null);
  const [moreRect, setMoreRect] = useState<DOMRect | null>(null);

  // Flip menu upward when anchor is near the bottom of the viewport
  const flipUp = anchorRect.bottom + 4 + 180 > window.innerHeight;
  // Flip left+up when the menu would bleed past the left edge of the viewport
  const flipLeft = anchorRect.right < MENU_MIN_WIDTH;

  // Compute submenu position with viewport collision handling
  useLayoutEffect(() => {
    if (expandedSubmenu === null || !submenuRef.current || !menuRef.current || !moreRect) {
      setSubmenuPos(null);
      return;
    }
    const subRect = submenuRef.current.getBoundingClientRect();
    const menuRect = menuRef.current.getBoundingClientRect();
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const pad = 8;

    let top = moreRect.top;
    let left = moreRect.right - 4;

    // Vertical: keep within viewport
    if (top + subRect.height > vh - pad) top = vh - pad - subRect.height;
    if (top < pad) top = pad;

    // Horizontal: keep within viewport
    if (left + subRect.width > vw - pad) left = vw - pad - subRect.width;
    if (left < pad) left = pad;

    // Ensure at least 30% of main menu is visible behind submenu
    const menuW = menuRect.right - menuRect.left;
    if (left < menuRect.right && left - menuRect.left < menuW * 0.3) {
      left = menuRect.left + menuW * 0.3;
    }

    // Final viewport clamp after reveal adjustment
    if (left + subRect.width > vw - pad) left = vw - pad - subRect.width;
    if (left < pad) left = pad;

    setSubmenuPos({ top, left });
  }, [expandedSubmenu, moreRect]);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target as Node;
      const inMenu = menuRef.current?.contains(target);
      const inSub = submenuRef.current?.contains(target);
      if (!inMenu && !inSub) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  const right = window.innerWidth - anchorRect.right;

  const handleSubmenuEnter = (index: number) => {
    if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
    submenuTimerRef.current = setTimeout(() => {
      if (moreRef.current) setMoreRect(moreRef.current.getBoundingClientRect());
      setExpandedSubmenu(index);
    }, 100);
  };

  const handleSubmenuLeave = () => {
    submenuTimerRef.current = setTimeout(() => {
      setExpandedSubmenu(null);
    }, 500);
  };

  // Extract the expanded submenu item data
  const submenuItem = expandedSubmenu !== null && items[expandedSubmenu]?.kind === "submenu"
    ? (items[expandedSubmenu] as SubmenuItem)
    : null;

  // Use measured position if available, else fall back to trigger-based estimate
  const effectiveSubmenuPos = submenuPos ?? (moreRect ? { top: moreRect.top, left: moreRect.right - 4 } : null);

  return createPortal(
    <>
      {/* Main menu */}
      <div
        ref={menuRef}
        style={{
          position: "fixed",
          ...(flipUp || flipLeft
            ? { bottom: window.innerHeight - anchorRect.top + 4 }
            : { top: anchorRect.bottom + 4 }),
          ...(flipLeft
            ? { left: anchorRect.left }
            : { right }),
          minWidth: `${MENU_MIN_WIDTH}px`,
          background: "var(--bg-modal)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-md)",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          padding: "4px",
          zIndex: 1000,
          fontFamily: "var(--font-ui)",
        }}
      >
        {items.map((item, i) => {
          if (item.kind === "separator") {
            return (
              <div
                key={i}
                style={{ height: "1px", background: "var(--border-subtle)", margin: "4px 0" }}
              />
            );
          }

          if (item.kind === "submenu") {
            const isOpen = expandedSubmenu === i;
            return (
              <div
                key={i}
                ref={moreRef}
                onMouseEnter={() => handleSubmenuEnter(i)}
                onMouseLeave={handleSubmenuLeave}
              >
                <button
                  style={{
                    ...MENU_ITEM_STYLE,
                    color: "var(--text-primary)",
                    background: isOpen ? "var(--bg-sidebar-hover)" : "none",
                  }}
                >
                  <span style={{ flex: 1 }}>{item.label}</span>
                  <span style={{
                    color: "var(--text-tertiary)",
                    display: "flex",
                    transition: "transform 150ms ease",
                    transform: isOpen ? "rotate(90deg)" : "rotate(0deg)",
                  }}>
                    <IconChevronRight />
                  </span>
                </button>
              </div>
            );
          }

          // ActionItem
          return (
            <button
              key={i}
              onClick={() => { if (!item.disabled) { item.action(); onClose(); } }}
              disabled={item.disabled}
              style={{
                ...MENU_ITEM_STYLE,
                color: item.disabled
                  ? "var(--text-tertiary)"
                  : item.danger ? "var(--tool-error-text)" : "var(--text-primary)",
                cursor: item.disabled ? "default" : "pointer",
                opacity: item.disabled ? 0.5 : 1,
              }}
              onMouseEnter={(e) => {
                if (!item.disabled) (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.background = "none";
              }}
            >
              {item.icon && (
                <span
                  style={{
                    flexShrink: 0,
                    color: item.disabled
                      ? "var(--text-tertiary)"
                      : item.danger ? "var(--tool-error-text)" : "var(--text-tertiary)",
                    display: "flex",
                  }}
                >
                  {item.icon}
                </span>
              )}
              {item.label}
            </button>
          );
        })}
      </div>

      {/* Submenu — separate fixed element to avoid hover/layering issues */}
      {submenuItem && effectiveSubmenuPos && (
        <div
          ref={submenuRef}
          style={{
            position: "fixed",
            top: effectiveSubmenuPos.top,
            left: effectiveSubmenuPos.left,
            minWidth: `${MENU_MIN_WIDTH}px`,
            background: "var(--bg-modal)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
            padding: "4px",
            zIndex: 1001,
            fontFamily: "var(--font-ui)",
          }}
          onMouseEnter={() => { if (expandedSubmenu !== null) handleSubmenuEnter(expandedSubmenu); }}
          onMouseLeave={handleSubmenuLeave}
        >
          {submenuItem.items.map((sub, j) => {
            if (sub.kind === "separator") {
              return (
                <div
                  key={j}
                  style={{ height: "1px", background: "var(--border-subtle)", margin: "4px 0" }}
                />
              );
            }
            return (
              <button
                key={j}
                onClick={() => { sub.action(); onClose(); }}
                style={{
                  ...MENU_ITEM_STYLE,
                  color: sub.danger ? "var(--tool-error-text)" : "var(--text-primary)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "none";
                }}
              >
                {sub.icon && (
                  <span style={{ flexShrink: 0, color: "var(--text-tertiary)", display: "flex" }}>
                    {sub.icon}
                  </span>
                )}
                {sub.label}
              </button>
            );
          })}
        </div>
      )}
    </>,
    document.body
  );
}
