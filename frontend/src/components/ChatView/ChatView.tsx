import { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from "react";
import { OverlayScrollbarsComponent } from "overlayscrollbars-react";
import type { AppConfig, PermissionMode, Recap, Session } from "../../api/types";
import { api } from "../../api/client";
import { useAppStore } from "../../store";
import { lsGetMap, lsGetRaw, lsSetRaw, LS } from "../../utils/localStorage";
import { on } from "../../utils/events";
import { SCROLLBAR_OPTIONS } from "../ScrollContainer";
import { EmptyState } from "./EmptyState";
import { ConversationHeader } from "./ConversationHeader";
import { MessageList } from "./MessageListLoader";
import { MessageListContainerCtx } from "./MessageListContainerContext";
import { ChatInput } from "./ChatInput";
import { useSessionDetail, isSessionActive } from "../Messages/hooks/useSessionDetail";
import { groupMessages } from "../Messages/groupMessages";
import { useExpandPreserveAnchor } from "./hooks/useExpandPreserveAnchor";
import { useScrollPositionMemory } from "./hooks/useScrollPositionMemory";

function readLastActive(sessionId: string): number | null {
  const raw = lsGetRaw(LS.SESSION_LAST_ACTIVE_PREFIX + sessionId);
  if (!raw) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

function writeLastActive(sessionId: string, ts: number = Date.now()): void {
  lsSetRaw(LS.SESSION_LAST_ACTIVE_PREFIX + sessionId, String(ts));
}

export default function ChatView() {
  const selectedSessionId = useAppStore((s) => s.selectedSessionId);
  const [session, setSession] = useState<Session | null>(null);
  const [appConfig, setAppConfig] = useState<AppConfig | null>(null);
  const [recaps, setRecaps] = useState<Recap[]>([]);
  const [recapGenerating, setRecapGenerating] = useState<boolean>(false);
  const osRef = useRef<React.ComponentRef<typeof OverlayScrollbarsComponent>>(null);
  const scrollEl = useRef<HTMLElement | null>(null);
  const containerRef = useMemo(() => ({ current: null as HTMLElement | null }), []);

  useEffect(() => {
    api.getConfig().then(setAppConfig).catch(() => {});
  }, []);

  const regenerateRecap = useCallback((sessionId: string, replaceId?: number) => {
    if (replaceId !== undefined) {
      api.dismissRecap(sessionId, replaceId).catch(() => {});
      setRecaps((prev) => prev.filter((r) => r.id !== replaceId));
    }
    setRecapGenerating(true);
    api
      .generateRecap(sessionId)
      .then((r) => {
        setRecaps((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
      })
      .catch(() => {})
      .finally(() => setRecapGenerating(false));
  }, []);

  const dismissRecap = useCallback((sessionId: string, recapId: number) => {
    setRecaps((prev) => prev.filter((r) => r.id !== recapId));
    api.dismissRecap(sessionId, recapId).catch(() => {});
  }, []);

  // Track per-session "last active" timestamp.
  useEffect(() => {
    if (!selectedSessionId) return;
    const touch = () => writeLastActive(selectedSessionId);
    const onVis = () => { if (!document.hidden) touch(); };
    touch();
    document.addEventListener("visibilitychange", onVis);
    const offRefresh = on("refresh", () => {
      if (!document.hidden) touch();
    });
    return () => {
      writeLastActive(selectedSessionId);
      document.removeEventListener("visibilitychange", onVis);
      offRefresh();
    };
  }, [selectedSessionId]);

  // On navigating to a session, load prior recaps and (if idle long enough) generate a new one.
  useEffect(() => {
    if (!selectedSessionId) { setRecaps([]); return; }
    let cancelled = false;
    const sid = selectedSessionId;
    const lastActive = readLastActive(sid);
    const idleMin = lastActive == null ? Infinity : (Date.now() - lastActive) / 60000;

    api.listRecaps(sid).then((rs) => {
      if (!cancelled) setRecaps(rs);
    }).catch(() => {});

    if (
      appConfig?.claude_recap_enabled &&
      lastActive != null &&
      idleMin >= appConfig.claude_recap_idle_minutes &&
      (session?.message_count ?? 0) > 0
    ) {
      setRecapGenerating(true);
      api.generateRecap(sid).then((r) => {
        if (!cancelled) {
          setRecaps((prev) => (prev.some((x) => x.id === r.id) ? prev : [...prev, r]));
        }
      }).catch(() => {}).finally(() => {
        if (!cancelled) setRecapGenerating(false);
      });
    }

    return () => { cancelled = true; };
  }, [selectedSessionId, appConfig, session?.message_count]);

  useLayoutEffect(() => {
    const instance = osRef.current?.osInstance();
    if (instance) {
      const vp = instance.elements().viewport;
      scrollEl.current = vp;
      containerRef.current = vp;
    }
  });

  useScrollPositionMemory(scrollEl, selectedSessionId);

  useEffect(() => {
    if (!selectedSessionId) { setSession(null); return; }
    let cancelled = false;
    api
      .getSession(selectedSessionId)
      .then((detail) => {
        if (!cancelled) {
          const renamed = lsGetMap(LS.RENAMED)[selectedSessionId];
          setSession(renamed ? { ...detail, title: renamed } : detail);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedSessionId]);

  useEffect(() => {
    return on("rename", ({ id, title }) => {
      if (id === selectedSessionId) {
        setSession((prev) => prev ? { ...prev, title } : prev);
      }
    });
  }, [selectedSessionId]);

  useExpandPreserveAnchor(scrollEl);

  if (!selectedSessionId) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          background: "var(--bg-base)",
        }}
      >
        <EmptyState />
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      <ConversationHeader session={session} />
      <OverlayScrollbarsComponent
        ref={osRef}
        options={SCROLLBAR_OPTIONS}
        style={{ flex: 1 }}
      >
        <MessageListContainerCtx.Provider value={containerRef}>
          <MessageList
            sessionId={selectedSessionId}
            recaps={recaps}
            recapGenerating={recapGenerating}
            onDismissRecap={(id) => dismissRecap(selectedSessionId, id)}
            onRegenerateRecap={(id) => regenerateRecap(selectedSessionId, id)}
          />
        </MessageListContainerCtx.Provider>
      </OverlayScrollbarsComponent>
      <ChatInputBar
        sessionId={selectedSessionId}
        session={session}
        defaultPermissionMode={appConfig?.claude_default_permission_mode ?? "dontAsk"}
      />
    </div>
  );
}

function ChatInputBar({
  sessionId,
  session,
  defaultPermissionMode,
}: {
  sessionId: string;
  session: Session | null;
  defaultPermissionMode: PermissionMode;
}) {
  const { detail, sseTimedOut } = useSessionDetail(sessionId);
  const turns = useMemo(() => (detail ? groupMessages(detail.messages) : []), [detail]);
  const serverActive = isSessionActive(turns);
  // If SSE has timed out, ignore the stale "active" flag — the session is dead, not streaming.
  const effectiveActive = serverActive && !sseTimedOut;
  return (
    <ChatInput
      sessionId={sessionId}
      isStreaming={effectiveActive}
      disabled={!!session?.is_fork}
      onStop={() => { api.stopMessage(sessionId).catch(() => {}); }}
      defaultPermissionMode={defaultPermissionMode}
    />
  );
}
