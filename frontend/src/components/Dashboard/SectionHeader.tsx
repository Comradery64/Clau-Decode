export function SectionHeader({ title, hint }: { title: string; hint?: string }) {
  return (
    <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", margin: "0 0 14px" }}>
      <h3 style={{
        fontSize: "11px",
        color: "var(--text-tertiary)",
        textTransform: "uppercase",
        letterSpacing: "0.09em",
        fontWeight: 600,
        margin: 0,
      }}>
        {title}
      </h3>
      {hint && (
        <span style={{ fontSize: "11px", color: "var(--text-tertiary)", opacity: 0.7 }}>{hint}</span>
      )}
    </div>
  );
}
