import { useAppStore } from "../../store";

function IconSidebarCollapse() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 3v18"/>
    </svg>
  );
}

export function SidebarHeader() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);

  return (
    <div
      style={{
        height: "var(--header-height)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0 8px 0 16px",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-ui)",
          fontSize: "18px",
          fontWeight: 600,
          color: "var(--text-primary)",
          letterSpacing: "-0.02em",
          userSelect: "none",
        }}
      >
        Claude
      </span>
      <button
        onClick={toggleSidebar}
        aria-label="Collapse sidebar"
        style={{
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-tertiary)",
          padding: "6px",
          borderRadius: "var(--radius-sm)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
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
        <IconSidebarCollapse />
      </button>
    </div>
  );
}
