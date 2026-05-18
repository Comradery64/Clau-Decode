import { useAppStore } from "../../store";
import { navigateTo } from "../../router";
import { NewTaskButton } from "./NewTaskButton";

function IconSidebarCollapse() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="18" height="18" rx="2"/>
      <path d="M9 3v18"/>
    </svg>
  );
}

function IconFolder() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
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

const btnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--text-tertiary)",
  padding: "6px",
  borderRadius: "var(--radius-sm)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  transition: "color var(--transition-fast), background var(--transition-fast)",
};

function HeaderBtn({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick: () => void; active?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      title={label}
      style={{
        ...btnStyle,
        color: active ? "var(--text-primary)" : "var(--text-tertiary)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "none";
      }}
    >
      {children}
    </button>
  );
}

export function SidebarHeader({ collapsed }: { collapsed?: boolean }) {
  const toggleSidebar = useAppStore((s) => s.toggleSidebar);
  const sidebarMode = useAppStore((s) => s.sidebarMode);
  const setSidebarMode = useAppStore((s) => s.setSidebarMode);

  const toggleMode = () => {
    setSidebarMode(sidebarMode === "chat" ? "folder" : "chat");
  };

  const goHome = () => {
    navigateTo("/");
  };

  return (
    <div
      style={{
        position: "relative",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: "var(--header-height)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 12px",
          overflow: "hidden",
        }}
      >
        <button
          onClick={goHome}
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "18px",
            fontWeight: 600,
            color: "var(--text-primary)",
            letterSpacing: "-0.02em",
            userSelect: "none",
            whiteSpace: "nowrap",
            overflow: "hidden",
            opacity: collapsed ? 0 : 1,
            transition: "opacity 352ms ease",
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            borderRadius: "var(--radius-sm)",
          }}
        >
          Clau-Decode
        </button>
        <div style={{ display: "flex", alignItems: "center" }}>
          {!collapsed && <NewTaskButton />}
          {!collapsed && (
            <HeaderBtn
              label={sidebarMode === "chat" ? "File explorer" : "Session list"}
              onClick={toggleMode}
              active={sidebarMode === "folder"}
            >
              {sidebarMode === "chat" ? <IconFolder /> : <IconChat />}
            </HeaderBtn>
          )}
          <HeaderBtn label={collapsed ? "Expand sidebar" : "Collapse sidebar"} onClick={toggleSidebar} active={collapsed}>
            <IconSidebarCollapse />
          </HeaderBtn>
        </div>
      </div>
    </div>
  );
}
