import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { Session } from "../../api/types";
import { api } from "../../api/client";
import { prefetch } from "../../api/sessionCache";
import { lsGetSet, lsPutSet, lsGetMap, lsPutMap } from "../../utils/localStorage";

// ---------------------------------------------------------------------------
// Date formatter (unchanged)
// ---------------------------------------------------------------------------

export function formatRelativeDate(isoString: string): string {
  const date = new Date(isoString);
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
  const startOfWeek = new Date(startOfToday.getTime() - startOfToday.getDay() * 86400000);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  if (date >= startOfToday) return "Today";
  if (date >= startOfYesterday) return "Yesterday";
  if (date >= startOfWeek) return date.toLocaleDateString("en-US", { weekday: "short" });
  if (date >= startOfYear) return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const LS_STARRED        = "clau-decode:starred";
const LS_RENAMED        = "clau-decode:renamed";
const LS_ARCHIVED       = "clau-decode:archived";
const LS_READ_SESSIONS  = "clau-decode:read-sessions";
const LS_FIRST_SEEN     = "clau-decode:first-seen";

// Captured once per page load. Sessions whose updated_at is older than this
// timestamp existed before the user opened the app — they don't deserve a bell
// just because their last message happens to be from the assistant. Bells
// should only fire for activity *new since you started looking*.
const FIRST_SEEN_MS: number = (() => {
  const stored = localStorage.getItem(LS_FIRST_SEEN);
  if (stored) return Date.parse(stored);
  const now = new Date().toISOString();
  localStorage.setItem(LS_FIRST_SEEN, now);
  return Date.parse(now);
})();

function isBellWorthy(session: { last_message_role: string | null; updated_at: string | null }): boolean {
  if (session.last_message_role !== "assistant") return false;
  if (!session.updated_at) return false;
  return Date.parse(session.updated_at) > FIRST_SEEN_MS;
}

// ---------------------------------------------------------------------------
// Icons
// ---------------------------------------------------------------------------

function IconStar({ filled }: { filled?: boolean }) {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill={filled ? "currentColor" : "none"}
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/>
    </svg>
  );
}
function IconRename() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
    </svg>
  );
}
function IconArchive() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="21 8 21 21 3 21 3 8"/>
      <rect x="1" y="3" width="22" height="5"/>
      <line x1="10" y1="12" x2="14" y2="12"/>
    </svg>
  );
}
function IconMore() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="5" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="12" cy="19" r="1"/>
    </svg>
  );
}
function IconChevronRight() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="9 18 15 12 9 6"/>
    </svg>
  );
}
function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
    </svg>
  );
}
function IconFolder() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
    </svg>
  );
}
function IconBell() {
  return (
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 0 1-3.46 0"/>
    </svg>
  );
}

// ---------------------------------------------------------------------------
// Context menu types
// ---------------------------------------------------------------------------

interface ActionItem {
  kind?: "action";
  label: string;
  icon?: React.ReactNode;
  action: () => void;
  danger?: boolean;
}
interface SubmenuItem {
  kind: "submenu";
  label: string;
  icon?: React.ReactNode;
  items: ActionItem[];
}
interface SeparatorItem {
  kind: "separator";
}
type MenuItem = ActionItem | SubmenuItem | SeparatorItem;

// ---------------------------------------------------------------------------
// ContextMenu component with submenu support
// ---------------------------------------------------------------------------

