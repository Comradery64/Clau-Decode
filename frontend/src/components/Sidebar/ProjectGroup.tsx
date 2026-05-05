import { useState, useEffect, useMemo } from "react";
import type { Project, Session } from "../../api/types";
import { api } from "../../api/client";
import { useAppStore } from "../../store";
import { SessionItem } from "./SessionItem";

interface ProjectGroupProps {
  project: Project;
  isExpanded: boolean;
  onToggle: () => void;
  archivedIds: Set<string>;
}

export function ProjectGroup({ project, isExpanded, onToggle, archivedIds }: ProjectGroupProps) {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const selectedSessionId = useAppStore((s) => s.selectedSessionId);
  const selectSession = useAppStore((s) => s.selectSession);
  const selectProject = useAppStore((s) => s.selectProject);
  const sessionSortOrder = useAppStore((s) => s.sessionSortOrder);

  const sortedSessions = useMemo(() => {
    const copy = sessions.filter((s) => !archivedIds.has(s.id));
    if (sessionSortOrder === "recent") {
      copy.sort((a, b) => (b.updated_at ?? "").localeCompare(a.updated_at ?? ""));
    } else if (sessionSortOrder === "oldest") {
      copy.sort((a, b) => (a.updated_at ?? "").localeCompare(b.updated_at ?? ""));
    } else {
      copy.sort((a, b) => (a.title ?? "Untitled").localeCompare(b.title ?? "Untitled"));
    }
    return copy;
  }, [sessions, sessionSortOrder, archivedIds]);

  useEffect(() => {
    if (!isExpanded) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    api
      .getProjectSessions(project.id)
      .then((data) => {
        if (!cancelled) setSessions(data);
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setError(err instanceof Error ? err.message : "Failed to load sessions");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isExpanded, project.id]);

  const handleSessionClick = (sessionId: string) => {
    selectProject(project.id);
    selectSession(sessionId);
  };

  return (
    <div>
      {/* Section header */}
      <button
        onClick={onToggle}
        aria-expanded={isExpanded}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          width: "100%",
          padding: "6px 12px 4px 16px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          color: "var(--text-tertiary)",
          fontSize: "11px",
          fontWeight: 600,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontFamily: "var(--font-ui)",
          transition: "color var(--transition-fast)",
          marginTop: "10px",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-secondary)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
        }}
      >
        <span
          style={{
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {project.display_name}
        </span>
        <span
          style={{
            fontSize: "9px",
            fontWeight: 400,
            textTransform: "none",
            letterSpacing: 0,
            transition: "transform var(--transition-fast)",
            transform: isExpanded ? "rotate(0deg)" : "rotate(-90deg)",
            display: "inline-block",
          }}
        >
          ▾
        </span>
      </button>

      {/* Sessions list */}
      {isExpanded && (
        <div>
          {loading && (
            <div
              style={{
                padding: "6px 16px 6px 32px",
                fontSize: "12px",
                color: "var(--text-tertiary)",
              }}
            >
              Loading…
            </div>
          )}
          {error && (
            <div
              style={{
                padding: "6px 16px 6px 32px",
                fontSize: "12px",
                color: "var(--tool-error-border)",
              }}
            >
              {error}
            </div>
          )}
          {!loading &&
            !error &&
            sortedSessions.map((session) => (
              <SessionItem
                key={session.id}
                session={session}
                isActive={selectedSessionId === session.id}
                onClick={() => handleSessionClick(session.id)}
              />
            ))}
          {!loading && !error && sessions.length === 0 && (
            <div
              style={{
                padding: "6px 16px 6px 32px",
                fontSize: "12px",
                color: "var(--text-tertiary)",
              }}
            >
              No sessions
            </div>
          )}
        </div>
      )}
    </div>
  );
}
