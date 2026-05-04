import { useState } from "react";
import type { Message } from "../../api/types";
import { TextBlock } from "./TextBlock";
import { ThoughtChain } from "./ThoughtChain";
import { pairToolBlocks, type PairedBlock } from "./pairToolBlocks";

type ThoughtGroup = { kind: "thought_group"; blocks: PairedBlock[] };
type Segment = ThoughtGroup | PairedBlock;

function isThoughtGroup(seg: Segment): seg is ThoughtGroup {
  return "kind" in seg;
}

export function formatModelName(model: string): string {
  const lower = model.toLowerCase();
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

function ActionIconBtn({
  onClick,
  title,
  children,
}: {
  onClick?: () => void;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
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
        borderRadius: "4px",
        transition: "color var(--transition-fast)",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLElement).style.color = "var(--text-primary)";
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
// AssistantMessage
// ---------------------------------------------------------------------------

interface AssistantMessageProps {
  messages: Message[];
  model: string | null;
}

export function AssistantMessage({ messages, model }: AssistantMessageProps) {
  const [hovered, setHovered] = useState(false);
  const [copied, setCopied] = useState(false);

  const allBlocks = messages.flatMap((m) => m.content_blocks);
  const pairedBlocks = pairToolBlocks(allBlocks);

  // Build interleaved segments: groups of consecutive thought/tool blocks
  // separated by text/image blocks, preserving document order.
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

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ padding: "4px 24px 4px" }}
    >
      {/* Interleaved thought chains and text/image blocks in document order */}
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

      {/* Footer: model name + hover actions */}
      <div
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
          style={{
            display: "flex",
            alignItems: "center",
            gap: "2px",
            opacity: hovered ? 1 : 0,
            transition: "opacity var(--transition-fast)",
            pointerEvents: hovered ? "auto" : "none",
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
          <ActionIconBtn title={copied ? "Copied!" : "Copy response"} onClick={handleCopy}>
            {copied ? <CheckIcon /> : <CopyIcon />}
          </ActionIconBtn>
        </div>
      </div>

      <div style={{ height: "12px" }} />
    </div>
  );
}
