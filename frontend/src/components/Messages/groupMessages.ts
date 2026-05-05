/**
 * Groups consecutive assistant message records into single visual turns.
 *
 * Claude Code stores each assistant response as multiple JSONL records:
 *   1. thinking block (separate record)
 *   2. tool_use block (separate record)
 *   3. After tool result: thinking + text (separate records)
 *
 * Grouping them produces one "C" avatar per conversational turn instead of
 * one per record, and naturally pairs thinking → tool_use → text together.
 */

import type { Message } from "../../api/types";

export interface UserTurn {
  kind: "user";
  message: Message;
}

export interface AssistantTurn {
  kind: "assistant";
  /** All consecutive assistant records that belong to this turn */
  messages: Message[];
  /** Best model label to show (last non-null wins) */
  model: string | null;
}

export interface CommandTurn {
  kind: "command";
  message: Message;
  /** Slash command name, e.g. "/exit", "/compact" */
  command: string;
}

export interface AsideTurn {
  kind: "aside";
  message: Message;  // the sidechain assistant message
}

export type Turn = UserTurn | AssistantTurn | CommandTurn | AsideTurn;

function extractSlashCommand(text: string): string | null {
  const nameMatch = text.match(/<command-name>([^<]+)<\/command-name>/);
  if (nameMatch) {
    const n = nameMatch[1].trim();
    return n.startsWith("/") ? n : `/${n}`;
  }
  const msgMatch = text.match(/<command-message>([^<]+)<\/command-message>/);
  if (msgMatch) {
    const n = msgMatch[1].trim();
    return n.startsWith("/") ? n : `/${n}`;
  }
  return null;
}

/** Returns the slash command name if this message is a slash command record, else null. */
function getSlashCommand(msg: Message): string | null {
  if (msg.content_blocks.length !== 1) return null;
  const block = msg.content_blocks[0];
  if (block.type !== "text") return null;
  const text = (block as { type: "text"; text: string }).text;
  if (!text.includes("<command-name>") && !text.includes("<command-message>")) return null;
  return extractSlashCommand(text);
}

/** Returns true for user messages that carry no visible content. */
function isInvisibleUser(msg: Message): boolean {
  if (msg.is_meta) return true;
  // Tool-result-only messages
  const allToolResult = msg.content_blocks.length > 0
    && msg.content_blocks.every((b) => b.type === "tool_result");
  if (allToolResult) return true;
  // Empty
  if (msg.content_blocks.length === 0) return true;
  return false;
}

/** Returns true for assistant messages with no visible content. */
function isInvisibleAssistant(msg: Message): boolean {
  return msg.content_blocks.every(
    (b) => b.type === "thinking" && (b as { type: "thinking"; thinking: string }).thinking === ""
  );
}

export function groupMessages(messages: Message[]): Turn[] {
  const turns: Turn[] = [];
  let currentAssistant: Message[] | null = null;

  const flushAssistant = () => {
    if (currentAssistant && currentAssistant.length > 0) {
      const model = [...currentAssistant].reverse().find((m) => m.model)?.model ?? null;
      turns.push({ kind: "assistant", messages: currentAssistant, model });
      currentAssistant = null;
    }
  };

  for (const msg of messages) {
    if (msg.is_sidechain) {
      // Aside response: sidechain assistant message with visible text
      if (msg.role === "assistant") {
        const hasText = msg.content_blocks.some(
          (b) => b.type === "text" && (b as { type: "text"; text: string }).text.trim()
        );
        if (hasText) {
          flushAssistant();
          turns.push({ kind: "aside", message: msg });
        }
      }
      continue;
    }

    if (msg.role === "assistant") {
      if (isInvisibleAssistant(msg)) continue;
      if (!currentAssistant) currentAssistant = [];
      currentAssistant.push(msg);
    } else if (msg.role === "user") {
      // Tool-result messages must stay with the preceding assistant turn so
      // pairToolBlocks can match tool_use → tool_result by id.
      const isToolResult =
        msg.content_blocks.length > 0 &&
        msg.content_blocks.every((b) => b.type === "tool_result");
      if (isToolResult && currentAssistant) {
        currentAssistant.push(msg);
        continue;
      }
      const slashCommand = getSlashCommand(msg);
      if (slashCommand !== null) {
        flushAssistant();
        turns.push({ kind: "command", message: msg, command: slashCommand });
        continue;
      }
      if (isInvisibleUser(msg)) continue;
      flushAssistant();
      turns.push({ kind: "user", message: msg });
    }
    // system messages: skip
  }
  flushAssistant();

  return turns;
}
