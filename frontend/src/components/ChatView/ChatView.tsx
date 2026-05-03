import { useState, useEffect } from "react";
import type { Session } from "../../api/types";
import { api } from "../../api/client";
import { useAppStore } from "../../store";
import { EmptyState } from "./EmptyState";
import { ConversationHeader } from "./ConversationHeader";
import { MessageList } from "./MessageListLoader";

export default function ChatView() {
  const selectedSessionId = useAppStore((s) => s.selectedSessionId);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!selectedSessionId) { setSession(null); return; }
    let cancelled = false;
    api
      .getSession(selectedSessionId)
      .then((detail) => { if (!cancelled) setSession(detail); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedSessionId]);

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
      <div
        id="message-list-container"
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}
      >
        <MessageList sessionId={selectedSessionId} />
      </div>
    </div>
  );
}
