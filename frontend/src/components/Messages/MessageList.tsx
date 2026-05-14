import { useRef, useContext } from "react";
import type { ReactElement } from "react";

import type { Recap } from "../../api/types";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { groupMessages } from "./groupMessages";
import { StreamingIndicator } from "./StreamingIndicator";
import { TextBlock } from "./TextBlock";
import { useAppStore } from "../../store";
import { MessageListContainerCtx } from "../ChatView/MessageListContainerContext";
import { useSessionDetail, isSessionActive } from "./hooks/useSessionDetail";
import { useSnapToBottom } from "./hooks/useSnapToBottom";
import { useSearchScroll } from "./hooks/useSearchScroll";
import { formatRelative } from "../../utils/formatRelative";

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
// RecapBlock — bordered card rendered between messages
// ---------------------------------------------------------------------------

function RecapPlaceholder() {
  return (
    <div
      style={{
        margin: "12px 24px",
        padding: "12px 16px 14px",
        background: "var(--bg-tool-block)",
        border: "1px dashed var(--border-default)",
        borderRadius: "var(--radius-md)",
        display: "flex",
        alignItems: "center",
        gap: "10px",
      }}
    >
      <span
        aria-hidden="true"
        style={{
          width: "12px",
          height: "12px",
          border: "2px solid var(--border-strong)",
          borderTopColor: "var(--text-secondary)",
          borderRadius: "50%",
          animation: "spin 0.8s linear infinite",
          display: "inline-block",
        }}
      />
      <span
        style={{
          fontStyle: "italic",
          fontSize: "12px",
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-ui)",
        }}
      >
        Generating recap…
      </span>
    </div>
  );
}

function RecapBlock({
  recap,
  onDismiss,
  onRegenerate,
}: {
  recap: Recap;
  onDismiss: (id: number) => void;
  onRegenerate: (id: number) => void;
}) {
  return (
    <div
      style={{
        margin: "12px 24px",
        padding: "12px 16px 14px",
        background: "var(--bg-tool-block)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        position: "relative",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: "6px",
        }}
      >
        <span
          style={{
            fontStyle: "italic",
            fontSize: "12px",
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-ui)",
          }}
        >
          Recap · {formatRelative(recap.created_at)}
        </span>
        <button
          onClick={() => onDismiss(recap.id)}
          aria-label="Dismiss recap"
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-tertiary)",
            fontSize: "16px",
            lineHeight: 1,
            padding: "2px 6px",
          }}
        >
          ×
        </button>
      </div>
      <TextBlock text={recap.text} />
      <div style={{ marginTop: "6px", textAlign: "right" }}>
        <button
          onClick={() => onRegenerate(recap.id)}
          style={{
            background: "none",
            border: "none",
            cursor: "pointer",
            color: "var(--text-tertiary)",
            fontSize: "11px",
            fontFamily: "var(--font-ui)",
            textDecoration: "underline",
            padding: 0,
          }}
        >
          Regenerate
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// MessageList
// ---------------------------------------------------------------------------

interface MessageListProps {
  sessionId: string;
  recaps?: Recap[];
  recapGenerating?: boolean;
  onDismissRecap?: (recapId: number) => void;
  onRegenerateRecap?: (recapId: number) => void;
}

export default function MessageList({
  sessionId,
  recaps = [],
  recapGenerating = false,
  onDismissRecap,
  onRegenerateRecap,
}: MessageListProps) {
  const pendingScrollMessageId = useAppStore((s) => s.pendingScrollMessageId);
  const setPendingScrollMessageId = useAppStore((s) => s.setPendingScrollMessageId);
  const containerRef = useContext(MessageListContainerCtx);
  const msgToAnchorRef = useRef(new Map<string, string>());

  const { detail, sseTimedOut } = useSessionDetail(sessionId);
  useSnapToBottom(containerRef, detail, sessionId, pendingScrollMessageId);
  useSearchScroll(containerRef, detail, sessionId, msgToAnchorRef, pendingScrollMessageId, setPendingScrollMessageId);

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

  // Index recaps by the last message id they belong to, plus a trailing bucket
  // for recaps whose covers_until_message_uuid doesn't match any rendered message.
  const renderedMsgIds = new Set<string>();
  for (const turn of turns) {
    if (turn.kind === "user" || turn.kind === "command") renderedMsgIds.add(turn.message.id);
    else for (const m of turn.messages) renderedMsgIds.add(m.id);
  }
  const recapsByMessageId = new Map<string, Recap[]>();
  const trailingRecaps: Recap[] = [];
  for (const r of recaps) {
    const target = r.covers_until_message_uuid;
    if (target && renderedMsgIds.has(target)) {
      const list = recapsByMessageId.get(target) ?? [];
      list.push(r);
      recapsByMessageId.set(target, list);
    } else {
      trailingRecaps.push(r);
    }
  }

  const handleDismiss = (id: number) => { onDismissRecap?.(id); };
  const handleRegenerate = (id: number) => { onRegenerateRecap?.(id); };

  const renderRecapsForTurn = (msgIds: string[]) => {
    const blocks: ReactElement[] = [];
    for (const id of msgIds) {
      const list = recapsByMessageId.get(id);
      if (!list) continue;
      for (const r of list) {
        blocks.push(
          <RecapBlock
            key={`recap-${r.id}`}
            recap={r}
            onDismiss={handleDismiss}
            onRegenerate={handleRegenerate}
          />,
        );
      }
    }
    return blocks;
  };

  return (
    <div
      style={{
        maxWidth: "var(--message-max-width)",
        margin: "0 auto",
        padding: "32px 0 8px",
        width: "100%",
        overflowX: "hidden",
      }}
    >
      {turns.map((turn, i) => {
        if (turn.kind === "user") {
          return (
            <div key={turn.message.id}>
              <div data-message-id={turn.message.id} className="turn-anchor">
                <UserMessage message={turn.message} />
              </div>
              {renderRecapsForTurn([turn.message.id])}
            </div>
          );
        }
        if (turn.kind === "command") {
          return (
            <div key={turn.message.id}>
              <div data-message-id={turn.message.id} className="turn-anchor">
                <CommandBadge command={turn.command} timestamp={turn.message.timestamp} />
              </div>
              {renderRecapsForTurn([turn.message.id])}
            </div>
          );
        }
        const anchorId = turn.messages[0]?.id ?? `assistant-turn-${i}`;
        return (
          <div key={`assistant-turn-${i}`}>
            <div data-message-id={anchorId} className="turn-anchor">
              <AssistantMessage
                messages={turn.messages}
                model={turn.model}
              />
            </div>
            {renderRecapsForTurn(turn.messages.map((m) => m.id))}
          </div>
        );
      })}
      {trailingRecaps.map((r) => (
        <RecapBlock
          key={`recap-${r.id}`}
          recap={r}
          onDismiss={handleDismiss}
          onRegenerate={handleRegenerate}
        />
      ))}
      {recapGenerating && <RecapPlaceholder />}
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
