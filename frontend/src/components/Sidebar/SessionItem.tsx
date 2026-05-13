import { useState, useRef, useEffect, useCallback } from "react";
import type { Session } from "../../api/types";
import { api } from "../../api/client";
import { prefetch } from "../../api/sessionCache";
import { lsGetMap, lsPutMap, LS } from "../../utils/localStorage";
import { emit } from "../../utils/events";
import { useLsSet } from "../../utils/useLsSet";
import { formatRelativeBucket } from "../../utils/formatRelative";
import { IconStar, IconRename, IconArchive, IconCopy, IconTerminal, IconFolder, IconBell } from "../ui/icons";
import { ContextMenu, type MenuItem } from "../ui/ContextMenu";
import { RenameInput } from "../ui/RenameInput";

// Re-export of the shared bucketed relative-date formatter so SearchOverlay's
// existing `formatRelativeDate` import keeps working without churn.
export const formatRelativeDate = formatRelativeBucket;

// One-time migration from old read-sessions set to new viewed-at map.
// The old format stored "sessionId:updatedAt" strings; we extract the latest
// updatedAt per session so bells stay correctly dismissed after the upgrade.
{
  const raw = localStorage.getItem(LS.READ_SESSIONS_LEGACY);
  if (raw && !localStorage.getItem(LS.VIEWED_AT)) {
    try {
      const entries: string[] = JSON.parse(raw);
      const map: Record<string, string> = {};
      for (const e of entries) {
        const colon = e.lastIndexOf(":");
        if (colon < 0) continue;
        const sid = e.slice(0, colon);
        const ts = e.slice(colon + 1);
        // Keep the most recent updatedAt per session
        if (!map[sid] || ts > map[sid]) map[sid] = ts;
      }
      localStorage.setItem(LS.VIEWED_AT, JSON.stringify(map));
    } catch { /* ignore */ }
  }
}

function isBellWorthy(session: { last_message_role: string | null; updated_at: string | null }): boolean {
  return session.last_message_role === "assistant" && !!session.updated_at;
}

/** Mark a session as viewed at its current updated_at. */
function markViewed(sessionId: string, updatedAt: string | null) {
  if (!updatedAt) return;
  const m = lsGetMap(LS.VIEWED_AT);
  m[sessionId] = updatedAt;
  lsPutMap(LS.VIEWED_AT, m);
}

/** Returns true if the session's current updated_at is newer than the last time the user viewed it. */
function hasUnreadUpdate(sessionId: string, updatedAt: string | null): boolean {
  if (!updatedAt) return false;
  const m = lsGetMap(LS.VIEWED_AT);
  const lastViewed = m[sessionId];
  if (!lastViewed) return true; // never viewed
  return updatedAt > lastViewed; // ISO string comparison works for same-format dates
}

// ---------------------------------------------------------------------------
// SessionItem
// ---------------------------------------------------------------------------

interface SessionItemProps {
  session: Session;
  isActive: boolean;
  onClick: () => void;
}

