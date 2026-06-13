import { useRef, useContext, useEffect } from "react";
import type { ReactElement } from "react";

import type { Message, Recap, TextBlock } from "../../api/types";
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import { groupMessages } from "./groupMessages";
import { StreamingIndicator } from "./StreamingIndicator";
import { EphemeralPairBlock, buildEphemeralPairs } from "./EphemeralMessage";
import { timestampMs } from "../../utils/timestamps";
import { useAppStore } from "../../store";
import { MessageListContainerCtx } from "../ChatView/MessageListContainerContext";
import { useSessionDetail, isSessionActive } from "./hooks/useSessionDetail";
import { useSnapToBottom } from "./hooks/useSnapToBottom";
import { useSearchScroll } from "./hooks/useSearchScroll";
import { formatRelative } from "../../utils/formatRelative";
import { LoadingAnimation } from "../ui/LoadingAnimation";

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

// Shared with RecapBlock so the placeholder and the eventual recap occupy
// the same horizontal lane — the "/recap" pill sits centered between two
// faint dividers, mirroring <CommandBadge> for any other slash command.
function RecapPillDivider({ label }: { label: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "12px 24px 4px",
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
        {label}
      </span>
      <div style={{ flex: 1, height: "1px", background: "var(--border-subtle)" }} />
    </div>
  );
}

function RecapPlaceholder() {
  return (
    <div>
      <RecapPillDivider label="/recap" />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "8px",
          padding: "4px 24px 12px",
          color: "var(--text-tertiary)",
          fontFamily: "var(--font-ui)",
          fontStyle: "italic",
          fontSize: "12px",
        }}
      >
        <LoadingAnimation width="24px" />
        <span>Generating…</span>
      </div>
    </div>
  );
}

function RecapPrompt({
  onCreate,
  onDismiss,
}: {
  onCreate: () => void;
  onDismiss: () => void;
}) {
  return (
    <div className="hover-actions-parent">
      <RecapPillDivider label="/recap" />
      <div
        style={{
          maxWidth: "var(--message-max-width)",
          margin: "0 auto",
          padding: "4px 48px 12px",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: "12px",
          flexWrap: "wrap",
          fontFamily: "var(--font-ui)",
          fontSize: "12px",
          color: "var(--text-secondary)",
          textAlign: "center",
        }}
      >
        <span>This chat has been idle. Create a quick recap?</span>
        <button
          type="button"
          onClick={onCreate}
          style={{
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            background: "var(--bg-input)",
            color: "var(--text-primary)",
            cursor: "pointer",
            fontFamily: "var(--font-ui)",
            fontSize: "12px",
            padding: "5px 9px",
          }}
        >
          Create recap
        </button>
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Dismiss recap prompt"
          style={{
            border: "none",
            background: "none",
            color: "var(--text-tertiary)",
            cursor: "pointer",
            fontFamily: "var(--font-ui)",
            fontSize: "12px",
            padding: 0,
            textDecoration: "underline",
          }}
        >
          Not now
        </button>
      </div>
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
  const label = (
    <>
      /recap
      <span style={{ opacity: 0.6, marginLeft: "6px", fontFamily: "var(--font-ui)" }}>
        {formatRelative(recap.created_at)}
      </span>
    </>
  );
  return (
    <div className="hover-actions-parent">
      <RecapPillDivider label={label} />
      <div
        style={{
          maxWidth: "var(--message-max-width)",
          margin: "0 auto",
          padding: "0 48px 10px",
          fontFamily: "var(--font-content)",
          fontSize: "13px",
          fontStyle: "italic",
          color: "var(--text-secondary)",
          textAlign: "center",
          lineHeight: 1.55,
        }}
      >
        {recap.text}
        <div
          className="hover-actions"
          style={{
            marginTop: "6px",
            display: "flex",
            justifyContent: "center",
            gap: "12px",
            fontSize: "11px",
            fontFamily: "var(--font-ui)",
            fontStyle: "normal",
            color: "var(--text-tertiary)",
          }}
        >
          <button
            onClick={() => onRegenerate(recap.id)}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              padding: 0,
              fontFamily: "inherit",
              fontSize: "inherit",
              textDecoration: "underline",
            }}
          >
            Regenerate
          </button>
          <button
            onClick={() => onDismiss(recap.id)}
            aria-label="Dismiss recap"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "inherit",
              padding: 0,
              fontFamily: "inherit",
              fontSize: "inherit",
              textDecoration: "underline",
            }}
          >
            Dismiss
          </button>
        </div>
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
  recapPromptPending?: boolean;
  onCreateRecap?: () => void;
  onDismissRecapPrompt?: () => void;
  onDismissRecap?: (recapId: number) => void;
  onRegenerateRecap?: (recapId: number) => void;
  /** Show the streaming indicator. This is now the SOLE gate — the
   * JSONL-derived isActive is no longer a positive trigger, because
   * isActive is stale-forever for sessions that crashed mid-turn
   * previously (reviving them would show a years-old counter). Parent
   * sets this on submit and clears it when the turn completes via
   * ``onActiveChange(false)`` or via the stall/stop paths. */
  optimisticActive?: boolean;
  /** Wall-clock millis of the submit that turned ``optimisticActive`` on.
   * Used as the indicator counter's base, giving "current-turn duration"
   * semantics (matching claude's own TUI timer). When null, the counter
   * falls back to the latest JSONL user-message timestamp. */
  optimisticTimestamp?: number | null;
  optimisticUserMessage?: {
    content: string;
    createdAt: number;
  } | null;
  /** When true, force the streaming indicator OFF regardless of isActive.
   * Used after the user clicks Stop — the PTY was killed mid-turn so the
   * JSONL stays unfinished and isActive would otherwise stay true forever. */
  forceInactive?: boolean;
  /** Notifies the parent each time the JSONL-driven isActive value changes,
   * so the parent can decay its optimistic-active flag when the turn
   * truly completes (transition from active=true → active=false). */
  onActiveChange?: (active: boolean) => void;
}

