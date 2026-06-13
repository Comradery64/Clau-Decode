/**
 * EphemeralMessage — renders a /btw (ephemeral) question+answer pair inline
 * in the message list. Visual treatment follows the older sidechain aside
 * panel: compact, collapsible, and visually grouped as tool-result output.
 *
 * Phase 2, pty-runner-plan.md.
 */

import type { EphemeralMessage } from "../../api/types";
import { formatRelative } from "../../utils/formatRelative";
import { timestampMs } from "../../utils/timestamps";
import { TextBlock } from "./TextBlock";

// ---------------------------------------------------------------------------
// EphemeralPair — one user+assistant pair rendered as a single block
// ---------------------------------------------------------------------------

export interface EphemeralPair {
  user: EphemeralMessage;
  assistant: EphemeralMessage | null; // null while response is still pending
  /** min(user.timestamp, assistant?.timestamp) for merge-sort ordering */
  sortTimestamp: string;
}

/**
 * Group a flat list of ephemeral rows into pairs sorted by sortTimestamp.
 * Unpaired user rows (response pending) produce a pair with assistant=null.
 */
export function buildEphemeralPairs(rows: EphemeralMessage[]): EphemeralPair[] {
  const userRows = rows.filter((r) => r.role === "user");
  const assistantByRespondsTo = new Map<number, EphemeralMessage>();
  for (const r of rows) {
    if (r.role === "assistant" && r.responds_to !== null) {
      assistantByRespondsTo.set(r.responds_to, r);
    }
  }

  return userRows.map((u) => {
    const a = assistantByRespondsTo.get(u.id) ?? null;
    const sortTimestamp = a
      ? timestampMs(u.timestamp) <= timestampMs(a.timestamp)
        ? u.timestamp
        : a.timestamp
      : u.timestamp;
    return { user: u, assistant: a, sortTimestamp };
  });
}

function stripBtwPrefix(content: string): string {
  return content.replace(/^\/btw\b[\s:]*/i, "").trim();
}

// ---------------------------------------------------------------------------
// EphemeralPairBlock component
// ---------------------------------------------------------------------------

export function EphemeralPairBlock({ pair }: { pair: EphemeralPair }) {
  const { user, assistant } = pair;

  const timeLabel = formatRelative(user.timestamp);

  return (
    <details
      open
      data-testid="ephemeral-pair"
      style={{
        margin: "0 24px 4px",
        background: "var(--bg-tool-result)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
      }}
    >
      <summary
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          padding: "6px 12px",
          fontSize: "12px",
          color: "var(--text-tertiary)",
          cursor: "pointer",
          userSelect: "none",
          listStyle: "none",
          fontFamily: "var(--font-mono)",
        }}
      >
        <span
          data-testid="ephemeral-badge"
          style={{ whiteSpace: "nowrap" }}
        >
          ↩ /btw response
        </span>
        <span
          style={{
            fontSize: "11px",
            fontFamily: "var(--font-ui)",
            color: "var(--text-tertiary)",
            opacity: 0.7,
          }}
        >
          {timeLabel}
        </span>
      </summary>

      <div
        style={{
          borderTop: "1px solid var(--border-subtle)",
          padding: "8px 12px 10px",
        }}
      >
        <div
          style={{
            fontFamily: "var(--font-ui)",
            fontSize: "13px",
            color: "var(--text-secondary)",
            marginBottom: "6px",
          }}
        >
          {stripBtwPrefix(user.content)}
        </div>

        <div
          data-testid={assistant ? "ephemeral-answer" : "ephemeral-pending"}
          style={{
            fontFamily: "var(--font-content)",
            fontSize: "14px",
            color: assistant ? "var(--text-primary)" : "var(--text-tertiary)",
            fontStyle: assistant ? "normal" : "italic",
            lineHeight: 1.55,
          }}
        >
          {assistant ? (
            <TextBlock
              text={assistant.content}
              style={{ fontSize: "14px", lineHeight: 1.6 }}
            />
          ) : (
            "Capturing response…"
          )}
        </div>
      </div>
    </details>
  );
}
