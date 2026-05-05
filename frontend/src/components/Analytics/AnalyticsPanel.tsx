import { useState, useEffect, useCallback } from "react";
import { api } from "../../api/client";
import type { DailyBucket, PricingTableResponse, StatsResponse } from "../../api/types";
import { useAppStore } from "../../store";
import { OverviewTab } from "./OverviewTab";
import { DailyTab } from "./DailyTab";
import { PricingTab } from "./PricingTab";
import { StatsTab } from "./StatsTab";

const TABS = ["Overview", "Daily", "Pricing", "Stats"] as const;
type Tab = (typeof TABS)[number];

export default function AnalyticsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [daily, setDaily] = useState<DailyBucket[]>([]);
  const [pricing, setPricing] = useState<PricingTableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const selectedSessionId = useAppStore((s) => s.selectedSessionId);

  const fetchAll = useCallback(async () => {
    setLoading(true);
    try {
      const [s, d, p] = await Promise.all([
        api.getStats(),
        api.getDailyAnalytics(),
        api.getPricingTable(),
      ]);
      setStats(s);
      setDaily(d);
      setPricing(p);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  useEffect(() => {
    const handler = () => { void fetchAll(); };
    window.addEventListener("clau-decode:refresh", handler);
    return () => window.removeEventListener("clau-decode:refresh", handler);
  }, [fetchAll]);

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-base)" }}>
      {/* Tab bar */}
      <div style={{ display: "flex", gap: "2px", padding: "12px 20px 0", borderBottom: "1px solid var(--border-subtle)" }}>
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            style={{
              padding: "6px 14px",
              fontSize: "13px",
              fontWeight: activeTab === tab ? 600 : 400,
              color: activeTab === tab ? "var(--text-primary)" : "var(--text-tertiary)",
              background: "none",
              border: "none",
              borderBottom: activeTab === tab ? "2px solid var(--accent-orange)" : "2px solid transparent",
              cursor: "pointer",
              marginBottom: "-1px",
            }}
          >
            {tab}
          </button>
        ))}
        {loading && (
          <span style={{ marginLeft: "auto", fontSize: "12px", color: "var(--text-tertiary)", alignSelf: "center" }}>
            loading…
          </span>
        )}
      </div>

      {/* Tab content */}
      <div style={{ flex: 1, overflow: "auto", padding: "20px" }}>
        {activeTab === "Overview" && (
          <OverviewTab stats={stats} daily={daily} selectedSessionId={selectedSessionId} />
        )}
        {activeTab === "Daily" && <DailyTab daily={daily} />}
        {activeTab === "Pricing" && <PricingTab pricing={pricing} />}
        {activeTab === "Stats" && <StatsTab />}
      </div>
    </div>
  );
}
