import type { DashboardData } from "../../api/types";

export function TipCard({ tip }: { tip: DashboardData["tips"][number] }) {
  const colors: Record<string, string> = { info: "#7eb6c4", warning: "#c9a96e", error: "#c47a7a" };
  const color = colors[tip.severity] || colors.info;
  return (
    <div style={{
      padding: "11px 14px",
      background: "var(--bg-tool-block)",
      borderRadius: "var(--radius-md)",
      borderLeft: `3px solid ${color}`,
    }}>
      <div style={{ fontSize: "12.5px", fontWeight: 500, color: "var(--text-primary)" }}>{tip.title}</div>
      <div style={{ fontSize: "11.5px", color: "var(--text-tertiary)", marginTop: "3px", lineHeight: 1.5 }}>{tip.detail}</div>
    </div>
  );
}