const MENU_ITEM_STYLE: React.CSSProperties = {
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

function ContextMenu({
  items,
  anchorRect,
  onClose,
}: {
  items: MenuItem[];
  anchorRect: DOMRect;
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [hoveredSubmenu, setHoveredSubmenu] = useState<number | null>(null);
  const [submenuPos, setSubmenuPos] = useState<{ top: number; left: number } | null>(null);
  const submenuTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [onClose]);

  // Position: below anchor, flush with right edge
  const top = anchorRect.bottom + 4;
  const right = window.innerWidth - anchorRect.right;

  const handleSubmenuEnter = (index: number, el: HTMLElement) => {
    if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
    const rect = el.getBoundingClientRect();
    // Try to open to the left (sidebar is on the left, so menu opens rightward,
    // but we check if there's enough room to the right first)
    const menuWidth = 180;
    const spaceRight = window.innerWidth - rect.right;
    const left = spaceRight >= menuWidth
      ? rect.right - 4
      : rect.left - menuWidth + 4;
    setSubmenuPos({ top: rect.top, left });
    setHoveredSubmenu(index);
  };

  const handleSubmenuLeave = () => {
    submenuTimerRef.current = setTimeout(() => {
      setHoveredSubmenu(null);
      setSubmenuPos(null);
    }, 120);
  };

  const handleSubmenuPanelEnter = () => {
    if (submenuTimerRef.current) clearTimeout(submenuTimerRef.current);
  };

  return (
    <div
      ref={menuRef}
      style={{
        position: "fixed",
        top,
        right,
        minWidth: "180px",
        background: "var(--bg-modal)",
        border: "1px solid var(--border-default)",
        borderRadius: "var(--radius-md)",
        boxShadow: "var(--shadow-lg)",
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
          const isOpen = hoveredSubmenu === i;
          return (
            <div key={i} style={{ position: "relative" }}>
              <button
                onMouseEnter={(e) => handleSubmenuEnter(i, e.currentTarget)}
                onMouseLeave={handleSubmenuLeave}
                style={{
                  ...MENU_ITEM_STYLE,
                  color: "var(--text-primary)",
                  background: isOpen ? "var(--bg-sidebar-hover)" : "none",
                }}
              >
                {item.icon && (
                  <span style={{ flexShrink: 0, color: "var(--text-tertiary)", display: "flex" }}>
                    {item.icon}
                  </span>
                )}
                <span style={{ flex: 1 }}>{item.label}</span>
                <span style={{ color: "var(--text-tertiary)", display: "flex" }}>
                  <IconChevronRight />
                </span>
              </button>

              {isOpen && submenuPos && (
                <div
                  onMouseEnter={handleSubmenuPanelEnter}
                  onMouseLeave={handleSubmenuLeave}
                  style={{
                    position: "fixed",
                    top: submenuPos.top,
                    left: submenuPos.left,
                    minWidth: "180px",
                    background: "var(--bg-modal)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    boxShadow: "var(--shadow-lg)",
                    padding: "4px",
                    zIndex: 1001,
                  }}
                >
                  {item.items.map((sub, j) => (
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
                  ))}
                </div>
              )}
            </div>
          );
        }

        // ActionItem
        return (
          <button
            key={i}
            onClick={() => { item.action(); onClose(); }}
            style={{
              ...MENU_ITEM_STYLE,
              color: item.danger ? "var(--tool-error-text)" : "var(--text-primary)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "none";
            }}
          >
            {item.icon && (
              <span
                style={{
                  flexShrink: 0,
                  color: item.danger ? "var(--tool-error-text)" : "var(--text-tertiary)",
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
  );
}

// ---------------------------------------------------------------------------
// Rename inline input
// ---------------------------------------------------------------------------

function RenameInput({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
      onBlur={() => { if (value.trim() && value.trim() !== initialValue) commit(); else onCancel(); }}
      onClick={(e) => e.stopPropagation()}
      style={{
        flex: 1,
        border: "1px solid var(--border-accent)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-input)",
        color: "var(--text-primary)",
        fontSize: "14px",
        fontFamily: "var(--font-ui)",
        padding: "1px 6px",
        outline: "none",
        minWidth: 0,
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// SessionItem
// ---------------------------------------------------------------------------

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onClick: () => void;
  /** When true, clicking does not clear the bell — used when selecting for analytics without viewing chat. */
  suppressBell?: boolean;
}

export function SessionItem({ session, isActive, onClick, suppressBell = false }: SessionItemProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const [isStarred, setIsStarred] = useState(() => lsGetSet(LS_STARRED).has(session.id));
  const [isArchived, setIsArchived] = useState(() => lsGetSet(LS_ARCHIVED).has(session.id));
  const [customTitle, setCustomTitle] = useState<string | null>(
    () => lsGetMap(LS_RENAMED)[session.id] ?? null
  );

  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const displayTitle = customTitle ?? session.title ?? "Untitled";

  // Bell — shown when Claude's last message is awaiting a human reply, AND
  // the activity is new since the user opened the app, AND they haven't viewed
  // it. Read state is keyed by sessionId:updatedAt so a fresh assistant message
  // re-rings the bell.
  const bellKey = useMemo(
    () => `${session.id}:${session.updated_at ?? ""}`,
    [session.id, session.updated_at]
  );
  const [bellState, setBellState] = useState<"visible" | "fading" | "hidden">(() => {
    if (!isBellWorthy(session)) return "hidden";
    return lsGetSet(LS_READ_SESSIONS).has(`${session.id}:${session.updated_at ?? ""}`)
      ? "hidden"
      : "visible";
  });

  useEffect(() => {
    if (!isBellWorthy(session)) {
      setBellState("hidden");
      return;
    }
    if (!lsGetSet(LS_READ_SESSIONS).has(bellKey)) {
      setBellState("visible");
    }
  }, [session, bellKey]);

  // After fade-out completes, remove from DOM. (LocalStorage was already
  // written in handleClick — we don't rely on this timeout for persistence.)
  useEffect(() => {
    if (bellState !== "fading") return;
    const t = setTimeout(() => setBellState("hidden"), 450);
    return () => clearTimeout(t);
  }, [bellState]);

  // Dismiss bell when the browser window regains focus while this session is active.
  useEffect(() => {
    if (!isActive) return;
    const onFocus = () => {
      setBellState((prev) => {
        if (prev !== "visible") return prev;
        const s = lsGetSet(LS_READ_SESSIONS);
        s.add(bellKey);
        lsPutSet(LS_READ_SESSIONS, s);
        return "fading";
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isActive, bellKey]);

  const toggleStar = useCallback(() => {
    const s = lsGetSet(LS_STARRED);
    if (s.has(session.id)) s.delete(session.id);
    else s.add(session.id);
    lsPutSet(LS_STARRED, s);
    setIsStarred(s.has(session.id));
    window.dispatchEvent(new CustomEvent("clau-decode:star"));
  }, [session.id]);

  const startRename = useCallback(() => {
    setIsRenaming(true);
  }, []);

  const commitRename = useCallback((value: string) => {
    const m = lsGetMap(LS_RENAMED);
    m[session.id] = value;
    lsPutMap(LS_RENAMED, m);
    setCustomTitle(value);
    setIsRenaming(false);
  }, [session.id]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
  }, []);

  const toggleArchive = useCallback(() => {
    const s = lsGetSet(LS_ARCHIVED);
    if (s.has(session.id)) s.delete(session.id);
    else s.add(session.id);
    lsPutSet(LS_ARCHIVED, s);
    setIsArchived(s.has(session.id));
    window.dispatchEvent(new CustomEvent("clau-decode:archive", { detail: session.id }));
  }, [session.id]);

  const menuItems: MenuItem[] = [
    {
      label: isStarred ? "Unstar" : "Star",
      icon: <IconStar filled={isStarred} />,
      action: toggleStar,
    },
    {
      label: "Rename",
      icon: <IconRename />,
      action: startRename,
    },
    {
      label: isArchived ? "Unarchive" : "Archive",
      icon: <IconArchive />,
      action: toggleArchive,
    },
    { kind: "separator" },
    {
      kind: "submenu",
      label: "More",
      icon: <IconMore />,
      items: [
        {
          label: "Copy title",
          icon: <IconCopy />,
          action: () => navigator.clipboard.writeText(displayTitle).catch(() => {}),
        },
        {
          label: "Copy file path",
          icon: <IconCopy />,
          action: () => navigator.clipboard.writeText(session.file_path).catch(() => {}),
        },
        {
          label: "Copy session ID",
          icon: <IconCopy />,
          action: () => navigator.clipboard.writeText(session.id).catch(() => {}),
        },
        {
          label: "Reveal in Finder",
          icon: <IconFolder />,
          action: () => api.revealSession(session.id).catch(() => {}),
        },
      ],
    },
  ];

  const openMenu = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (menuBtnRef.current) {
      setMenuAnchor(menuBtnRef.current.getBoundingClientRect());
      setMenuOpen(true);
    }
  };

  const handleClick = () => {
    if (!suppressBell && bellState === "visible") {
      // Persist immediately — don't rely on the fade timeout, which can be
      // cancelled if the component unmounts (e.g. user collapses sidebar).
      const s = lsGetSet(LS_READ_SESSIONS);
      s.add(bellKey);
      lsPutSet(LS_READ_SESSIONS, s);
      setBellState("fading");
    }
    onClick();
  };

  return (
    <>
      <div
        role="button"
        tabIndex={0}
        onClick={isRenaming ? undefined : handleClick}
        onKeyDown={(e) => { if (!isRenaming && (e.key === "Enter" || e.key === " ")) handleClick(); }}
        onMouseEnter={() => { setHovered(true); prefetch(session.id, api.getSession); }}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          padding: "5px 8px 5px 12px",
          cursor: isRenaming ? "default" : "pointer",
          background: isActive
            ? "var(--bg-sidebar-active)"
            : hovered
            ? "var(--bg-sidebar-hover)"
            : "transparent",
          borderRadius: "var(--radius-sm)",
          margin: "1px 6px",
          transition: "background var(--transition-fast)",
          userSelect: "none",
          minHeight: "30px",
          outline: "none",
          gap: "4px",
        }}
      >
        {/* Star indicator */}
        {isStarred && !isRenaming && (
          <span style={{ color: "var(--accent-orange)", flexShrink: 0, fontSize: "11px", display: "flex" }}>
            <IconStar filled />
          </span>
        )}

        {isRenaming ? (
          <RenameInput
            initialValue={displayTitle}
            onCommit={commitRename}
            onCancel={cancelRename}
          />
        ) : (
          <span
            data-testid="session-title"
            style={{
              flex: 1,
              fontSize: "14px",
              color: "var(--text-primary)",
              fontWeight: isActive ? 500 : 400,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              lineHeight: "1.35",
            }}
          >
            {displayTitle}
          </span>
        )}

        {bellState !== "hidden" && !isRenaming && (
          <span
            aria-label="Awaiting your reply"
            style={{
              flexShrink: 0,
              display: "flex",
              color: "var(--accent-orange)",
              opacity: bellState === "fading" ? 0 : 1,
              transition: "opacity 450ms ease",
            }}
          >
            <IconBell />
          </span>
        )}

        {(hovered || isActive || menuOpen) && !isRenaming && (
          <button
            ref={menuBtnRef}
            onClick={openMenu}
            style={{
              flexShrink: 0,
              marginLeft: "4px",
              color: menuOpen ? "var(--text-primary)" : "var(--text-tertiary)",
              fontSize: "14px",
              lineHeight: 1,
              padding: "2px 5px",
              borderRadius: "var(--radius-sm)",
              letterSpacing: "1px",
              background: menuOpen ? "var(--bg-sidebar-hover)" : "none",
              border: "none",
              cursor: "pointer",
              outline: "none",
              fontFamily: "var(--font-ui)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              if (!menuOpen) {
                (e.currentTarget as HTMLButtonElement).style.background = "none";
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
              }
            }}
            aria-label="Session options"
          >
            •••
          </button>
        )}
      </div>

      {menuOpen && menuAnchor && (
        <ContextMenu
          items={menuItems}
          anchorRect={menuAnchor}
          onClose={() => setMenuOpen(false)}
        />
      )}
    </>
  );
}
