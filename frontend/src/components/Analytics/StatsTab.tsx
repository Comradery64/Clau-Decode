import { useState, useEffect } from "react";
import { api } from "../../api/client";
import type {
  PromptStatsResponse,
  ModelUsageEntry,
  ToolUsageEntry,
  FileTouchEntry,
  TokenDistribution,
} from "../../api/types";

// ─── helpers ────────────────────────────────────────────────────────────────

function fmtK(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtModel(m: string): string {
  return m.replace(/^claude-/, "").replace(/-\d{8}$/, "");
}

function shortPath(p: string): string {
  const parts = p.replace(/\\/g, "/").split("/").filter(Boolean);
  return parts.length <= 2 ? p : `…/${parts.slice(-2).join("/")}`;
}

// ─── sub-components ─────────────────────────────────────────────────────────

function SectionHeader({ title }: { title: string }) {
  return (
    <h3 style={{
      fontSize: "12px",
      color: "var(--text-tertiary)",
      textTransform: "uppercase",
      letterSpacing: "0.07em",
      margin: "0 0 10px",
    }}>
      {title}
    </h3>
  );
}

function StatRow({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", borderBottom: "1px solid var(--border-subtle)", fontSize: "13px" }}>
      <span style={{ color: "var(--text-secondary)" }}>{label}</span>
      <span style={{ color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{value}</span>
    </div>
  );
}

function DistributionCard({ label, dist }: { label: string; dist: TokenDistribution | null }) {
  if (!dist) return null;
  return (
    <div style={{ flex: 1, minWidth: "200px" }}>
      <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginBottom: "6px", fontWeight: 600 }}>{label}</div>
      <StatRow label="Median" value={fmtK(dist.median)} />
      <StatRow label="Mean" value={fmtK(dist.mean)} />
      <StatRow label="P95" value={fmtK(dist.p95)} />
      <StatRow label="Min" value={fmtK(dist.min)} />
      <StatRow label="Max" value={fmtK(dist.max)} />
    </div>
  );
}

function CssBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? (value / max) * 100 : 0;
  return (
    <div style={{ height: "8px", background: "var(--border-subtle)", borderRadius: "4px", overflow: "hidden", flex: 1 }}>
      <div style={{ height: "100%", width: `${pct}%`, background: color, borderRadius: "4px", transition: "width 0.3s ease" }} />
    </div>
  );
}

// ─── main component ──────────────────────────────────────────────────────────

export function StatsTab() {
  const [promptStats, setPromptStats] = useState<PromptStatsResponse | null>(null);
  const [models, setModels] = useState<ModelUsageEntry[]>([]);
  const [tools, setTools] = useState<ToolUsageEntry[]>([]);
  const [files, setFiles] = useState<FileTouchEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      api.getPromptStats(),
      api.getModelUsage(),
      api.getToolUsage(),
      api.getFileTouches(),
    ]).then(([ps, m, t, f]) => {
      setPromptStats(ps);
      setModels(m);
      setTools(t);
      setFiles(f);
    }).finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Loading…</div>;

  const maxToolCount = tools[0]?.count ?? 1;
  const maxFileCount = files[0]?.count ?? 1;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "28px" }}>

      {/* Prompt distribution */}
      {promptStats && promptStats.prompt_count > 0 && (
        <section>
          <SectionHeader title={`Prompt Distribution (${promptStats.prompt_count} prompts)`} />
          <div style={{ display: "flex", gap: "20px", flexWrap: "wrap" }}>
            <DistributionCard label="Input Tokens" dist={promptStats.input_tokens} />
            <DistributionCard label="Output Tokens" dist={promptStats.output_tokens} />
            <DistributionCard label="Total Tokens" dist={promptStats.total_tokens} />
          </div>
        </section>
      )}

      {/* Model usage */}
      {models.length > 0 && (
        <section>
          <SectionHeader title="Model Usage" />
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
            <thead>
              <tr>
                {["Model", "Responses", "Input", "Output", "Total"].map((h) => (
                  <th key={h} style={{ textAlign: "left", padding: "4px 10px 8px", color: "var(--text-tertiary)", fontWeight: 500, fontSize: "11px", borderBottom: "1px solid var(--border-subtle)" }}>
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {models.map((m) => (
                <tr key={m.model} style={{ borderBottom: "1px solid var(--border-subtle)" }}>
                  <td style={{ padding: "7px 10px", fontFamily: "var(--font-mono)", fontSize: "12px", color: "var(--text-primary)" }}>{fmtModel(m.model)}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{m.message_count}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{fmtK(m.input_tokens)}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{fmtK(m.output_tokens)}</td>
                  <td style={{ padding: "7px 10px", color: "var(--text-secondary)", fontFamily: "var(--font-mono)" }}>{fmtK(m.total_tokens)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      {/* Tool usage */}
      {tools.length > 0 && (
        <section>
          <SectionHeader title="Tool Usage" />
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {tools.slice(0, 15).map((t) => (
              <div key={t.tool} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", width: "140px", flexShrink: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {t.tool}
                </span>
                <CssBar value={t.count} max={maxToolCount} color="var(--accent-orange)" />
                <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", width: "40px", textAlign: "right", flexShrink: 0 }}>
                  {t.count}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Most-touched files */}
      {files.length > 0 && (
        <section>
          <SectionHeader title="Most-Touched Files" />
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            {files.slice(0, 15).map((f) => (
              <div key={f.file} style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                <span title={f.file} style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-secondary)", flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {shortPath(f.file)}
                </span>
                <CssBar value={f.count} max={maxFileCount} color="#60a5fa" />
                <span style={{ fontSize: "12px", fontFamily: "var(--font-mono)", color: "var(--text-tertiary)", width: "40px", textAlign: "right", flexShrink: 0 }}>
                  {f.count}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {!promptStats?.prompt_count && models.length === 0 && (
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
          No data yet — run some sessions first.
        </p>
      )}
    </div>
  );
}
