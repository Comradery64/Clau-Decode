import type { PricingTableResponse } from "../../api/types";
import { SectionHeader } from "./SectionHeader";

const fmtRate = (n: number): string => `$${n.toFixed(2)}`;

const TH: React.CSSProperties = {
  textAlign: "left", padding: "6px 10px", color: "var(--text-tertiary)",
  fontWeight: 500, fontSize: "11px",
};
const TD: React.CSSProperties = {
  padding: "8px 10px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)",
};

/** Model pricing rate table — folded onto the Dashboard from the retired
 * Analytics panel (its one section with no Dashboard equivalent). */
export function ModelRates({ pricing }: { pricing: PricingTableResponse }) {
  if (pricing.models.length === 0) return null;
  return (
    <section>
      <SectionHeader title="Model rates" hint={`USD / 1M tokens · ${pricing.source}`} />
      <div style={{ borderRadius: "var(--radius-md)", border: "1px solid var(--border-subtle)", overflow: "hidden" }}>
        <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: 0, fontSize: "13px" }}>
          <thead>
            <tr style={{ borderBottom: "1px solid var(--border-subtle)" }}>
              {["Model", "Input", "Output", "Cache Write", "Cache Read"].map((h) => (
                <th key={h} style={TH}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {pricing.models.map((m, i) => (
              <tr key={m.model} style={{ borderBottom: i < pricing.models.length - 1 ? "1px solid var(--border-subtle)" : undefined }}>
                <td style={{ ...TD, fontSize: "12px", color: "var(--text-primary)" }}>{m.model}</td>
                <td style={TD}>{fmtRate(m.input_per_mtok)}</td>
                <td style={TD}>{fmtRate(m.output_per_mtok)}</td>
                <td style={TD}>{fmtRate(m.cache_write_per_mtok)}</td>
                <td style={TD}>{fmtRate(m.cache_read_per_mtok)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
