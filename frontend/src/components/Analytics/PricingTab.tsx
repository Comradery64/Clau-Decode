import type { PricingTableResponse } from "../../api/types";

interface PricingTabProps {
  pricing: PricingTableResponse | null;
}

function fmtRate(n: number): string {
  return `$${n.toFixed(2)}`;
}

export function PricingTab({ pricing }: PricingTabProps) {
  if (!pricing) return <div style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Loading…</div>;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "12px" }}>
        <h3 style={{ fontSize: "12px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", margin: 0 }}>
          Model Pricing (USD / 1M tokens)
        </h3>
        <span style={{
          fontSize: "10px",
          padding: "2px 6px",
          borderRadius: "4px",
          background: pricing.source === "live" ? "rgba(52, 211, 153, 0.15)" : "var(--bg-tool-block)",
          color: pricing.source === "live" ? "#34d399" : "var(--text-tertiary)",
          border: `1px solid ${pricing.source === "live" ? "rgba(52,211,153,0.3)" : "var(--border-subtle)"}`,
        }}>
          {pricing.source}
        </span>
      </div>

      <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              {["Model", "Input", "Output", "Cache Write", "Cache Read"].map((h) => (
                <th key={h} style={{ textAlign: "left", padding: "6px 10px", color: "var(--text-tertiary)", fontWeight: 500, fontSize: "11px" }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pricing.models.map((m, i) => (
              <tr key={m.model} style={{ borderBottom: i < pricing.models.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
                <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-primary)" }}>{m.model}</td>
                <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmtRate(m.input_per_mtok)}</td>
                <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmtRate(m.output_per_mtok)}</td>
                <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmtRate(m.cache_write_per_mtok)}</td>
                <td style={{ padding: "8px 10px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)" }}>{fmtRate(m.cache_read_per_mtok)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
