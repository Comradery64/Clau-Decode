import { useState, useEffect } from "react";
import { api } from "../../api/client";
import type { TipEntry } from "../../api/types";

const SEVERITY_COLOR: Record<string, string> = {
  error:   "#ef4444",
  warning: "#f59e0b",
  info:    "#60a5fa",
};

const SEVERITY_BG: Record<string, string> = {
  error:   "rgba(239,68,68,0.10)",
  warning: "rgba(245,158,11,0.10)",
  info:    "rgba(96,165,250,0.10)",
};

function TipCard({ tip }: { tip: TipEntry }) {
  const [open, setOpen] = useState(false);
  const color = SEVERITY_COLOR[tip.severity] ?? "#60a5fa";
  const bg    = SEVERITY_BG[tip.severity]    ?? "rgba(96,165,250,0.10)";

  return (
    <div style={{
      border: `1px solid ${color}40`,
      borderLeft: `3px solid ${color}`,
      borderRadius: "6px",
      padding: "14px 16px",
      background: "var(--bg-tool-block)",
    }}>
      <div style={{ display: "flex", alignItems: "flex-start", gap: "10px" }}>
        <span style={{
          fontSize: "10px",
          fontWeight: 700,
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          padding: "2px 7px",
          borderRadius: "4px",
          background: bg,
          color,
          flexShrink: 0,
          marginTop: "2px",
        }}>
          {tip.severity}
        </span>

        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)", marginBottom: "4px" }}>
            {tip.title}
          </div>
          <div style={{ fontSize: "13px", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            {tip.detail}
          </div>

          {tip.evidence.length > 0 && (
            <button
              onClick={() => setOpen((o) => !o)}
              style={{
                marginTop: "8px",
                fontSize: "12px",
                color: "var(--text-tertiary)",
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: 0,
              }}
            >
              {open ? "▾ Hide evidence" : "▸ Show evidence"}
            </button>
          )}

          {open && tip.evidence.length > 0 && (
            <ul style={{
              margin: "8px 0 0",
              padding: "0 0 0 16px",
              fontSize: "12px",
              color: "var(--text-tertiary)",
              fontFamily: "var(--font-mono)",
            }}>
              {tip.evidence.map((e, i) => (
                <li key={i} style={{ marginBottom: "2px" }}>{e}</li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

export function TipsTab() {
  const [tips, setTips] = useState<TipEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.getTips()
      .then(setTips)
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Analysing…</div>;
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
      <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
        <h3 style={{
          fontSize: "12px",
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.07em",
          margin: 0,
        }}>
          Optimization Tips
        </h3>
        <span style={{
          fontSize: "12px",
          fontFamily: "var(--font-mono)",
          color: tips.length > 0 ? "#f59e0b" : "#34d399",
        }}>
          {tips.length > 0
            ? `${tips.length} issue${tips.length > 1 ? "s" : ""} found`
            : "All clear"}
        </span>
      </div>

      {tips.length === 0 && (
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
          No optimization issues detected across your sessions.
        </p>
      )}

      {tips.map((tip, i) => (
        <TipCard key={`${tip.rule_id}-${i}`} tip={tip} />
      ))}
    </div>
  );
}
