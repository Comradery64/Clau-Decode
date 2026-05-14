import type { DashboardData } from "../../api/types";
import { formatRelative } from "../../utils/formatRelative";

export const PROJECT_STRIP_LIMIT = 20;

type Project = DashboardData["projects"][number];

export function ProjectChip({ project, onClick }: { project: Project; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: "0 0 auto",
        width: "180px",
        padding: "11px 14px",
        background: "var(--bg-tool-block)",
        borderRadius: "var(--radius-md)",
        border: "1px solid var(--border-subtle)",
        cursor: "pointer",
        textAlign: "left",
        fontFamily: "inherit",
        color: "inherit",
        transition: "background 0.12s, border-color 0.12s",
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-default)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border-subtle)";
      }}
    >
      <div style={{ fontSize: "13px", fontWeight: 500, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {project.display_name}
      </div>
      <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "4px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
        {project.session_count} session{project.session_count !== 1 ? "s" : ""}
        {project.last_activity_at && ` · ${formatRelative(project.last_activity_at)}`}
      </div>
    </button>
  );
}

export function ProjectStrip({ projects, onSelect }: {
  projects: DashboardData["projects"];
  onSelect: (id: string) => void;
}) {
  const sorted = [...projects].sort((a, b) => {
    const at = a.last_activity_at ? Date.parse(a.last_activity_at) : 0;
    const bt = b.last_activity_at ? Date.parse(b.last_activity_at) : 0;
    return bt - at;
  });
  const visible = sorted.slice(0, PROJECT_STRIP_LIMIT);
  const overflow = sorted.length - visible.length;

  return (
    <div
      className="dashboard-project-strip"
      style={{
        display: "flex",
        gap: "8px",
        overflowX: "auto",
        paddingBottom: "4px",
        margin: "0 -32px",
        padding: "0 32px 4px",
      }}
    >
      {visible.map((p) => (
        <ProjectChip key={p.id} project={p} onClick={() => onSelect(p.id)} />
      ))}
      {overflow > 0 && (
        <div style={{
          flex: "0 0 auto",
          width: "120px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "11px 14px",
          fontSize: "12px",
          color: "var(--text-tertiary)",
          fontStyle: "italic",
          border: "1px dashed var(--border-subtle)",
          borderRadius: "var(--radius-md)",
        }}>
          +{overflow} more
        </div>
      )}
    </div>
  );
}
