import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "../../api/client";
import type { DailyBucket, DashboardData, FileTouchEntry, PricingTableResponse, ToolUsageEntry } from "../../api/types";
import { useAppStore } from "../../store";
import { on } from "../../utils/events";
import { navigateTo } from "../../router";
import { ScrollContainer } from "../ScrollContainer";
import { LoadingAnimation } from "../ui/LoadingAnimation";

import { Hero } from "./Hero";
import { SectionHeader } from "./SectionHeader";
import { HeadlineInsight, pickInsight } from "./HeadlineInsight";
import { FeaturedSession, SessionRow } from "./FeaturedSession";
import { ActivityStrip } from "./ActivityStrip";
import { StatStrip } from "./StatStrip";
import { ModelUsageStrip } from "./ModelUsageStrip";
import { TouchedFilesList } from "./TouchedFilesList";
import { ProjectStrip } from "./ProjectStrip";
import { TipCard } from "./TipCard";
import { ModelRates } from "./ModelRates";
import { DashboardEmpty } from "./DashboardEmpty";

// Module-level cache so navigating away and back — or a refresh-driven
// refetch — shows the last dashboard *instantly* (stale-while-revalidate)
// instead of flashing through a blank state while analytics reload. Survives
// remounts for the page session; a full reload clears it.
const _cache: {
  data: DashboardData | null;
  daily: DailyBucket[] | null;
  touchedFiles: FileTouchEntry[] | null;
  toolUsage: ToolUsageEntry[] | null;
  pricing: PricingTableResponse | null;
} = { data: null, daily: null, touchedFiles: null, toolUsage: null, pricing: null };

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(_cache.data);
  const [daily, setDaily] = useState<DailyBucket[] | null>(_cache.daily);
  const [touchedFiles, setTouchedFiles] = useState<FileTouchEntry[] | null>(_cache.touchedFiles);
  const [toolUsage, setToolUsage] = useState<ToolUsageEntry[] | null>(_cache.toolUsage);
  const [pricing, setPricing] = useState<PricingTableResponse | null>(_cache.pricing);
  const [loading, setLoading] = useState(_cache.data === null);
  const selectProject = useAppStore((s) => s.selectProject);
  const openSearch = useAppStore((s) => s.openSearch);
  const setViewingFilePath = useAppStore((s) => s.setViewingFilePath);

  // Drive chat navigation through the URL so back/forward + "copy link" work
  // identically to the sidebar; bottom-snap in MessageList lands the user at
  // the most recent message ("where you left off").
  const goToChat = (id: string) => navigateTo(`/chat/${id}`);

  const fetchRef = useRef(() => {});
  fetchRef.current = () => {
    // Only show the loading screen when we have nothing cached to display.
    // A refresh/remount with cached data revalidates silently in the
    // background — the sections stay put and update in place on arrival.
    if (_cache.data === null) setLoading(true);
    api.getDashboard()
      .then((d) => { _cache.data = d; setData(d); })
      .finally(() => setLoading(false));
    // Side-fetches update in place on success. On failure we KEEP the last
    // good value rather than blanking the section — a transient slow/failed
    // reload must never tear down the activity strip, sparklines, or insight.
    api.getDailyAnalytics().then((d) => { _cache.daily = d; setDaily(d); }).catch(() => {});
    api.getFileTouches().then((d) => { _cache.touchedFiles = d; setTouchedFiles(d); }).catch(() => {});
    api.getToolUsage().then((d) => { _cache.toolUsage = d; setToolUsage(d); }).catch(() => {});
    api.getPricingTable().then((p) => { _cache.pricing = p; setPricing(p); }).catch(() => {});
  };

  const insight = useMemo(
    () => pickInsight(daily, toolUsage, data?.model_usage ?? null),
    [daily, toolUsage, data?.model_usage],
  );

  useEffect(() => { fetchRef.current(); }, []);
  useEffect(() => { return on("refresh", () => { fetchRef.current(); }); }, []);

  if (loading && !data) {
    return (
      <div style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center" }}>
        <LoadingAnimation width="102px" label="Loading dashboard" />
      </div>
    );
  }

  if (!data) return null;

  const isEmpty = data.total_sessions === 0 && data.recent_sessions.length === 0;
  const [featured, ...rest] = data.recent_sessions;

  return (
    <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden", background: "var(--bg-base)" }}>
      <ScrollContainer style={{ flex: 1, padding: "36px 32px 48px" }}>
        <div style={{ maxWidth: "820px", margin: "0 auto", display: "flex", flexDirection: "column", gap: "36px" }}>

          <Hero totalSessions={data.total_sessions} />

          {insight && <HeadlineInsight insight={insight} />}

          {isEmpty ? (
            <DashboardEmpty onSearch={openSearch} />
          ) : (
            <>
              {featured && (
                <FeaturedSession session={featured} onClick={() => goToChat(featured.id)} />
              )}

              {daily && daily.length > 0 && <ActivityStrip daily={daily} />}

              <StatStrip data={data} daily={daily} />

              {data.model_usage.length > 0 && (
                <section>
                  <SectionHeader title="Model distribution" hint="by tokens, recent" />
                  <ModelUsageStrip models={data.model_usage} />
                </section>
              )}

              {pricing && <ModelRates pricing={pricing} />}

              {rest.length > 0 && (
                <section>
                  <SectionHeader title="Recent activity" hint={`${rest.length} more`} />
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                    {rest.map((s) => (
                      <SessionRow key={s.id} session={s} onClick={() => goToChat(s.id)} />
                    ))}
                  </div>
                </section>
              )}

              {touchedFiles && touchedFiles.length > 0 && (
                <section>
                  <SectionHeader title="Most touched files" hint="recent sessions" />
                  <TouchedFilesList
                    entries={touchedFiles.slice(0, 8)}
                    onOpen={setViewingFilePath}
                  />
                </section>
              )}

              {data.projects.length > 0 && (
                <section>
                  <SectionHeader title="Projects" hint={`${data.projects.length} total`} />
                  <ProjectStrip projects={data.projects} onSelect={selectProject} />
                </section>
              )}

              {data.tips.length > 0 && (
                <section>
                  <SectionHeader title="Optimization tips" />
                  <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                    {data.tips.map((t) => (
                      <TipCard key={t.rule_id} tip={t} />
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

        </div>
      </ScrollContainer>
    </div>
  );
}
