import { useEffect, useRef, useState } from "react";

import type { SessionDetail } from "../../api/types";
import { api } from "../../api/client";
import { getCached, setCached, invalidateCached } from "../../api/sessionCache";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { groupMessages, type Turn } from "./groupMessages";
import { StreamingIndicator } from "./StreamingIndicator";

// Claude is still working if the last turn is a user turn (no response yet),
// or if the last assistant turn's final message has no text blocks (mid-tool-loop).
function isSessionActive(turns: Turn[]): boolean {
  if (turns.length === 0) return false;
  const last = turns[turns.length - 1];
  if (last.kind === "user") return true;
  const lastMsg = last.messages[last.messages.length - 1];
  return !lastMsg.content_blocks.some((b) => b.type === "text");
}

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
  const cached = getCached(sessionId);
  const [detail, setDetail] = useState<SessionDetail | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);
  const scrolledSessionRef = useRef<string | null>(null);
  // True when the user is at or near the bottom — streaming snaps only when true
  const nearBottomRef = useRef(true);

  // Fetch session when sessionId changes. If we have a cached copy, render it
  // immediately and background-refresh to pick up any server-side changes.
  useEffect(() => {
    const hit = getCached(sessionId);
    if (!hit) {
      setLoading(true);
      setDetail(null);
    } else {
      setDetail(hit);
      setLoading(false);
    }
    nearBottomRef.current = true;
    api
      .getSession(sessionId)
      .then((d) => { setCached(sessionId, d); setDetail(d); setLoading(false); })
      .catch(console.error);
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
      invalidateCached(sessionId);
      api.getSession(sessionId).then((d) => { setCached(sessionId, d); setDetail(d); }).catch(console.error);
    };
    window.addEventListener("clau-decode:refresh", handler);
    return () => window.removeEventListener("clau-decode:refresh", handler);
  }, [sessionId]);

  // Streaming indicator timeout: hide the "Focusing…" indicator if no new
  // messages arrive within 2 minutes. Handles cancelled/exited sessions where
  // Claude Code stopped writing to the JSONL without producing a response.
  // Resets on every detail update (SSE-triggered re-fetch), so long-running
  // sessions with active tool use keep the indicator alive.
  const [sseTimedOut, setSseTimedOut] = useState(false);
  useEffect(() => {
    if (!detail) { setSseTimedOut(false); return; }
    const active = isSessionActive(groupMessages(detail.messages));
    if (!active) { setSseTimedOut(false); return; }
    setSseTimedOut(false);
    const id = setTimeout(() => setSseTimedOut(true), 2 * 60_000);
    return () => clearTimeout(id);
  }, [detail]);

  if (loading) return <LoadingSpinner />;
  if (!detail) return null;

  const turns = groupMessages(detail.messages);

  // Determine if Claude is currently working on this session.
  const isActive = isSessionActive(turns);
  let lastUserTimestamp: string | null = null;
  if (isActive) {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t.kind === "user") { lastUserTimestamp = t.message.timestamp; break; }
    }
  }

  // Accumulated input tokens from all assistant messages (proxy for context size).
  const totalInputTokens = detail.messages
    .filter((m) => m.role === "assistant")
    .reduce((sum, m) => sum + (m.usage?.input_tokens ?? 0), 0);

  // True if any assistant message in this session included extended thinking.
  const hasThinking = detail.messages.some((m) =>
    m.content_blocks.some((b) => b.type === "thinking")
  );

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
      {isActive && !sseTimedOut && (
        <StreamingIndicator
          lastUserTimestamp={lastUserTimestamp}
          totalInputTokens={totalInputTokens}
          hasThinking={hasThinking}
        />
      )}
    </div>
  );
}
