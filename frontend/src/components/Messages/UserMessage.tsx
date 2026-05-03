import type { Message } from "../../api/types";
import { TextBlock } from "./TextBlock";

// ---------------------------------------------------------------------------
// XML tag parsing — Claude Code injects various system tags into user messages
// ---------------------------------------------------------------------------

type Segment =
  | { kind: "text"; content: string }
  | { kind: "stdout"; content: string }
  | { kind: "stderr"; content: string };

// Generic XML tag pattern — matches any lowercase hyphenated tag name.
// Covers all current and future Claude Code system tags.
const TAG_PATTERN = /<([a-z][a-z0-9-]*)>([\s\S]*?)<\/\1>/g;

// Tags whose content should be rendered as terminal output blocks
const STDOUT_TAGS = new Set(["local-command-stdout"]);
const STDERR_TAGS = new Set(["local-command-stderr"]);
// All other matched tags are silently stripped (system-reminder, command-name,
// bash-input, user-prompt-submit-hook, etc.)

// Strip ANSI escape sequences
function stripAnsi(text: string): string {
  // eslint-disable-next-line no-control-regex
  return text.replace(/\x1b\[[0-9;]*[a-zA-Z]/g, "");
}

function parseSegments(text: string): Segment[] {
  const segments: Segment[] = [];
  let lastIndex = 0;

  for (const match of text.matchAll(TAG_PATTERN)) {
    const matchStart = match.index!;
    const tagName = match[1];
    const content = stripAnsi(match[2].trim());

    const before = text.slice(lastIndex, matchStart).trim();
    if (before) segments.push({ kind: "text", content: before });

    if (STDOUT_TAGS.has(tagName) && content) {
      segments.push({ kind: "stdout", content });
    } else if (STDERR_TAGS.has(tagName) && content) {
      segments.push({ kind: "stderr", content });
    }
    // everything else is silently stripped

    lastIndex = matchStart + match[0].length;
  }

  const remaining = text.slice(lastIndex).trim();
  if (remaining) segments.push({ kind: "text", content: remaining });

  return segments;
}

// ---------------------------------------------------------------------------
// Command output block — rendered for stdout/stderr segments
// ---------------------------------------------------------------------------

function CommandOutput({ content, isError }: { content: string; isError?: boolean }) {
  return (
    <div
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
        lineHeight: 1.5,
        background: isError ? "var(--tool-error-bg)" : "var(--bg-code)",
        border: `1px solid ${isError ? "var(--tool-error-border)" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-md)",
        padding: "8px 12px",
        color: isError ? "var(--tool-error-text)" : "var(--text-code)",
        whiteSpace: "pre-wrap",
        wordBreak: "break-all",
        margin: "4px 0",
      }}
    >
      {content}
    </div>
  );
}

// ---------------------------------------------------------------------------
// UserMessage
// ---------------------------------------------------------------------------

interface UserMessageProps {
  message: Message;
}

export function UserMessage({ message }: UserMessageProps) {
  if (message.is_meta) return null;

  // Collect all text content, parsing out system XML tags
  const allSegments: Segment[] = [];
  for (const block of message.content_blocks) {
    if (block.type === "text") {
      allSegments.push(...parseSegments(block.text));
    }
  }

  // If nothing visible remains (e.g. entire message was system tags), hide it
  if (allSegments.length === 0) return null;

  // If only stdout/stderr segments remain with no user text, render without a bubble
  const hasUserText = allSegments.some((s) => s.kind === "text");
  const hasOutput = allSegments.some((s) => s.kind === "stdout" || s.kind === "stderr");

  if (!hasUserText && hasOutput) {
    return (
      <div style={{ padding: "4px 24px" }}>
        {allSegments.map((seg, i) => {
          if (seg.kind === "stdout") return <CommandOutput key={i} content={seg.content} />;
          if (seg.kind === "stderr") return <CommandOutput key={i} content={seg.content} isError />;
          return null;
        })}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        padding: "6px 24px",
      }}
    >
      <div
        style={{
          background: "var(--bg-user-msg)",
          borderRadius: "18px 18px 4px 18px",
          padding: "10px 16px",
          maxWidth: "88%",
        }}
      >
        {allSegments.map((seg, i) => {
          if (seg.kind === "text") return <TextBlock key={i} text={seg.content} isUser />;
          if (seg.kind === "stdout") return <CommandOutput key={i} content={seg.content} />;
          if (seg.kind === "stderr") return <CommandOutput key={i} content={seg.content} isError />;
          return null;
        })}
      </div>
    </div>
  );
}