export function SessionItem({ session, isActive, onClick }: SessionItemProps) {
  const [hovered, setHovered] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuAnchor, setMenuAnchor] = useState<DOMRect | null>(null);
  const [isRenaming, setIsRenaming] = useState(false);
  const starred = useLsSet(LS.STARRED, "star");
  const archived = useLsSet(LS.ARCHIVED, "archive");
  const isStarred = starred.has(session.id);
  const isArchived = archived.has(session.id);
  const [customTitle, setCustomTitle] = useState<string | null>(
    () => lsGetMap(LS.RENAMED)[session.id] ?? null
  );

  const menuBtnRef = useRef<HTMLButtonElement>(null);
  const displayTitle = customTitle ?? session.title ?? "Untitled";

  // Bell — shown when the assistant's last message is awaiting a human reply AND the
  // session has been updated since the user last viewed it. Read state is a map
  // of sessionId → lastViewedAt (ISO), so bells survive rescans.
  const [bellState, setBellState] = useState<"visible" | "fading" | "hidden">(() => {
    if (!isBellWorthy(session)) return "hidden";
    return hasUnreadUpdate(session.id, session.updated_at) ? "visible" : "hidden";
  });

  useEffect(() => {
    if (!isBellWorthy(session)) {
      setBellState("hidden");
      return;
    }
    if (hasUnreadUpdate(session.id, session.updated_at)) {
      setBellState("visible");
    }
  }, [session.id, session.updated_at, session.last_message_role]);

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
        markViewed(session.id, session.updated_at);
        return "fading";
      });
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [isActive, session.id, session.updated_at]);

  const startRename = useCallback(() => {
    setIsRenaming(true);
  }, []);

  const commitRename = useCallback((value: string) => {
    const m = lsGetMap(LS.RENAMED);
    m[session.id] = value;
    lsPutMap(LS.RENAMED, m);
    setCustomTitle(value);
    setIsRenaming(false);
    emit("rename", { id: session.id, title: value });
  }, [session.id]);

  const cancelRename = useCallback(() => {
    setIsRenaming(false);
  }, []);

  const menuItems: MenuItem[] = [
    {
      label: isStarred ? "Unstar" : "Star",
      icon: <IconStar filled={isStarred} />,
      action: () => starred.toggle(session.id),
    },
    {
      label: "Rename",
      icon: <IconRename />,
      action: startRename,
    },
    {
      label: isArchived ? "Unarchive" : "Archive",
      icon: <IconArchive />,
      action: () => archived.toggle(session.id),
    },
    { kind: "separator" },
    {
      kind: "submenu",
      label: "More",
      items: [
        {
          label: "Copy title",
          icon: <IconCopy />,
          action: () => navigator.clipboard.writeText(displayTitle).catch(() => {}),
        },
        {
          label: "Copy project path",
          icon: <IconFolder />,
          action: () => navigator.clipboard.writeText(session.cwd ?? "").catch(() => {}),
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
          label: "Copy resume command",
          icon: <IconTerminal />,
          action: () => {
            const parts = session.file_path.split("/");
            let bin = "claude";
            const idx = parts.indexOf("projects");
            if (idx > 0) {
              let j = idx - 1;
              while (j >= 0 && parts[j] === "config") j--;
              if (j >= 0) bin = parts[j].replace(/^\./, "");
            }
            navigator.clipboard.writeText(`${bin} -r ${session.id}`).catch(() => {});
          },
        },
        { kind: "separator" as const },
        {
          label: "Reveal in Finder",
          icon: <IconFolder />,
          action: () => api.revealSession(session.id).catch(() => {}),
        },
        {
          label: session.is_fork ? "Open in terminal (fork — not resumable)" : "Open in terminal",
          icon: <IconTerminal />,
          action: session.is_fork
            ? () => {}
            : () => api.openTerminal(session.id).catch(() => {}),
          disabled: session.is_fork,
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
    if (bellState === "visible") {
      markViewed(session.id, session.updated_at);
      setBellState("fading");
    }
    onClick();
  };

  return (
    <>
      <div
        className="hover-actions-parent"
        onMouseEnter={() => { setHovered(true); prefetch(session.id, api.getSession); }}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: "flex",
          alignItems: "center",
          padding: 0,
          background: isActive
            ? "var(--bg-sidebar-active)"
            : hovered
            ? "var(--bg-sidebar-hover)"
            : "transparent",
          borderRadius: "var(--radius-sm)",
          margin: "1px 6px",
          transition: "background var(--transition-fast)",
          minHeight: "30px",
          gap: "4px",
        }}
      >
        {isRenaming ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              flex: 1,
              padding: "5px 8px 5px 12px",
              gap: "4px",
              minWidth: 0,
            }}
          >
            <RenameInput
              initialValue={displayTitle}
              onCommit={commitRename}
              onCancel={cancelRename}
            />
          </div>
        ) : (
          <>
            <button
              type="button"
              onClick={handleClick}
              aria-label={displayTitle}
              style={{
                display: "flex",
                alignItems: "center",
                flex: 1,
                minWidth: 0,
                padding: "5px 0 5px 12px",
                gap: "4px",
                background: "none",
                border: "none",
                cursor: "pointer",
                font: "inherit",
                color: "inherit",
                textAlign: "left",
                userSelect: "none",
                outline: "none",
              }}
            >
              {/* Star indicator */}
              {isStarred && (
                <span style={{ color: "var(--accent-orange)", flexShrink: 0, fontSize: "11px", display: "flex" }}>
                  <IconStar filled />
                </span>
              )}

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

              {bellState !== "hidden" && (
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
            </button>

            <button
              ref={menuBtnRef}
              type="button"
              onClick={openMenu}
              className={isActive || menuOpen ? "" : "hover-actions"}
              style={{
                flexShrink: 0,
                marginRight: "8px",
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
          </>
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
