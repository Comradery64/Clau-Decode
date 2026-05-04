import { useState, useEffect } from "react";
import type { DailyBucket, SessionCostResponse, StatsResponse } from "../../api/types";
import { api } from "../../api/client";

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div style={{
      padding: "16px 20px",
      background: "var(--bg-tool-block)",
      borderRadius: "var(--radius-md)",
      border: "1px solid var(--border-subtle)",
      minWidth: "140px",
    }}>
      <div style={{ fontSize: "11px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: "6px" }}>{label}</div>
      <div style={{ fontSize: "20px", fontWeight: 600, color: "var(--text-primary)", fontFamily: "var(--font-mono)" }}>{value}</div>
    </div>
  );
}

function fmtTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(n);
}

function fmtUsd(n: number): string {
  if (n >= 1) return `$${n.toFixed(2)}`;
  return `$${n.toFixed(4)}`;
}

interface OverviewTabProps {
  stats: StatsResponse | null;
  daily: DailyBucket[];
  selectedSessionId: string | null;
}

export function OverviewTab({ stats, daily, selectedSessionId }: OverviewTabProps) {
  const [sessionCost, setSessionCost] = useState<SessionCostResponse | null>(null);

  useEffect(() => {
    if (!selectedSessionId) { setSessionCost(null); return; }
    api.getSessionCost(selectedSessionId).then(setSessionCost).catch(() => setSessionCost(null));
  }, [selectedSessionId]);

  const totalTokens = daily.reduce((a, b) => a + b.total, 0);
  const totalInput = daily.reduce((a, b) => a + b.input_tokens, 0);
  const totalOutput = daily.reduce((a, b) => a + b.output_tokens, 0);
  const totalCacheRead = daily.reduce((a, b) => a + b.cache_read_tokens, 0);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      <section>
        <h3 style={{ fontSize: "12px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 12px" }}>Global</h3>
        <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
          {stats && <StatCard label="Sessions" value={String(stats.total_sessions)} />}
          {stats && <StatCard label="Messages" value={fmtTokens(stats.total_messages)} />}
          <StatCard label="Total Tokens" value={fmtTokens(totalTokens)} />
          <StatCard label="Input Tokens" value={fmtTokens(totalInput)} />
          <StatCard label="Output Tokens" value={fmtTokens(totalOutput)} />
          <StatCard label="Cache Reads" value={fmtTokens(totalCacheRead)} />
        </div>
      </section>

      {selectedSessionId && (
        <section>
          <h3 style={{ fontSize: "12px", color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.07em", margin: "0 0 12px" }}>
            Selected Session Cost
          </h3>
          {sessionCost ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "12px" }}>
              <StatCard label="Model" value={sessionCost.model.replace("claude-", "")} />
              <StatCard label="Total Cost" value={fmtUsd(sessionCost.total_usd)} />
              <StatCard label="Input" value={fmtUsd(sessionCost.input_usd)} />
              <StatCard label="Output" value={fmtUsd(sessionCost.output_usd)} />
              <StatCard label="Cache Write" value={fmtUsd(sessionCost.cache_write_usd)} />
              <StatCard label="Cache Read" value={fmtUsd(sessionCost.cache_read_usd)} />
              {!sessionCost.pricing_known && (
                <div style={{ fontSize: "12px", color: "var(--text-tertiary)", alignSelf: "center" }}>
                  ⚠ Pricing not available for this model
                </div>
              )}
            </div>
          ) : (
            <div style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>Loading…</div>
          )}
        </section>
      )}

      {!selectedSessionId && (
        <p style={{ fontSize: "13px", color: "var(--text-tertiary)" }}>
          Select a session from the sidebar to see its cost breakdown.
        </p>
      )}
    </div>
  );
}
