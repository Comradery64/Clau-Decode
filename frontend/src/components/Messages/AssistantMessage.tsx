import { useState } from "react";
import type { Message } from "../../api/types";
import { TextBlock } from "./TextBlock";
import { ThoughtChain } from "./ThoughtChain";
import { pairToolBlocks, type PairedBlock } from "./pairToolBlocks";
import { ConfirmDialog } from "./ConfirmDialog";
import { api } from "../../api/client";
import { emit } from "../../utils/events";
import { useProviderTheme } from "../ChatView/ProviderThemeContext";

type ThoughtGroup = { kind: "thought_group"; blocks: PairedBlock[] };
type Segment = ThoughtGroup | PairedBlock;

function isThoughtGroup(seg: Segment): seg is ThoughtGroup {
  return "kind" in seg;
}

export function formatModelName(model: string): string {
  const lower = model.toLowerCase();

  // GPT / OpenAI Codex models — parse "gpt-<version>" into "GPT <version>".
  // Examples: gpt-5.5 → "GPT 5.5", gpt-5 → "GPT 5", gpt-4o → "GPT 4o".
  if (lower.includes("gpt")) {
    // Match an optional major.minor version or major+suffix (e.g. "4o", "5.5")
    const gptVersionMatch = lower.match(/gpt[-_]?(\d+(?:\.\d+)?[a-z0-9]*)/);
    if (gptVersionMatch) {
      return `GPT ${gptVersionMatch[1]}`;
    }
    return "GPT";
  }

  // Claude models
  const tierMatch = lower.match(/claude-(opus|sonnet|haiku|instant)[-_]?/);
  const tier = tierMatch ? tierMatch[1] : null;
  const versionMatch = lower.match(/(\d+)[-_](\d+)$/) ?? lower.match(/(\d+)$/);
  let version = "";
  if (versionMatch) {
    version =
      versionMatch.length === 3
        ? `${versionMatch[1]}.${versionMatch[2]}`
        : versionMatch[1];
  }
  if (tier) {
    const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
    return version ? `${tierName} ${version}` : tierName;
  }
  return model;
}

// ---------------------------------------------------------------------------
// Hover action icons
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

function CopyIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="4.5" y="4.5" width="8.5" height="8.5" rx="1.5" stroke="currentColor" strokeWidth="1.25" />
      <path
        d="M9.5 4.5V3A1.5 1.5 0 0 0 8 1.5H3A1.5 1.5 0 0 0 1.5 3v5A1.5 1.5 0 0 0 3 9.5h1.5"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path
        d="M2 7.5l3.5 3.5L12 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
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
  danger,
  children,
}: {
  onClick?: () => void;
  title: string;
  danger?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-label={title}
      title={title}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-secondary)",
        padding: "3px",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        borderRadius: "var(--radius-sm)",
        transition: "color var(--transition-fast)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.color = danger ? "#ef4444" : "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--text-secondary)";
      }}
    >
      {children}
    </button>
  );
}

// ---------------------------------------------------------------------------
// Inline edit form for assistant text
// ---------------------------------------------------------------------------

function AssistantEditForm({
  initialText,
  onSave,
  onCancel,
}: {
  initialText: string;
  onSave: (text: string) => Promise<void>;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initialText);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      await onSave(text);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "4px 0" }}>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={Math.max(4, text.split("\n").length + 1)}
        autoFocus
        style={{
          width: "100%",
          fontFamily: "var(--font-content)",
          fontSize: "15px",
          lineHeight: 1.7,
          padding: "10px 12px",
          borderRadius: "var(--radius-md)",
          background: "var(--bg-input)",
          color: "var(--text-primary)",
          border: "1px solid var(--border-default)",
          resize: "vertical",
          boxSizing: "border-box",
          outline: "none",
        }}
        onFocus={(e) => { e.currentTarget.style.borderColor = "var(--accent-orange)"; }}
        onBlur={(e) => { e.currentTarget.style.borderColor = "var(--border-default)"; }}
      />
      <div style={{ display: "flex", gap: "6px" }}>
        <button
          onClick={onCancel}
          style={{
            fontSize: "13px",
            padding: "5px 12px",
            borderRadius: "var(--radius-sm)",
            background: "none",
            color: "var(--text-secondary)",
            border: "1px solid var(--border-default)",
            cursor: "pointer",
            fontFamily: "var(--font-ui)",
          }}
        >
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={saving}
          style={{
            fontSize: "13px",
            padding: "5px 12px",
            borderRadius: "var(--radius-sm)",
            background: "var(--accent-orange)",
            color: "var(--text-on-accent)",
            border: "none",
            cursor: saving ? "default" : "pointer",
            opacity: saving ? 0.7 : 1,
            fontFamily: "var(--font-ui)",
            fontWeight: 500,
          }}
        >
          {saving ? "Saving…" : "Save"}
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// AssistantMessage
// ---------------------------------------------------------------------------

interface AssistantMessageProps {
  messages: Message[];
  model: string | null;
}

