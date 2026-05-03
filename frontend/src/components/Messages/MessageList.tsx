import { useEffect, useRef, useState } from "react";

import type { SessionDetail } from "../../api/types";
import { api } from "../../api/client";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { groupMessages } from "./groupMessages";

// ---------------------------------------------------------------------------
// LoadingSpinner — inline because it's only used here
// ---------------------------------------------------------------------------

function LoadingSpinner() {
  return (
    <div style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
      <div
        style={{
          width: "32px",
          height: "32px",
          border: "3px solid var(--border-default)",
          borderTopColor: "var(--accent-orange)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
        }}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageList
// ---------------------------------------------------------------------------

interface MessageListProps {
  sessionId: string;
}

export default function MessageList({ sessionId }: MessageListProps) {
  const [detail, setDetail] = useState<SessionDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const scrolledSessionRef = useRef<string | null>(null);
  // True when the user is at or near the bottom — streaming snaps only when true
  const nearBottomRef = useRef(true);

  // Fetch session when sessionId changes
  useEffect(() => {
    setLoading(true);
    setDetail(null);
    nearBottomRef.current = true;
    api
      .getSession(sessionId)
      .then(setDetail)
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [sessionId]);

  // Track whether the user is reading history (scrolled up) vs at the bottom.
  // Resets on session change (above). Used by the streaming auto-scroll below.
  useEffect(() => {
    const container = document.getElementById("message-list-container");
    if (!container) return;
    const onScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      nearBottomRef.current = dist < 80;
    };
    container.addEventListener("scroll", onScroll, { passive: true });
    return () => container.removeEventListener("scroll", onScroll);
  }, [sessionId]);

  // Streaming auto-scroll: after first load, snap to bottom on every new detail
  // update (SSE/refresh) as long as the user hasn't scrolled up to read history.
  useEffect(() => {
    if (!detail || detail.id !== sessionId) return;
    if (scrolledSessionRef.current !== sessionId) return; // first-load effect handles this
    if (!nearBottomRef.current) return;
    const container = document.getElementById("message-list-container");
    if (container) container.scrollTop = container.scrollHeight;
  }, [detail, sessionId]);

  // Scroll to bottom on first load of each session. Markdown + syntax
  // highlighting render asynchronously over many seconds for long chats, so
  // fixed-time retries miss the final layout. Instead we observe the inner
  // content for resize and keep snapping to bottom — until either the user
  // scrolls up themselves, or 5s of layout-stable time has passed.
  useEffect(() => {
    // Guard: detail.id must match current sessionId. When the user clicks a new
    // session, React re-runs this effect with the new sessionId but the previous
    // detail still in state (not yet cleared). Without this check, stale detail
    // would claim scrolledSessionRef for the new session, preventing the real
    // scroll when the correct detail arrives.
    if (!detail || detail.id !== sessionId) return;
    if (scrolledSessionRef.current === sessionId) return;
    scrolledSessionRef.current = sessionId;

    const container = document.getElementById("message-list-container");
    if (!container) return;

    let stickToBottom = true;
    const snap = () => {
      if (stickToBottom) container.scrollTop = container.scrollHeight;
    };

    // Stop sticking when the user intentionally scrolls up (>24px from bottom).
    // Using a threshold because our own snap() also fires scroll events.
    const onUserScroll = () => {
      const dist = container.scrollHeight - container.scrollTop - container.clientHeight;
      if (dist > 24) stickToBottom = false;
    };
    container.addEventListener("scroll", onUserScroll, { passive: true });

    // ResizeObserver fires whenever the inner content grows (syntax highlighting,
    // images loading, etc.), keeping us at the bottom throughout.
    let ro: ResizeObserver | null = null;
    const inner = container.firstElementChild as HTMLElement | null;
    if (inner) {
      ro = new ResizeObserver(snap);
      ro.observe(inner);
    }

    // Immediate snap + 100ms polling as belt-and-suspenders for any resize
    // that fires before the ResizeObserver is set up.
    snap();
    const interval = setInterval(snap, 100);

    // After 5s, stop overriding user scroll position.
    const timeout = setTimeout(() => {
      stickToBottom = false;
      clearInterval(interval);
    }, 5000);

    return () => {
      ro?.disconnect();
      container.removeEventListener("scroll", onUserScroll);
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [detail, sessionId]);

  // Listen for live-reload refresh events dispatched by App.tsx
  useEffect(() => {
    const handler = () => {
      api.getSession(sessionId).then(setDetail).catch(console.error);
    };
    window.addEventListener("clau-decode:refresh", handler);
    return () => window.removeEventListener("clau-decode:refresh", handler);
  }, [sessionId]);

  if (loading) return <LoadingSpinner />;
  if (!detail) return null;

  const turns = groupMessages(detail.messages);

  return (
    <div
      style={{
        maxWidth: "var(--message-max-width)",
        margin: "0 auto",
        padding: "32px 0 48px",
        width: "100%",
        overflowX: "hidden",
      }}
    >
      {turns.map((turn, i) => {
        if (turn.kind === "user") {
          return <UserMessage key={turn.message.id} message={turn.message} />;
        }
        return (
          <AssistantMessage
            key={`assistant-turn-${i}`}
            messages={turn.messages}
            model={turn.model}
          />
        );
      })}
    </div>
  );
}