export default function MessageList({
  sessionId,
  recaps = [],
  recapGenerating = false,
  recapPromptPending = false,
  onCreateRecap,
  onDismissRecapPrompt,
  onDismissRecap,
  onRegenerateRecap,
  optimisticActive = false,
  optimisticTimestamp = null,
  optimisticUserMessage = null,
  forceInactive = false,
  onActiveChange,
}: MessageListProps) {
  const pendingScrollMessageId = useAppStore((s) => s.pendingScrollMessageId);
  const setPendingScrollMessageId = useAppStore((s) => s.setPendingScrollMessageId);
  const containerRef = useContext(MessageListContainerCtx);
  const msgToAnchorRef = useRef(new Map<string, string>());

  const { detail, ephemerals } = useSessionDetail(sessionId);
  useSnapToBottom(containerRef, detail, sessionId, pendingScrollMessageId, optimisticActive);
  useSearchScroll(containerRef, detail, sessionId, msgToAnchorRef, pendingScrollMessageId, setPendingScrollMessageId);

  // Compute isActive defensively so the hooks below run with a stable
  // value even when ``detail`` is still loading. Hooks must run in the
  // same order across every render (React error #310) — anything after
  // ``if (!detail) return null`` would be skipped on the first render.
  const earlyTurns = detail ? groupMessages(detail.messages) : [];
  const isActive = detail ? isSessionActive(earlyTurns) : false;
  // Fire onActiveChange whenever the server-side detail version changes
  // (tracked by updated_at). Originally this was gated on isActive transitions
  // — but claude batches its JSONL writes (user message + thinking + text +
  // system can all land within a few ms), so the file watcher emits a single
  // refresh event and the FE sees isActive go straight from false to false,
  // missing the implicit true. Tying the notification to updated_at instead
  // guarantees the parent gets a chance to clear its optimisticSubmit each
  // time the server says anything changed.
  const lastUpdatedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!detail) return;
    if (lastUpdatedRef.current === detail.updated_at) return;
    lastUpdatedRef.current = detail.updated_at;
    onActiveChange?.(isActive);
  }, [detail, isActive, onActiveChange]);

  if (!detail) return null;

  const turns = earlyTurns;
  const persistedOptimisticUser = optimisticUserMessage
    ? detail.messages.some((m) => {
      if (m.role !== "user" || m.is_meta) return false;
      const ts = timestampMs(m.timestamp ?? "");
      if (ts < optimisticUserMessage.createdAt - 5000) return false;
      const text = m.content_blocks
        .filter((b): b is TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      return text === optimisticUserMessage.content.trim();
    })
    : false;
  const optimisticMessage: Message | null = optimisticUserMessage && !persistedOptimisticUser
    ? {
      id: `optimistic-user-${sessionId}-${optimisticUserMessage.createdAt}`,
      session_id: sessionId,
      parent_id: null,
      role: "user",
      content_blocks: [{ type: "text", text: optimisticUserMessage.content }],
      timestamp: new Date(optimisticUserMessage.createdAt).toISOString(),
      model: null,
      is_sidechain: false,
      is_meta: false,
      cwd: detail.cwd,
      git_branch: detail.git_branch,
      source_tool_assistant_uuid: null,
      usage: null,
    }
    : null;

  // ---------------------------------------------------------------------------
  // Ephemeral interleave — merge ephemeral pairs into the regular turn list
  // by timestamp so /btw exchanges appear at the right chronological position.
  // ---------------------------------------------------------------------------
  const ephemeralPairs = buildEphemeralPairs(ephemerals);

  type ListItem =
    | { kind: "turn"; turnIndex: number; sortTs: string }
    | { kind: "ephemeral"; pairIndex: number; sortTs: string }
    | { kind: "optimistic-user"; sortTs: string };

  const listItems: ListItem[] = [];

  for (let i = 0; i < turns.length; i++) {
    const turn = turns[i];
    let ts = "";
    if (turn.kind === "user" || turn.kind === "command") {
      ts = turn.message.timestamp ?? "";
    } else {
      ts = turn.messages[0]?.timestamp ?? "";
    }
    listItems.push({ kind: "turn", turnIndex: i, sortTs: ts });
  }
  for (let i = 0; i < ephemeralPairs.length; i++) {
    listItems.push({ kind: "ephemeral", pairIndex: i, sortTs: ephemeralPairs[i].sortTimestamp });
  }
  if (optimisticMessage) {
    listItems.push({ kind: "optimistic-user", sortTs: optimisticMessage.timestamp ?? "" });
  }
  // Stable sort: keep original order within same timestamp
  listItems.sort((a, b) => {
    const aMs = timestampMs(a.sortTs);
    const bMs = timestampMs(b.sortTs);
    if (aMs < bMs) return -1;
    if (aMs > bMs) return 1;
    // Ephemerals go after regular turns at the same timestamp
    if (a.kind === "ephemeral" && b.kind !== "ephemeral") return 1;
    if (a.kind !== "ephemeral" && b.kind === "ephemeral") return -1;
    if (a.kind === "optimistic-user" && b.kind !== "optimistic-user") return 1;
    if (a.kind !== "optimistic-user" && b.kind === "optimistic-user") return -1;
    return 0;
  });

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

  // The streaming indicator is gated SOLELY by optimisticActive — parent
  // sets it on submit, clears it on turn-complete (active→false transition
  // notified via onActiveChange) or stall. JSONL-derived isActive is NOT
  // a positive gate because revived crashed sessions have isActive=true
  // forever, which would show a stale counter on every chat open.
  // forceInactive (parent's stop-click override) still wins.
  const indicatorActive = optimisticActive && !forceInactive;
  // Counter base: the wall-clock at the user's most recent submit
  // (current-turn duration, matching claude's own TUI behavior). Falls
  // back to JSONL's latest user message timestamp only if the parent
  // didn't supply a submit time — but with the new optimistic-only gate
  // above, that fallback is rare (basically never fires once indicatorActive
  // is on).
  let lastUserTimestamp: string | null = null;
  if (indicatorActive) {
    if (optimisticTimestamp !== null) {
      lastUserTimestamp = new Date(optimisticTimestamp).toISOString();
    } else {
      for (let i = turns.length - 1; i >= 0; i--) {
        const t = turns[i];
        if (t.kind === "user") { lastUserTimestamp = t.message.timestamp; break; }
      }
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
      {listItems.map((item) => {
        if (item.kind === "ephemeral") {
          const pair = ephemeralPairs[item.pairIndex];
          return (
            <EphemeralPairBlock
              key={`ephemeral-${pair.user.id}`}
              pair={pair}
            />
          );
        }
        if (item.kind === "optimistic-user") {
          if (!optimisticMessage) return null;
          return (
            <div key={optimisticMessage.id}>
              <div data-message-id={optimisticMessage.id} className="turn-anchor">
                <UserMessage message={optimisticMessage} />
              </div>
            </div>
          );
        }
        const turn = turns[item.turnIndex];
        const i = item.turnIndex;
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
      {recapPromptPending && !recapGenerating && (
        <RecapPrompt
          onCreate={() => onCreateRecap?.()}
          onDismiss={() => onDismissRecapPrompt?.()}
        />
      )}
      {recapGenerating && <RecapPlaceholder />}
      {indicatorActive && (
        <StreamingIndicator
          lastUserTimestamp={lastUserTimestamp}
          totalInputTokens={totalInputTokens}
          hasThinking={hasThinking}
        />
      )}
    </div>
  );
}
