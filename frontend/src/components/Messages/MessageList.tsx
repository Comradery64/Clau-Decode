import { useRef, useContext } from "react";

import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { groupMessages } from "./groupMessages";
import { StreamingIndicator } from "./StreamingIndicator";
import { useAppStore } from "../../store";
import { MessageListContainerCtx } from "../ChatView/MessageListContainerContext";
import { useSessionDetail, isSessionActive } from "./hooks/useSessionDetail";
import { useSnapToBottom } from "./hooks/useSnapToBottom";
import { useSearchScroll } from "./hooks/useSearchScroll";

// ---------------------------------------------------------------------------
// CommandBadge — shown for slash command records (/exit, /compact, etc.)
// ---------------------------------------------------------------------------

function CommandBadge({ command, timestamp }: { command: string; timestamp: string | null }) {
  const time = timestamp
    ? new Date(timestamp).toLocaleString("en-US", {
        month: "short", day: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      })
    : null;
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "8px 24px",
        gap: "8px",
      }}
    >
      <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
      <span
        style={{
          fontSize: "11px",
          fontFamily: "var(--font-mono)",
          color: "var(--text-tertiary)",
          background: "var(--bg-sidebar)",
          border: "1px solid var(--border-subtle)",
          borderRadius: "var(--radius-sm)",
          padding: "2px 8px",
          whiteSpace: "nowrap",
        }}
      >
        {command}
        {time && (
          <span style={{ opacity: 0.6, marginLeft: "6px", fontFamily: "var(--font-ui)" }}>
            {time}
          </span>
        )}
      </span>
      <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// LoadingSpinner — inline because it's only used here
// ---------------------------------------------------------------------------

function LoadingSpinner() {
  return (
    <div role="status" aria-label="Loading conversation" style={{ display: "flex", justifyContent: "center", padding: "48px" }}>
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
  const pendingScrollMessageId = useAppStore((s) => s.pendingScrollMessageId);
  const setPendingScrollMessageId = useAppStore((s) => s.setPendingScrollMessageId);
  const containerRef = useContext(MessageListContainerCtx);
  const msgToAnchorRef = useRef(new Map<string, string>());

  const { detail, loading, sseTimedOut } = useSessionDetail(sessionId);
  useSnapToBottom(containerRef, detail, sessionId, pendingScrollMessageId);
  useSearchScroll(containerRef, detail, sessionId, msgToAnchorRef, pendingScrollMessageId, setPendingScrollMessageId);

  if (loading) return <LoadingSpinner />;
  if (!detail) return null;

  const turns = groupMessages(detail.messages);

  // Rebuild the message→anchor map so the scroll effect has up-to-date data.
  {
    const map = new Map<string, string>();
    for (const turn of turns) {
      if (turn.kind === "user" || turn.kind === "command") {
        map.set(turn.message.id, turn.message.id);
      } else {
        const anchor = turn.messages[0]?.id;
        if (anchor) for (const m of turn.messages) map.set(m.id, anchor);
      }
    }
    msgToAnchorRef.current = map;
  }

  const isActive = isSessionActive(turns);
  let lastUserTimestamp: string | null = null;
  if (isActive) {
    for (let i = turns.length - 1; i >= 0; i--) {
      const t = turns[i];
      if (t.kind === "user") { lastUserTimestamp = t.message.timestamp; break; }
    }
  }

  const totalInputTokens = detail.messages
    .filter((m) => m.role === "assistant")
    .reduce((sum, m) => sum + (m.usage?.input_tokens ?? 0), 0);

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
          return (
            <div key={turn.message.id} data-message-id={turn.message.id} className="turn-anchor">
              <UserMessage message={turn.message} />
            </div>
          );
        }
        if (turn.kind === "command") {
          return (
            <div key={turn.message.id} data-message-id={turn.message.id} className="turn-anchor">
              <CommandBadge command={turn.command} timestamp={turn.message.timestamp} />
            </div>
          );
        }
        const anchorId = turn.messages[0]?.id ?? `assistant-turn-${i}`;
        return (
          <div key={`assistant-turn-${i}`} data-message-id={anchorId} className="turn-anchor">
            <AssistantMessage
              messages={turn.messages}
              model={turn.model}
              sessionId={sessionId}
            />
          </div>
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
