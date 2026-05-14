import { useCallback, useState, useEffect, useMemo, useRef } from "react";
import React from "react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { Project, Session } from "../../api/types";
import { api } from "../../api/client";
import { useAppStore } from "../../store";
import { useRoute, navigateTo } from "../../router";
import { LS } from "../../utils/localStorage";
import { useLsSet } from "../../utils/useLsSet";
import { on } from "../../utils/events";
import { SCROLLBAR_OPTIONS } from "../ScrollContainer";
import { SidebarHeader } from "./SidebarHeader";
import { ProjectGroup } from "./ProjectGroup";
import { SessionItem } from "./SessionItem";
import { FileExplorer } from "./FileExplorer";

const SIDEBAR_WIDTH_STORAGE_KEY = "clau-decode:sidebar-width";
const SIDEBAR_MIN_WIDTH = 200;
const SIDEBAR_MAX_WIDTH = 480;
const SIDEBAR_DEFAULT_WIDTH = 260;
// Keep at least this much room for the main pane (chat / dashboard).
const SIDEBAR_MIN_MAIN_PANE = 480;

function loadStoredSidebarWidth(): number {
  if (typeof window === "undefined") return SIDEBAR_DEFAULT_WIDTH;
  const raw = window.localStorage.getItem(SIDEBAR_WIDTH_STORAGE_KEY);
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return SIDEBAR_DEFAULT_WIDTH;
  return Math.max(SIDEBAR_MIN_WIDTH, Math.min(n, SIDEBAR_MAX_WIDTH));
}

function IconSearch() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
    </svg>
  );
}

function IconChats() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

function IconSettings() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}

function IconAnalytics() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/>
    </svg>
  );
}

function IconHelp() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/>
    </svg>
  );
}

function IconKeyboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="4" width="20" height="16" rx="2"/><line x1="6" y1="8" x2="6.01" y2="8"/><line x1="10" y1="8" x2="10.01" y2="8"/><line x1="14" y1="8" x2="14.01" y2="8"/><line x1="18" y1="8" x2="18.01" y2="8"/><line x1="8" y1="12" x2="8.01" y2="12"/><line x1="12" y1="12" x2="12.01" y2="12"/><line x1="16" y1="12" x2="16.01" y2="12"/><line x1="7" y1="16" x2="17" y2="16"/>
    </svg>
  );
}

