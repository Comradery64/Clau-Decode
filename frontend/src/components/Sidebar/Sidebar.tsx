import { useState, useEffect, useMemo, useRef } from "react";
import type { Project, Session } from "../../api/types";
import { api } from "../../api/client";
import { useAppStore } from "../../store";
import { useRoute, navigateTo } from "../../router";
import { lsGetSet } from "../../utils/localStorage";
import { SidebarHeader } from "./SidebarHeader";
import { ProjectGroup } from "./ProjectGroup";
import { SessionItem } from "./SessionItem";

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

function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="9"/>
      <rect x="10" y="7" width="4" height="14"/>
      <rect x="17" y="3" width="4" height="18"/>
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

function NavItem({
  icon,
  label,
  shortcut,
  active,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  shortcut?: string;
  active?: boolean;
  onClick?: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
      }}
    >
      <span style={{ flexShrink: 0, display: "flex" }}>{icon}</span>
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && (
        <kbd style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-ui)" }}>
          {shortcut}
        </kbd>
      )}
    </button>
  );
}

function SidebarFooter() {
  const openSettings = useAppStore((s) => s.openSettings);
  const [hovered, setHovered] = useState(false);

  return (
    <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "8px 6px", flexShrink: 0 }}>
      <button
        onClick={openSettings}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        aria-label="Open settings"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          width: "100%",
          padding: "8px 12px",
          background: hovered ? "var(--bg-sidebar-hover)" : "none",
          border: "none",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
          transition: "background var(--transition-fast)",
          fontFamily: "var(--font-ui)",
        }}
      >
        <span
          style={{
            width: "28px",
            height: "28px",
            borderRadius: "50%",
            background: "var(--accent-orange)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            color: "var(--text-on-accent)",
            fontSize: "12px",
            fontWeight: 700,
          }}
        >
          C
        </span>
        <div style={{ flex: 1, textAlign: "left" }}>
          <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)" }}>Clau-Decode</div>
          <div style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>Settings</div>
        </div>
        <span style={{ color: "var(--text-tertiary)" }}><IconSettings /></span>
      </button>
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

  // Archive view
  const [showArchive, setShowArchive] = useState(false);
  const [archivedIds, setArchivedIds] = useState<Set<string>>(() => lsGetSet("clau-decode:archived"));
  const [starredIds, setStarredIds] = useState<Set<string>>(() => lsGetSet("clau-decode:starred"));

  // Collapsible section headers
  const [starredCollapsed, setStarredCollapsed] = useState(false);
  const [recentsCollapsed, setRecentsCollapsed] = useState(false);

  const openSearch = useAppStore((s) => s.openSearch);
  const sessionSortOrder = useAppStore((s) => s.sessionSortOrder);
  const selectedSessionId = useAppStore((s) => s.selectedSessionId);
  const selectSession = useAppStore((s) => s.selectSession);
  const selectProject = useAppStore((s) => s.selectProject);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const route = useRoute();

  const openSession = (projectId: string, sessionId: string) => {
    selectProject(projectId);
    selectSession(sessionId);
    navigateTo("/");
  };

  const showFlat = sessionSortOrder !== "alpha";

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
    const onRefresh = () => {
      api.getProjects().then(setProjects).catch(() => {});
      api.getAllSessions().then(setFlatSessions).catch(() => {});
    };
    window.addEventListener("clau-decode:refresh", onRefresh);
    return () => window.removeEventListener("clau-decode:refresh", onRefresh);
  }, []);

  // Sync archivedIds when a session is archived from the context menu
  useEffect(() => {
    const onArchive = () => setArchivedIds(lsGetSet("clau-decode:archived"));
    window.addEventListener("clau-decode:archive", onArchive);
    return () => window.removeEventListener("clau-decode:archive", onArchive);
  }, []);

  // Sync starredIds when a session is starred/unstarred from the context menu
  useEffect(() => {
    const onStar = () => setStarredIds(lsGetSet("clau-decode:starred"));
    window.addEventListener("clau-decode:star", onStar);
    return () => window.removeEventListener("clau-decode:star", onStar);
  }, []);

  const starredSessions = useMemo(() =>
    flatSessions.filter((s) => starredIds.has(s.id) && !archivedIds.has(s.id)),
    [flatSessions, starredIds, archivedIds]
  );

  const sortedFlatSessions = useMemo(() => {
    const filtered = flatSessions.filter((s) =>
      showArchive ? archivedIds.has(s.id) : !archivedIds.has(s.id)
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
  }, [flatSessions, sessionSortOrder, showArchive, archivedIds]);

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
      style={{
        width: "var(--sidebar-width)",
        height: "100vh",
        display: sidebarCollapsed ? "none" : "flex",
        flexDirection: "column",
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--border-subtle)",
        flexShrink: 0,
        overflow: "hidden",
      }}
    >
      <SidebarHeader />

      {/* Nav items */}
      <div style={{ padding: "6px 0 4px", flexShrink: 0 }}>
        <NavItem
          icon={<IconDashboard />}
          label="Dashboard"
          active={route === "/analytics"}
          onClick={() => navigateTo("/analytics")}
        />
        <NavItem icon={<IconSearch />} label="Search" shortcut="⌘K" onClick={openSearch} />

        {/* Starred section — only shown when there are starred sessions */}
        {starredSessions.length > 0 && (
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
                onClick={() => openSession(session.project_id, session.id)}
              />
            ))}
          </div>
        )}

        <NavItem
          icon={<IconChats />}
          label="Archive"
          active={showArchive}
          onClick={() => setShowArchive((v) => !v)}
        />
      </div>

      <div style={{ borderTop: "1px solid var(--border-subtle)", marginTop: "2px" }} />

      {/* Sessions list */}
      <div style={{ flex: 1, overflowY: "auto", padding: "8px 0" }}>
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
                padding: "6px 16px 4px",
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
              <span style={{
                fontSize: "9px",
                transition: "transform var(--transition-fast)",
                transform: recentsCollapsed ? "rotate(-90deg)" : "rotate(0deg)",
                display: "inline-block",
                marginRight: "4px",
              }}>▾</span>
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
                onClick={() => openSession(session.project_id, session.id)}
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
            {projects.map((project) => (
              <ProjectGroup
                key={project.id}
                project={project}
                isExpanded={expandedProjects.has(project.id)}
                onToggle={() => toggleProject(project.id)}
                archivedIds={archivedIds}
              />
            ))}
            {projects.length === 0 && (
              <div style={{ padding: "24px 16px", fontSize: "13px", color: "var(--text-tertiary)", textAlign: "center", lineHeight: 1.6 }}>
                No projects found.<br />Add a path in Settings.
              </div>
            )}
          </>
        )}
      </div>

      <SidebarFooter />
    </aside>
  );
}
