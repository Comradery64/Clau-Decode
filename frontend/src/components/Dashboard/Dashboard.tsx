import { useState, useEffect, useMemo, useRef } from "react";
import { api } from "../../api/client";
import type { DailyBucket, DashboardData, FileTouchEntry, ToolUsageEntry } from "../../api/types";
import { useAppStore } from "../../store";
import { on } from "../../utils/events";
import { navigateTo } from "../../router";
import { ScrollContainer } from "../ScrollContainer";

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
import { DashboardEmpty } from "./DashboardEmpty";

export default function Dashboard() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [daily, setDaily] = useState<DailyBucket[] | null>(null);
  const [touchedFiles, setTouchedFiles] = useState<FileTouchEntry[] | null>(null);
  const [toolUsage, setToolUsage] = useState<ToolUsageEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const selectProject = useAppStore((s) => s.selectProject);
  const openSearch = useAppStore((s) => s.openSearch);
  const setViewingFilePath = useAppStore((s) => s.setViewingFilePath);

  // Drive chat navigation through the URL so back/forward + "copy link" work
  // identically to the sidebar; bottom-snap in MessageList lands the user at
  // the most recent message ("where you left off").
  const goToChat = (id: string) => navigateTo(`/chat/${id}`);

  const fetchRef = useRef(() => {});
  fetchRef.current = () => {
    setLoading(true);
    api.getDashboard()
      .then(setData)
      .finally(() => setLoading(false));
    // Side-fetches populate progressively; failures degrade gracefully.
    api.getDailyAnalytics().then(setDaily).catch(() => setDaily([]));
    api.getFileTouches().then(setTouchedFiles).catch(() => setTouchedFiles([]));
    api.getToolUsage().then(setToolUsage).catch(() => setToolUsage([]));
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
        <div style={{
          width: "32px",
          height: "32px",
          border: "3px solid var(--border-default)",
          borderTopColor: "var(--accent-orange)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }} />
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