function NavItem({
  icon,
  label,
  shortcut,
  active,
  onClick,
  collapsed,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick?: () => void;
  collapsed?: boolean;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      title={collapsed ? label : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        width: "calc(100% - 12px)",
        padding: "7px 12px",
        background: active
          ? "var(--bg-sidebar-active)"
          : hovered
          ? "var(--bg-sidebar-hover)"
          : "none",
        border: "none",
        borderRadius: "var(--radius-sm)",
        cursor: "pointer",
        color: "var(--text-primary)",
        fontSize: "15px",
        fontFamily: "var(--font-ui)",
        fontWeight: active ? 500 : 400,
        textAlign: "left",
        transition: "background var(--transition-fast), color var(--transition-fast)",
        margin: "1px 6px",
        overflow: "hidden",
        whiteSpace: "nowrap",
      }}
    >
      <span style={{ flexShrink: 0, display: "flex" }}>{icon}</span>
      <span style={{
        flex: 1,
        overflow: "hidden",
        whiteSpace: "nowrap",
        opacity: collapsed ? 0 : 1,
        transition: "opacity 200ms ease",
      }}>{label}</span>
      {shortcut && (
        <kbd style={{
          fontSize: "11px",
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-ui)",
          opacity: collapsed ? 0 : 1,
          transition: "opacity 200ms ease",
        }}>
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

function SidebarFooter({ collapsed }: { collapsed?: boolean }) {
  const openSettings = useAppStore((s) => s.openSettings);
  const openHelp = useAppStore((s) => s.openHelp);
  const openShortcuts = useAppStore((s) => s.openShortcuts);
  const profiles = useAppStore((s) => s.profiles);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const setActiveProfileId = useAppStore((s) => s.setActiveProfileId);
  const route = useRoute();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [menuOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMenuOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const switchProfile = async (id: string | null) => {
    try {
      await api.setActiveProfile(id);
      setActiveProfileId(id);
      setMenuOpen(false);
    } catch { /* ignore */ }
  };

  const activeProfile = profiles.find((p) => p.id === activeProfileId);
  const displayName = activeProfile ? activeProfile.name : profiles.length > 0 ? "All Profiles" : "Clau-Decode";
  const displayColor = activeProfile ? activeProfile.color : "var(--accent-orange)";
  const initial = activeProfile ? activeProfile.name[0].toUpperCase() : "C";

  const menuItemStyle = (highlight?: boolean): React.CSSProperties => ({
    display: "flex",
    alignItems: "center",
    gap: "10px",
    width: "100%",
    padding: "7px 12px",
    background: highlight ? "var(--bg-sidebar-hover)" : "none",
    border: "none",
    cursor: "pointer",
    fontFamily: "var(--font-ui)",
    fontSize: "15px",
    textAlign: "left",
    color: "var(--text-primary)",
    transition: "background var(--transition-fast)",
  });

  const avatar = (
    <span
      style={{
        width: "28px",
        height: "28px",
        borderRadius: "50%",
        background: displayColor,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        flexShrink: 0,
        color: "var(--text-on-accent)",
        fontSize: "12px",
        fontWeight: 700,
      }}
    >
      {initial}
    </span>
  );

  return (
    <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "8px 4px", flexShrink: 0, position: "relative" }} ref={menuRef}>
      <button
        onClick={collapsed ? () => { openSettings(); } : () => setMenuOpen(!menuOpen)}
        aria-label="Open menu"
        title={collapsed ? "Settings" : undefined}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          width: "100%",
          padding: "8px 8px",
          background: "none",
          border: "none",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          outline: "none",
          fontFamily: "var(--font-ui)",
          overflow: "hidden",
        }}
      >
        {avatar}
        <div style={{
          flex: 1,
          textAlign: "left",
          overflow: "hidden",
          opacity: collapsed ? 0 : 1,
          transition: "opacity 200ms ease",
          whiteSpace: "nowrap",
        }}>
          <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>{displayName}</div>
          <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Menu</div>
        </div>
      </button>

      {menuOpen && (
        <div style={{
          position: "absolute",
          bottom: "100%",
          left: "4px",
          right: "4px",
          background: "var(--bg-modal)",
          borderRadius: "12px",
          boxShadow: "0 -2px 12px rgba(0,0,0,0.08)",
          marginBottom: "-1px",
          overflow: "hidden",
        }}>
          {/* Settings */}
          <button
            onClick={() => { openSettings(); setMenuOpen(false); }}
            style={menuItemStyle()}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            <span style={{ flexShrink: 0, display: "flex", color: "var(--text-tertiary)" }}><IconSettings /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>Settings</div>
            </div>
          </button>

          {/* Analytics */}
          <button
            onClick={() => { navigateTo(route === "/analytics" ? "/" : "/analytics"); setMenuOpen(false); }}
            style={menuItemStyle()}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            <span style={{ flexShrink: 0, display: "flex", color: "var(--text-tertiary)" }}><IconAnalytics /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>Analytics</div>
            </div>
          </button>

          {/* Get Help */}
          <button
            onClick={() => { openHelp(); setMenuOpen(false); }}
            style={menuItemStyle()}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            <span style={{ flexShrink: 0, display: "flex", color: "var(--text-tertiary)" }}><IconHelp /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>Get Help</div>
            </div>
          </button>

          {/* Keyboard Shortcuts */}
          <button
            onClick={() => { openShortcuts(); setMenuOpen(false); }}
            style={menuItemStyle()}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = "none"; }}
          >
            <span style={{ flexShrink: 0, display: "flex", color: "var(--text-tertiary)" }}><IconKeyboard /></span>
            <div style={{ flex: 1 }}>
              <div style={{ fontWeight: 500 }}>Keyboard Shortcuts</div>
            </div>
          </button>

          {/* Profile section */}
          {profiles.length > 0 && (
            <>
              <div style={{ borderTop: "1px solid var(--border-subtle)", margin: "4px 0" }} />
              {/* All Profiles */}
              <button
                onClick={() => { switchProfile(null); }}
                style={menuItemStyle(!activeProfileId)}
              >
                <span style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--accent-orange)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-on-accent)", fontSize: "10px", fontWeight: 700, flexShrink: 0 }}>C</span>
                <span style={{ fontWeight: !activeProfileId ? 500 : 400 }}>All Profiles</span>
              </button>
              {profiles.map((p) => (
                <button
                  key={p.id}
                  onClick={() => { switchProfile(p.id); }}
                  style={menuItemStyle(activeProfileId === p.id)}
                >
                  <span style={{ width: 22, height: 22, borderRadius: "50%", background: p.color, display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-on-accent)", fontSize: "10px", fontWeight: 700, flexShrink: 0 }}>
                    {p.name[0].toUpperCase()}
                  </span>
                  <span style={{ fontWeight: activeProfileId === p.id ? 500 : 400 }}>{p.name}</span>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Sidebar() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  // Flat sessions for date-based sort
  const [flatSessions, setFlatSessions] = useState<Session[]>([]);
  const [flatLoading, setFlatLoading] = useState(false);
  // True once we've completed the initial session load — refreshes should not show a spinner
  const flatLoadedRef = useRef(false);

  const sessionListRef = useRef<React.ComponentRef<typeof OverlayScrollbarsComponent>>(null);

  // Archive view
  const [showArchive, setShowArchive] = useState(false);
  const archived = useLsSet(LS.ARCHIVED, "archive");
  const starred = useLsSet(LS.STARRED, "star");

  // Collapsible section headers
  const [starredCollapsed, setStarredCollapsed] = useState(false);
  const [recentsCollapsed, setRecentsCollapsed] = useState(false);

  const openSearch = useAppStore((s) => s.openSearch);
  const sessionSortOrder = useAppStore((s) => s.sessionSortOrder);
  const selectedSessionId = useAppStore((s) => s.selectedSessionId);
  const selectSession = useAppStore((s) => s.selectSession);
  const selectProject = useAppStore((s) => s.selectProject);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const sidebarMode = useAppStore((s) => s.sidebarMode);
  const setFileExplorerRoot = useAppStore((s) => s.setFileExplorerRoot);
  const activeProfileId = useAppStore((s) => s.activeProfileId);
  const setProfiles = useAppStore((s) => s.setProfiles);
  const setActiveProfileId = useAppStore((s) => s.setActiveProfileId);

  const showParentFolder = useAppStore((s) => s.showParentFolder);
  const route = useRoute();

  const showFlat = sessionSortOrder !== "alpha";

  // Sidebar width — drag-resizable from the right edge, persisted across sessions.
  // Collapsed state always overrides to 52px; this state only governs expanded width.
  const [sidebarWidth, setSidebarWidth] = useState<number>(loadStoredSidebarWidth);
  const sidebarWidthRef = useRef(sidebarWidth);
  sidebarWidthRef.current = sidebarWidth;
  const [resizingSidebar, setResizingSidebar] = useState(false);

  // Clamp stored width into a sane range for the current viewport. Runs on
  // mount and on window resize so dragging the browser narrow can't strand
  // the sidebar wider than the available space.
  useEffect(() => {
    const clamp = () => {
      const maxByViewport = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - SIDEBAR_MIN_MAIN_PANE),
      );
      setSidebarWidth((w) => Math.max(SIDEBAR_MIN_WIDTH, Math.min(w, maxByViewport)));
    };
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  const startSidebarResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = sidebarWidthRef.current;
    setResizingSidebar(true);
    // Disable text-selection while dragging so the cursor doesn't grab text.
    document.body.style.userSelect = "none";
    const onMove = (ev: MouseEvent) => {
      const dx = ev.clientX - startX;
      const maxByViewport = Math.max(
        SIDEBAR_MIN_WIDTH,
        Math.min(SIDEBAR_MAX_WIDTH, window.innerWidth - SIDEBAR_MIN_MAIN_PANE),
      );
      const next = Math.max(SIDEBAR_MIN_WIDTH, Math.min(startWidth + dx, maxByViewport));
      setSidebarWidth(next);
    };
    const onUp = () => {
      setResizingSidebar(false);
      document.body.style.userSelect = "";
      window.localStorage.setItem(SIDEBAR_WIDTH_STORAGE_KEY, String(sidebarWidthRef.current));
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  const handleSelectSession = (session: Session) => {
    selectProject(session.project_id);
    setFileExplorerRoot(session.cwd);
    // On the Analytics view, clicking a session should re-scope the analytics
    // to that session — not navigate away to the chat. Update the store
    // directly and stay on /analytics.
    if (route === "/analytics") {
      selectSession(session.id);
    } else {
      navigateTo(`/chat/${session.id}`);
    }
  };

  // When switching to folder mode with a session already selected, set the root.
  useEffect(() => {
    if (sidebarMode !== "folder") return;
    const root = useAppStore.getState().fileExplorerRoot;
    if (root) return;
    const sid = selectedSessionId;
    if (!sid) return;
    const session = flatSessions.find((s) => s.id === sid);
    if (session?.cwd) setFileExplorerRoot(session.cwd);
  }, [sidebarMode]);

  const displayName = (project: Project) => {
    if (showParentFolder) return project.display_name;
    const idx = project.display_name.lastIndexOf("/");
    return idx >= 0 ? project.display_name.slice(idx + 1) : project.display_name;
  };

  const sortedProjects = useMemo(() => {
    if (sessionSortOrder !== "alpha") return projects;
    return [...projects].sort((a, b) =>
      displayName(a).localeCompare(displayName(b))
    );
  }, [projects, sessionSortOrder, showParentFolder]);

  // Load profiles on mount
  useEffect(() => {
    api.getProfiles().then((data) => {
      setProfiles(data.profiles);
      setActiveProfileId(data.active_profile_id);
    }).catch(() => {});
  }, []);

  // Re-fetch when active profile changes
  useEffect(() => {
    if (activeProfileId === undefined) return; // skip initial undefined
    let cancelled = false;
    setLoading(true);
    api.getProjects().then((data) => {
      if (!cancelled) {
        setProjects(data);
        if (data.length > 0) setExpandedProjects(new Set([data[0].id]));
      }
    }).catch(() => {}).finally(() => { if (!cancelled) setLoading(false); });
    api.getAllSessions().then((s) => { if (!cancelled) setFlatSessions(s); }).catch(() => {});
    return () => { cancelled = true; };
  }, [activeProfileId]);

  // Load projects
  useEffect(() => {
    let cancelled = false;
    api
      .getProjects()
      .then((data) => {
        if (!cancelled) {
          setProjects(data);
          if (data.length > 0) setExpandedProjects(new Set([data[0].id]));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load projects");
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  // Reload all sessions on project list change. Single flat request instead of N per-project.
  useEffect(() => {
    if (projects.length === 0) return;
    let cancelled = false;
    if (!flatLoadedRef.current) setFlatLoading(true);
    api.getAllSessions()
      .then((sessions) => {
        if (!cancelled) {
          flatLoadedRef.current = true;
          setFlatSessions(sessions);
        }
      })
      .catch(() => {})
      .finally(() => { if (!cancelled) setFlatLoading(false); });
    return () => { cancelled = true; };
  }, [projects]);

  // SSE refresh — update both projects and sessions directly without showing spinners
  useEffect(() => {
    return on("refresh", () => {
      api.getProjects().then(setProjects).catch(() => {});
      api.getAllSessions().then(setFlatSessions).catch(() => {});
    });
  }, []);

  const starredSessions = useMemo(() =>
    flatSessions.filter((s) => starred.has(s.id) && !archived.has(s.id)),
    [flatSessions, starred, archived]
  );

  const sortedFlatSessions = useMemo(() => {
    const filtered = flatSessions.filter((s) =>
      showArchive ? archived.has(s.id) : !archived.has(s.id)
    );
    if (sessionSortOrder === "recent") {
      filtered.sort((a, b) =>
        (b.updated_at ?? b.started_at ?? "").localeCompare(a.updated_at ?? a.started_at ?? "")
      );
    } else if (sessionSortOrder === "oldest") {
      filtered.sort((a, b) =>
        (a.updated_at ?? a.started_at ?? "").localeCompare(b.updated_at ?? b.started_at ?? "")
      );
    }
    return filtered;
  }, [flatSessions, sessionSortOrder, showArchive, archived]);

  const toggleProject = (projectId: string) => {
    setExpandedProjects((prev) => {
      const next = new Set(prev);
      if (next.has(projectId)) next.delete(projectId);
      else next.add(projectId);
      return next;
    });
  };

  return (
    <aside
      aria-label="Navigation"
      style={{
        width: sidebarCollapsed ? "52px" : `${sidebarWidth}px`,
        height: "100vh",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-subtle)",
        flexShrink: 0,
        overflow: "hidden",
        position: "relative",
        // Animate width changes from collapse/expand, but not while actively
        // dragging — the drag handler sets width every mousemove and a CSS
        // transition would make it feel laggy.
        transition: resizingSidebar ? "none" : "width 180ms ease-out",
      }}
    >
      {/* Drag handle on the right edge — only when expanded.
          6px wide hit target; a 1px line on the inside edge brightens on
          hover/drag for visual feedback. */}
      {!sidebarCollapsed && (
        <div
          onMouseDown={startSidebarResize}
          title="Drag to resize"
          aria-label="Resize sidebar"
          role="separator"
          aria-orientation="vertical"
          style={{
            position: "absolute",
            top: 0,
            bottom: 0,
            right: 0,
            width: "6px",
            cursor: "col-resize",
            zIndex: 10,
            background: resizingSidebar ? "var(--accent-orange)" : "transparent",
            transition: "background 0.12s",
          }}
          onMouseEnter={(e) => {
            if (!resizingSidebar) e.currentTarget.style.background = "var(--border-default)";
          }}
          onMouseLeave={(e) => {
            if (!resizingSidebar) e.currentTarget.style.background = "transparent";
          }}
        />
      )}
      <SidebarHeader collapsed={sidebarCollapsed} />

      {/* Nav items */}
      <div style={{ padding: "6px 0 4px", flexShrink: 0 }}>
        <NavItem collapsed={sidebarCollapsed} icon={<IconSearch />} label="Search" shortcut="⌘K" onClick={openSearch} />

        {/* Starred section — only shown when there are starred sessions */}
        {!sidebarCollapsed && starredSessions.length > 0 && (
          <div style={{ margin: "4px 0" }}>
            <button
              onClick={() => setStarredCollapsed((v) => !v)}
              style={{
                display: "flex",
                alignItems: "center",
                width: "100%",
                padding: "4px 18px 2px",
                fontSize: "11px",
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                color: "var(--text-tertiary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                fontFamily: "var(--font-ui)",
                gap: "4px",
              }}
            >
              <span style={{ flex: 1, textAlign: "left" }}>Starred</span>
              <span style={{
                fontSize: "9px",
                transition: "transform var(--transition-fast)",
                transform: starredCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                display: "inline-block",
                marginRight: "4px",
              }}>▾</span>
            </button>
            {!starredCollapsed && starredSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={selectedSessionId === session.id}
                onClick={() => handleSelectSession(session)}
              />
            ))}
          </div>
        )}

        <NavItem
          collapsed={sidebarCollapsed}
          icon={<IconChats />}
          label="Archive"
          active={showArchive}
          onClick={() => setShowArchive((v) => !v)}
        />
      </div>

      {!sidebarCollapsed && <div style={{ marginTop: "2px" }} />}

      {/* Sessions list — hidden via display when collapsed to keep OS instance alive */}
      <OverlayScrollbarsComponent
        ref={sessionListRef}
        options={SCROLLBAR_OPTIONS}
        role={sidebarMode === "chat" ? "list" : undefined}
        aria-label={sidebarMode === "chat" ? "Sessions" : undefined}
        style={{
          flex: 1,
          padding: sidebarMode === "folder" ? "0" : "8px 0",
          display: sidebarCollapsed ? "none" : undefined,
        }}
      >
        {sidebarMode === "folder" ? (
          <FileExplorer />
        ) : (
            <>
              {loading && (
                <div style={{ padding: "16px", fontSize: "13px", color: "var(--text-tertiary)", textAlign: "center" }}>
                  Loading…
                </div>
              )}
              {error && (
                <div style={{ padding: "16px", fontSize: "13px", color: "var(--tool-error-border)" }}>
                  {error}
                </div>
              )}

              {/* Flat sorted list (recent / oldest) — also used for archive view in any sort mode */}
              {!loading && !error && (showFlat || showArchive) && (
                <>
                  <button
                    onClick={() => setRecentsCollapsed((v) => !v)}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      width: "100%",
                      padding: "6px 18px 4px",
                      fontSize: "11px",
                      fontWeight: 600,
                      textTransform: "uppercase",
                      letterSpacing: "0.06em",
                      color: "var(--text-tertiary)",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      fontFamily: "var(--font-ui)",
                      gap: "4px",
                    }}
                  >
                    <span style={{ flex: 1, textAlign: "left" }}>
                      {showArchive ? "Archived" : "Recents"}
                    </span>
                  </button>
                  {!recentsCollapsed && flatLoading && (
                    <div style={{ padding: "8px 16px", fontSize: "12px", color: "var(--text-tertiary)" }}>
                      Loading…
                    </div>
                  )}
                  {!recentsCollapsed && !flatLoading && sortedFlatSessions.map((session) => (
                    <SessionItem
                      key={session.id}
                      session={session}
                      isActive={selectedSessionId === session.id}
                      onClick={() => handleSelectSession(session)}
                    />
                  ))}
                  {!recentsCollapsed && !flatLoading && sortedFlatSessions.length === 0 && (
                    <div style={{ padding: "24px 16px", fontSize: "13px", color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.6 }}>
                      {showArchive ? "No archived sessions." : "No sessions found."}
                    </div>
                  )}
                </>
              )}

              {/* Project groups (alpha sort) — hidden when archive view is active */}
              {!loading && !error && !showFlat && !showArchive && (
                <>
                  {sortedProjects.map((project) => (
                    <ProjectGroup
                      key={project.id}
                      project={project}
                      displayName={displayName(project)}
                      isExpanded={expandedProjects.has(project.id)}
                      onToggle={() => toggleProject(project.id)}
                      archivedIds={archived.ids}
                    />
                  ))}
                  {sortedProjects.length === 0 && (
                    <div style={{ padding: "24px 16px", fontSize: "13px", color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.6 }}>
                      No projects found.<br />Add a path in Settings.
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </OverlayScrollbarsComponent>

      {sidebarCollapsed && <div style={{ flex: 1 }} />}

      <SidebarFooter collapsed={sidebarCollapsed} />
    </aside>
  );
}
