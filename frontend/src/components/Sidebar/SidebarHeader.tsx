import { useAppStore } from "../../store";
import { useRoute, navigateTo } from "../../router";

function IconSidebarCollapse() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 3v18"/>
    </svg>
  );
}

function IconAnalytics() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="12" width="4" height="9"/>
      <rect x="10" y="7" width="4" height="14"/>
      <rect x="17" y="3" width="4" height="18"/>
    </svg>
  );
}

function IconChat() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
  );
}

const headerBtnStyle: React.CSSProperties = {
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
};

function HeaderButton({ onClick, label, children }: { onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      style={headerBtnStyle}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
        (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
        (e.currentTarget as HTMLButtonElement).style.background = "none";
      }}
    >
      {children}
    </button>
  );
}

export function SidebarHeader() {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const route = useRoute();

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
        Clau-Decode
      </span>
      <div style={{ display: "flex", alignItems: "center", gap: "2px" }}>
        <HeaderButton
          onClick={() => navigateTo(route === "/analytics" ? "/" : "/analytics")}
          label={route === "/analytics" ? "Back to chat" : "Analytics"}
        >
          {route === "/analytics" ? <IconChat /> : <IconAnalytics />}
        </HeaderButton>
        <HeaderButton onClick={toggleSidebar} label="Collapse sidebar">
          <IconSidebarCollapse />
        </HeaderButton>
      </div>
    </div>
  );
}
