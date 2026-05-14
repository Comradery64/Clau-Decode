import type { DailyBucket, DashboardData } from "../../api/types";
import { Sparkline } from "./Sparkline";
import { fmtCount, fmtUsd } from "./fmt";

export function StatStrip({ data, daily }: { data: DashboardData; daily: DailyBucket[] | null }) {
  // 7-day series. Empty/missing daily data → no spark rendered.
  const last7 = (daily || []).slice(-7);
  const sessionsSpark = last7.map((b) => b.session_count);
  const messagesSpark = last7.map((b) => b.prompt_count);

  const stats: Array<{ label: string; value: string; sub?: string; spark?: number[] }> = [
    { label: "Sessions", value: fmtCount(data.total_sessions), spark: sessionsSpark, sub: "7-day trend" },
    { label: "Messages", value: fmtCount(data.total_messages), spark: messagesSpark, sub: "7-day trend" },
    { label: "Recent cost", value: fmtUsd(data.total_cost_usd), sub: "last 10 sessions" },
  ];
  return (
    <div style={{
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      background: "var(--bg-tool-block)",
      border: "1px solid var(--border-subtle)",
      borderRadius: "var(--radius-md)",
      overflow: "hidden",
    }}>
      {stats.map((s, i) => (
        <div key={s.label} style={{
          padding: "16px 20px",
          display: "flex",
          flexDirection: "column",
          gap: "4px",
          borderLeft: i === 0 ? "none" : "1px solid var(--border-subtle)",
        }}>
          <div style={{
            fontSize: "10.5px",
            color: "var(--text-tertiary)",
            textTransform: "uppercase",
            letterSpacing: "0.09em",
            fontWeight: 600,
          }}>
            {s.label}
          </div>
          <div style={{ display: "flex", alignItems: "flex-end", justifyContent: "space-between", gap: "8px" }}>
            <div style={{
              fontSize: "26px",
              fontWeight: 600,
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
              lineHeight: 1.1,
              letterSpacing: "-0.02em",
            }}>
              {s.value}
            </div>
            {s.spark && s.spark.length >= 2 && (
              <Sparkline values={s.spark} />
            )}
          </div>
          {s.sub && (
            <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "1px" }}>{s.sub}</div>
          )}
        </div>
      ))}
    </div>
  );
}
