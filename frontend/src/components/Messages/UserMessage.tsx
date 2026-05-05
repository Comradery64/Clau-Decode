import { useState } from "react";
import type { Message, ImageBlock, TextBlock as TextBlockType } from "../../api/types";
import { TextBlock } from "./TextBlock";
import { ConfirmDialog } from "./ConfirmDialog";
import { api } from "../../api/client";

// ---------------------------------------------------------------------------
// XML tag parsing — Claude Code injects various system tags into user messages
// ---------------------------------------------------------------------------

type Segment =
  | { kind: "text"; content: string }
  | { kind: "stdout"; content: string }
  | { kind: "stderr"; content: string };

const TAG_PATTERN = /<([a-z][a-z0-9-]*)>([\s\S]*?)<\/\1>/g;

const STDOUT_TAGS = new Set(["local-command-stdout"]);
const STDERR_TAGS = new Set(["local-command-stderr"]);

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

    lastIndex = matchStart + match[0].length;
  }

  const remaining = text.slice(lastIndex).trim();
  if (remaining) segments.push({ kind: "text", content: remaining });

  return segments;
}

// ---------------------------------------------------------------------------
// CommandOutput block
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
// Image rendering
// ---------------------------------------------------------------------------

function InlineImage({ block }: { block: ImageBlock }) {
  const src = block.source as Record<string, string>;
  const imgSrc =
    src.type === "base64"
      ? `data:${src.media_type};base64,${src.data}`
      : src.type === "url"
      ? src.url
      : null;

  if (!imgSrc) return null;

  return (
    <img
      src={imgSrc}
      alt="Attached image"
      style={{
        maxWidth: "100%",
        borderRadius: "var(--radius-md)",
        display: "block",
        marginBottom: "6px",
      }}
    />
  );
}

// ---------------------------------------------------------------------------
// Hover action icons + helpers
// ---------------------------------------------------------------------------

function formatMsgDate(ts: string | null): string {
  if (!ts) return "";
  const d = new Date(ts);
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
}

function RefreshIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1.5 7a5.5 5.5 0 1 0 1.3-3.5M1.5 1v4h4" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="4.5" y="4.5" width="8.5" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path d="M9.5 4.5V3A1.5 1.5 0 0 0 8 1.5H3A1.5 1.5 0 0 0 1.5 3v5A1.5 1.5 0 0 0 3 9.5h1.5" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 7.5l3.5 3.5L12 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EditIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9.5 2.5l2 2L4 12H2v-2L9.5 2.5z" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrashIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2 4h10M5 4V2.5h4V4M5.5 6v5M8.5 6v5M3 4l.8 7.5A1 1 0 0 0 4.8 12.5h4.4a1 1 0 0 0 1-.9L11 4" stroke="currentColor" strokeWidth="1.25" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function ActionIconBtn({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick?: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      disabled={disabled}
      style={{
        background: "none",
        border: "none",
        cursor: disabled ? "default" : "pointer",
        color: disabled ? "var(--text-tertiary)" : "var(--text-secondary)",
        padding: "3px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "4px",
        opacity: disabled ? 0.4 : 1,
        transition: "color var(--transition-fast)",
      }}
      onMouseEnter={(e) => {
        if (!disabled) (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        if (!disabled) (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// UserMessage
// ---------------------------------------------------------------------------

interface UserMessageProps {
  message: Message;
}

export function UserMessage({ message }: UserMessageProps) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editText, setEditText] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  if (message.is_meta) return null;

  // Split content blocks into images and text
  const imageBlocks = message.content_blocks.filter(
    (b): b is ImageBlock => b.type === "image"
  );

  const allSegments: Segment[] = [];
  for (const block of message.content_blocks) {
    if (block.type === "text") {
      allSegments.push(...parseSegments(block.text));
    }
  }

  const hasUserText = allSegments.some((s) => s.kind === "text");
  const hasOutput = allSegments.some((s) => s.kind === "stdout" || s.kind === "stderr");
  const hasImages = imageBlocks.length > 0;
  const hasTextBlocks = message.content_blocks.some((b) => b.type === "text");

  // Nothing visible at all
  if (allSegments.length === 0 && !hasImages) return null;

  const handleCopy = async () => {
    const text = message.content_blocks
      .filter((b): b is TextBlockType => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  function startEdit() {
    const text = message.content_blocks
      .filter((b): b is TextBlockType => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    setEditText(text);
    setEditing(true);
  }

  async function saveEdit() {
    setSaving(true);
    try {
      await api.patchMessage(message.id, [{ type: "text", text: editText }]);
      setEditing(false);
      window.dispatchEvent(new CustomEvent("clau-decode:refresh"));
    } finally {
      setSaving(false);
    }
  }

  async function doDelete() {
    await api.deleteMessage(message.id);
    setConfirmDelete(false);
    window.dispatchEvent(new CustomEvent("clau-decode:refresh"));
  }

  // Output-only (no user text, no images) — render without bubble
  if (!hasUserText && !hasImages && hasOutput) {
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
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ padding: "6px 24px" }}
    >
      {/* Message bubble */}
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <div
          style={{
            background: "var(--bg-user-msg)",
            borderRadius: "18px 18px 4px 18px",
            padding: "10px 16px",
            maxWidth: "88%",
            width: editing ? "88%" : undefined,
          }}
        >
          {editing ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={Math.max(3, editText.split("\n").length)}
                style={{
                  width: "100%",
                  fontFamily: "var(--font-mono)",
                  fontSize: "13px",
                  padding: "8px",
                  borderRadius: "4px",
                  background: "var(--bg-input, var(--bg-tool-block))",
                  color: "var(--text-primary)",
                  border: "1px solid var(--border)",
                  resize: "vertical",
                  boxSizing: "border-box",
                }}
              />
              <div style={{ display: "flex", gap: "8px" }}>
                <button
                  onClick={saveEdit}
                  disabled={saving}
                  style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "4px",
                           background: "#3b82f6", color: "#fff", border: "none", cursor: "pointer" }}
                >
                  {saving ? "Saving…" : "Save"}
                </button>
                <button
                  onClick={() => setEditing(false)}
                  style={{ fontSize: "12px", padding: "4px 10px", borderRadius: "4px",
                           background: "none", color: "var(--text-tertiary)",
                           border: "1px solid var(--border)", cursor: "pointer" }}
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <>
              {/* Images first (Claude.ai shows attachments above message text) */}
              {imageBlocks.map((block, i) => (
                <InlineImage key={`img-${i}`} block={block} />
              ))}
              {/* Text and command output */}
              {allSegments.map((seg, i) => {
                if (seg.kind === "text") return <TextBlock key={i} text={seg.content} isUser />;
                if (seg.kind === "stdout") return <CommandOutput key={i} content={seg.content} />;
                if (seg.kind === "stderr") return <CommandOutput key={i} content={seg.content} isError />;
                return null;
              })}
            </>
          )}
        </div>
      </div>

      {/* Hover actions row */}
      <div
        style={{
          display: "flex",
          justifyContent: "flex-end",
          alignItems: "center",
          gap: "2px",
          marginTop: "4px",
          height: "22px",
          opacity: hovered ? 1 : 0,
          transition: "opacity var(--transition-fast)",
          pointerEvents: hovered ? "auto" : "none",
        }}
      >
        {message.timestamp && (
          <span
            style={{
              fontSize: "11px",
              color: "var(--text-tertiary)",
              marginRight: "4px",
              fontFamily: "var(--font-ui)",
            }}
          >
            {formatMsgDate(message.timestamp)}
          </span>
        )}
        <ActionIconBtn title="Regenerate (coming soon)" disabled>
          <RefreshIcon />
        </ActionIconBtn>
        {message.role === "user" && hasTextBlocks && (
          <ActionIconBtn title="Edit message" onClick={startEdit}>
            <EditIcon />
          </ActionIconBtn>
        )}
        <ActionIconBtn title={copied ? "Copied!" : "Copy message"} onClick={handleCopy}>
          {copied ? <CheckIcon /> : <CopyIcon />}
        </ActionIconBtn>
        <ActionIconBtn title="Delete message" onClick={() => setConfirmDelete(true)}>
          <TrashIcon />
        </ActionIconBtn>
      </div>

      {confirmDelete && (
        <ConfirmDialog
          title="Delete message?"
          body="This removes the message from the session file. A backup is created automatically before the write."
          onConfirm={doDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}
