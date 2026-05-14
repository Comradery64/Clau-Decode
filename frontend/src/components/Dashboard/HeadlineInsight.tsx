import React from "react";
import type { DailyBucket, ModelUsageEntry, ToolUsageEntry } from "../../api/types";
import { fmtModel } from "./fmt";

export type Insight = {
  ruleId: string;
  body: React.ReactNode;
};

export function pickInsight(
  daily: DailyBucket[] | null,
  toolUsage: ToolUsageEntry[] | null,
  modelUsage: ModelUsageEntry[] | null,
): Insight | null {
  const fmtPct = (n: number) => `${Math.round(n)}%`;
  // Sum last 7 vs prior 7 from daily buckets (chronological order from API).
  if (daily && daily.length >= 14) {
    const sorted = [...daily].sort((a, b) => a.day.localeCompare(b.day));
    const last7 = sorted.slice(-7);
    const prior7 = sorted.slice(-14, -7);
    const lastMsgs = last7.reduce((a, b) => a + b.prompt_count, 0);
    const priorMsgs = prior7.reduce((a, b) => a + b.prompt_count, 0);
    if (priorMsgs >= 20) {
      if (lastMsgs >= priorMsgs * 1.5) {
        const pct = Math.round(((lastMsgs - priorMsgs) / priorMsgs) * 100);
        return {
          ruleId: "big-week",
          body: (
            <>Active week — <b>{lastMsgs} messages</b>, up {pct}% from last week.</>
          ),
        };
      }
      if (lastMsgs <= priorMsgs * 0.5) {
        return {
          ruleId: "cooling-off",
          body: (
            <>Quieter week — <b>{lastMsgs} messages</b>, down from {priorMsgs}.</>
          ),
        };
      }
    }
  }

  // Model shift: top model's share in last 7 days vs prior 7.
  if (daily && daily.length >= 14 && modelUsage && modelUsage.length > 0) {
    // ModelUsage is overall, not time-windowed, so use it only for the leader name.
    const top = modelUsage[0];
    const overallTotal = modelUsage.reduce((a, m) => a + m.total_tokens, 0);
    if (overallTotal > 0) {
      const share = (top.total_tokens / overallTotal) * 100;
      if (share >= 60) {
        return {
          ruleId: "model-share",
          body: (
            <>
              <b>{fmtModel(top.model)}</b> is your go-to — {fmtPct(share)} of recent tokens.
            </>
          ),
        };
      }
    }
  }

  // Top tool fallback — only when usage is meaningful.
  if (toolUsage && toolUsage.length > 0) {
    const top = toolUsage[0];
    if (top.count >= 50) {
      return {
        ruleId: "top-tool",
        body: (
          <>Your most-used tool is <b>{top.tool}</b> ({top.count.toLocaleString()} calls).</>
        ),
      };
    }
  }

  return null;
}

export function HeadlineInsight({ insight }: { insight: Insight }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: "10px",
        padding: "10px 14px",
        background: "var(--bg-tool-block)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        fontSize: "13px",
        color: "var(--text-secondary)",
        lineHeight: 1.5,
      }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="var(--accent-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, opacity: 0.85 }} aria-hidden="true">
        <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
      </svg>
      <span style={{ minWidth: 0 }}>{insight.body}</span>
    </div>
  );
}
