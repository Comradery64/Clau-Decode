import type { ModelUsageEntry } from "../../api/types";
import { fmtModel, modelColor } from "./fmt";

export function ModelUsageStrip({ models }: { models: ModelUsageEntry[] }) {
  if (models.length === 0) return null;
  const total = models.reduce((a, m) => a + m.total_tokens, 0);
  if (total === 0) return null;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
      <div style={{
        display: "flex",
        height: "8px",
        borderRadius: "var(--radius-pill)",
        overflow: "hidden",
        background: "var(--bg-tool-block)",
      }}>
        {models.map((m) => {
          const pct = (m.total_tokens / total) * 100;
          return (
            <div
              key={m.model}
              title={`${fmtModel(m.model)} — ${pct.toFixed(1)}%`}
              style={{ width: `${pct}%`, background: modelColor(m.model) }}
            />
          );
        })}
      </div>
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap" }}>
        {models.map((m) => {
          const pct = ((m.total_tokens / total) * 100).toFixed(1);
          return (
            <div key={m.model} style={{ display: "flex", alignItems: "center", gap: "7px" }}>
              <div style={{ width: "8px", height: "8px", borderRadius: "2px", background: modelColor(m.model), flexShrink: 0 }} />
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                {fmtModel(m.model)}
              </span>
              <span style={{ fontSize: "11px", color: "var(--text-tertiary)", fontFamily: "var(--font-mono)" }}>
                {pct}%
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