export function AssistantMessage({ messages, model }: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const allBlocks = messages.flatMap((m) => m.content_blocks);
  const pairedBlocks = pairToolBlocks(allBlocks);

  const segments: Segment[] = [];
  let pendingThoughts: PairedBlock[] = [];

  for (const block of pairedBlocks) {
    if (block.type === "thinking" || block.type === "tool_use_pair") {
      pendingThoughts.push(block);
    } else {
      if (pendingThoughts.length > 0) {
        segments.push({ kind: "thought_group", blocks: pendingThoughts });
        pendingThoughts = [];
      }
      segments.push(block);
    }
  }
  if (pendingThoughts.length > 0) {
    segments.push({ kind: "thought_group", blocks: pendingThoughts });
  }

  const hasVisible = segments.some((seg) => {
    if (isThoughtGroup(seg)) return seg.blocks.length > 0;
    if (seg.type === "image") return true;
    if (seg.type === "text") return seg.text.trim() !== "";
    return false;
  });

  if (!hasVisible) return null;

  const timestamp = messages[0]?.timestamp ?? null;
  const primaryId = messages[0]?.id ?? "";

  // Edit is available when the turn is a single message with text content
  const editableText = messages.length === 1
    ? allBlocks
        .filter((b) => b.type === "text")
        .map((b) => (b as { type: "text"; text: string }).text)
        .join("\n")
    : null;
  // Mutating a message rewrites the on-disk session file, which is
  // provider-format-specific (the editor speaks Claude JSONL). Gate edit AND
  // delete on the provider's effective can_edit so we never corrupt a Codex
  // rollout. Claude → true; Codex → false (hidden).
  const { caps } = useProviderTheme();
  const canMutate = caps.can_edit;
  const canEdit =
    canMutate && editableText !== null && editableText.trim().length > 0;


  const handleCopy = async () => {
    const text = allBlocks
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {}
  };

  async function saveEdit(text: string) {
    await api.patchMessage(primaryId, [{ type: "text", text }]);
    setEditing(false);
    emit("refresh", undefined);
  }

  async function doDelete() {
    setDeleteError(null);
    try {
      await api.deleteMessage(primaryId);
      setConfirmDelete(false);
      emit("refresh", undefined);
    } catch (e) {
      const msg = (e as Error).message || "Delete failed";
      setDeleteError(msg.includes("403") ? "Editing is disabled. Set edit_enabled in Settings." : msg);
    }
  }

  return (
    <div
      className="hover-actions-parent"
      style={{ padding: "6px 24px" }}
    >
      {editing ? (
        <AssistantEditForm
          initialText={editableText ?? ""}
          onSave={saveEdit}
          onCancel={() => setEditing(false)}
        />
      ) : (
        <>
          {segments.map((seg, i) => {
            if (isThoughtGroup(seg)) {
              return <ThoughtChain key={i} blocks={seg.blocks} />;
            }
            if (seg.type === "text") {
              return <TextBlock key={i} text={seg.text} />;
            }
            if (seg.type === "image") {
              const src = seg.source as Record<string, string>;
              const imgSrc =
                src.type === "base64"
                  ? `data:${src.media_type};base64,${src.data}`
                  : src.type === "url"
                  ? src.url
                  : null;
              if (!imgSrc) return null;
              return (
                <img
                  key={i}
                  src={imgSrc}
                  alt="Image from conversation"
                  style={{
                    maxWidth: "100%",
                    borderRadius: "var(--radius-md)",
                    margin: "4px 0 14px",
                    display: "block",
                  }}
                />
              );
            }
            return null;
          })}
        </>
      )}

      {/* Footer: model name + hover actions */}
      {!editing && (
        <div
          className="asst-footer"
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginTop: "4px",
            minHeight: "22px",
          }}
        >
          {model && (
            <div
              className="hover-actions asst-model-label"
              style={{
                fontSize: "11px",
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-ui)",
              }}
            >
              {formatModelName(model)}
            </div>
          )}
          <div
            className="hover-actions asst-action-icons"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "2px",
              marginLeft: "auto",
            }}
          >
            {timestamp && (
              <span
                style={{
                  fontSize: "11px",
                  color: "var(--text-tertiary)",
                  marginRight: "4px",
                  fontFamily: "var(--font-ui)",
                }}
              >
                {formatMsgDate(timestamp)}
              </span>
            )}
            {canEdit && (
              <ActionIconBtn title="Edit response" onClick={() => setEditing(true)}>
                <EditIcon />
              </ActionIconBtn>
            )}
            <ActionIconBtn title={copied ? "Copied!" : "Copy response"} onClick={handleCopy}>
              {copied ? <CheckIcon /> : <CopyIcon />}
            </ActionIconBtn>
            {canMutate && (
              <ActionIconBtn title="Delete response" danger onClick={() => setConfirmDelete(true)}>
                <TrashIcon />
              </ActionIconBtn>
            )}
          </div>
        </div>
      )}

      <div style={{ height: "12px" }} />

      {confirmDelete && (
        <ConfirmDialog
          title="Delete response?"
          body={
            deleteError
              ? <span style={{ color: "var(--tool-error-text)" }}>{deleteError}</span>
              : "This removes the assistant response from the session file. A backup is created automatically before the write."
          }
          onConfirm={doDelete}
          onCancel={() => { setConfirmDelete(false); setDeleteError(null); }}
        />
      )}
    </div>
  );
}
