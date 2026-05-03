import React, { useState, useEffect } from "react";
import type { ToolUseBlock as ToolUseBlockType, ToolResultBlock } from "../../api/types";
import { TextBlock } from "./TextBlock";
import { useAppStore } from "../../store";

interface ToolUseBlockProps {
  toolUse: ToolUseBlockType;
  toolResult?: ToolResultBlock | null;
}

function getFirstParamHint(input: Record<string, unknown>): string {
  const values = Object.values(input);
  if (values.length === 0) return "";
  const first = values[0];
  if (typeof first === "string" && first.length < 80) return first;
  return "";
}

function renderResultContent(content: ToolResultBlock["content"]): React.ReactNode {
  if (content === null || content === undefined) return null;
  if (typeof content === "string") return <TextBlock text={content} />;
  if (Array.isArray(content)) {
    const text = content
      .filter((item) => item.type === "text" && item.text)
      .map((item) => item.text ?? "")
      .join("\n");
    return text ? <TextBlock text={text} /> : null;
  }
  return null;
}

const RESULT_COLLAPSE_THRESHOLD = 600;

export function ToolUseBlock({ toolUse, toolResult }: ToolUseBlockProps) {
  const [open, setOpen] = useState(false);
  const [resultExpanded, setResultExpanded] = useState(false);
  const isError = toolResult?.is_error ?? false;

  const blocksExpanded = useAppStore((s) => s.blocksExpanded);
  const resultsExpanded = useAppStore((s) => s.resultsExpanded);

  useEffect(() => { setOpen(blocksExpanded); }, [blocksExpanded]);
  useEffect(() => { setResultExpanded(resultsExpanded); }, [resultsExpanded]);

  const hint = getFirstParamHint(toolUse.input);

  // Estimate result length for "Show more"
  const resultText =
    typeof toolResult?.content === "string"
      ? toolResult.content
      : Array.isArray(toolResult?.content)
      ? toolResult.content
          .filter((c) => c.type === "text")
          .map((c) => c.text ?? "")
          .join("")
      : "";
  const isLongResult = resultText.length > RESULT_COLLAPSE_THRESHOLD;
  const shouldCollapse = isLongResult && !resultExpanded;

  return (
    <div
      style={{
        background: isError ? "var(--tool-error-bg)" : "var(--bg-tool-block)",
        border: `1px solid ${isError ? "var(--tool-error-border)" : "var(--border-subtle)"}`,
        borderRadius: "var(--radius-md)",
        margin: "10px 0",
        overflow: "hidden",
      }}
    >
      {/* Header — always visible, click to toggle input */}
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "8px",
          width: "100%",
          padding: "10px 14px",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          fontFamily: "var(--font-ui)",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: "8px",
            transition: "transform var(--transition-fast)",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
            color: "var(--text-tertiary)",
            flexShrink: 0,
          }}
        >
          ▶
        </span>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: "13px",
            fontWeight: 600,
            color: "var(--tool-name-color)",
          }}
        >
          {toolUse.name}
        </span>
        {hint && (
          <span
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              color: "var(--text-tertiary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
              flex: 1,
            }}
          >
            {hint}
          </span>
        )}
        {isError && (
          <span
            style={{
              fontSize: "11px",
              color: "var(--tool-error-text)",
              background: "var(--tool-error-bg)",
              padding: "2px 6px",
              borderRadius: "var(--radius-pill)",
              flexShrink: 0,
            }}
          >
            error
          </span>
        )}
      </button>

      {/* Input — collapsible */}
      {open && (
        <div
          style={{
            padding: "0 14px 12px",
            borderTop: `1px solid ${isError ? "var(--tool-error-border)" : "var(--border-subtle)"}`,
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              padding: "8px 0 6px",
            }}
          >
            Input
          </div>
          <pre
            style={{
              background: "var(--bg-code)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-mono)",
              fontSize: "12px",
              padding: "10px 12px",
              overflowX: "auto",
              maxWidth: "100%",
              margin: 0,
              color: "var(--text-code)",
              lineHeight: 1.5,
            }}
          >
            {JSON.stringify(toolUse.input, null, 2)}
          </pre>
        </div>
      )}

      {/* Result — always shown when present */}
      {toolResult !== null && toolResult !== undefined && (
        <div
          style={{
            borderTop: `1px solid ${isError ? "var(--tool-error-border)" : "var(--border-subtle)"}`,
            padding: "10px 14px 12px",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              marginBottom: "8px",
            }}
          >
            Result
          </div>
          <div
            style={{
              color: isError ? "var(--tool-error-text)" : "var(--text-primary)",
              overflowX: shouldCollapse ? "hidden" : "auto",
              overflowY: shouldCollapse ? "hidden" : "visible",
              maxHeight: shouldCollapse ? "200px" : "none",
              position: "relative",
              width: "100%",
              boxSizing: "border-box",
            }}
          >
            {renderResultContent(toolResult.content)}
            {shouldCollapse && (
              <div
                style={{
                  position: "absolute",
                  bottom: 0,
                  left: 0,
                  right: 0,
                  height: "60px",
                  background: `linear-gradient(transparent, var(--bg-tool-block))`,
                }}
              />
            )}
          </div>
          {isLongResult && (
            <button
              onClick={() => setResultExpanded((v) => !v)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-secondary)",
                fontSize: "13px",
                padding: "4px 0",
                fontFamily: "var(--font-ui)",
                textDecoration: "underline",
                marginTop: "4px",
              }}
            >
              {resultExpanded ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
