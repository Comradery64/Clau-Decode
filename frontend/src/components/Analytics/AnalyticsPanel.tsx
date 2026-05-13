import { useState, useEffect, useRef } from "react";
import { api } from "../../api/client";
import type { DailyBucket, PricingTableResponse, StatsResponse } from "../../api/types";
import { useAppStore } from "../../store";
import { on } from "../../utils/events";
import { OverviewTab } from "./OverviewTab";
import { DailyTab } from "./DailyTab";
import { PricingTab } from "./PricingTab";
import { StatsTab } from "./StatsTab";
import { TipsTab } from "./TipsTab";
import { ScrollContainer } from "../ScrollContainer";

const TABS = ["Overview", "Daily", "Pricing", "Stats", "Tips"] as const;
type Tab = (typeof TABS)[number];

async function fetchAll(
  setStats: (s: StatsResponse | null) => void,
  setDaily: (d: DailyBucket[]) => void,
  setPricing: (p: PricingTableResponse | null) => void,
  setLoading: (l: boolean) => void,
) {
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
}

export default function AnalyticsPanel() {
  const [activeTab, setActiveTab] = useState<Tab>("Overview");
  const [stats, setStats] = useState<StatsResponse | null>(null);
  const [daily, setDaily] = useState<DailyBucket[]>([]);
  const [pricing, setPricing] = useState<PricingTableResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const selectedSessionId = useAppStore((s) => s.selectedSessionId);

  // Use a ref so the refresh listener always calls the latest setters without
  // re-registering the event listener on every render.
  const fetchRef = useRef(() => fetchAll(setStats, setDaily, setPricing, setLoading));
  fetchRef.current = () => fetchAll(setStats, setDaily, setPricing, setLoading);

  useEffect(() => { fetchRef.current(); }, []);

  useEffect(() => {
    return on("refresh", () => { fetchRef.current(); });
  }, []);

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
      <ScrollContainer style={{ flex: 1, padding: "20px" }}>
        {activeTab === "Overview" && (
          <OverviewTab stats={stats} daily={daily} selectedSessionId={selectedSessionId} />
        )}
        {activeTab === "Daily" && <DailyTab daily={daily} />}
        {activeTab === "Pricing" && <PricingTab pricing={pricing} />}
        {activeTab === "Stats" && <StatsTab />}
        {activeTab === "Tips" && <TipsTab />}
      </ScrollContainer>
    </div>
  );
}
