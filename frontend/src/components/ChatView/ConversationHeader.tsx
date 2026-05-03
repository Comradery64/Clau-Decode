import type { Session } from "../../api/types";
import { useAppStore } from "../../store";

function formatModelDisplay(model: string): string {
  const withoutPrefix = model.replace(/^claude-/i, "");
  const normalised = withoutPrefix.replace(/-(\d+)(?:-(\d+))?$/, (_m, major, minor) =>
    minor !== undefined ? ` ${major}.${minor}` : ` ${major}`
  );
  return normalised.replace(/^(\w)/, (c) => c.toUpperCase());
}

function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  );
}

interface ConversationHeaderProps {
  session: Session | null;
}

export function ConversationHeader({ session }: ConversationHeaderProps) {
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  const title = session === null ? "Loading…" : (session.title ?? "Untitled");
  const modelLabel = session?.model ? formatModelDisplay(session.model) : null;

  return (
    <div
      style={{
        height: "var(--header-height)",
        display: "flex",
        alignItems: "center",
        padding: "0 20px",
        borderBottom: "1px solid var(--border-subtle)",
        background: "var(--bg-base)",
        flexShrink: 0,
        gap: "12px",
      }}
    >
      {/* Restore sidebar button (shown when sidebar is collapsed) */}
      {sidebarCollapsed && (
        <button
          onClick={toggleSidebar}
          aria-label="Show sidebar"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-tertiary)",
            padding: "4px",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            flexShrink: 0,
            transition: "color var(--transition-fast)",
          }}
          onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)"; }}
          onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)"; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>
          </svg>
        </button>
      )}

      {/* Title */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          flex: 1,
          minWidth: 0,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: "14px",
            fontWeight: 500,
            color: "var(--text-primary)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {title}
        </h1>
      </div>

      {/* Right side */}
      <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
        {modelLabel && (
          <span
            style={{
              fontSize: "12px",
              color: "var(--text-secondary)",
            }}
          >
            {modelLabel}
          </span>
        )}
        <button
          onClick={() => window.dispatchEvent(new CustomEvent("clau-decode:refresh"))}
          title="Refresh (⌘R / ⌘J)"
          aria-label="Refresh"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-tertiary)",
            padding: "6px",
            borderRadius: "var(--radius-sm)",
            display: "flex",
            transition: "color var(--transition-fast), background var(--transition-fast)",
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
            (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
            (e.currentTarget as HTMLButtonElement).style.background = "none";
          }}
        >
          <IconRefresh />
        </button>
      </div>
    </div>
  );
}
