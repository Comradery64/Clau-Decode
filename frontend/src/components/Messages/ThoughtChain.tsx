import { useState, useMemo, useEffect } from "react";
import type { CSSProperties, ReactNode } from "react";
import type { PairedBlock, ToolUsePair } from "./pairToolBlocks";
import type { ToolUseBlock as ToolUseBlockType, ToolResultBlock } from "../../api/types";
import { getBlocksExpanded, subscribeBlocksExpanded } from "../../store/blocksState";
import hljs from "../../utils/hljs";

// ============================================================
// Icons
// ============================================================

function ChevronIcon({ open }: { open: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 11 11"
      fill="none"
      style={{
        transform: open ? "rotate(90deg)" : "rotate(0deg)",
        transition: "transform 150ms ease",
        flexShrink: 0,
      }}
    >
      <path
        d="M4 2.5l3 3-3 3"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ClockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M7 3.5V7l2.5 1.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function FileIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M2.5 1.5h6l3 3V12a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V2a.5.5 0 0 1 .5-.5z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
      <path d="M8.5 1.5V4.5H11.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TerminalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <rect x="1.5" y="2" width="11" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4 5.5l2.5 1.5L4 8.5M7.5 9H10" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function EyeIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M1.5 7s2-4 5.5-4 5.5 4 5.5 4-2 4-5.5 4S1.5 7 1.5 7z" stroke="currentColor" strokeWidth="1.2" />
      <circle cx="7" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.2" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M9.5 2l2.5 2.5-7.5 7.5H2V9.5L9.5 2z" stroke="currentColor" strokeWidth="1.2" strokeLinejoin="round" />
    </svg>
  );
}

function CheckCircleIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <circle cx="7" cy="7" r="5.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M4.5 7l2 2L9.5 5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function getToolIcon(name: string) {
  const n = name.toLowerCase();
  if (n.includes("write") || n.includes("create") || n.includes("notebook")) return <FileIcon />;
  if (n.includes("bash") || n.includes("execute") || n.includes("run") || n.includes("command")) return <TerminalIcon />;
  if (n.includes("read") || n.includes("view") || n.includes("glob") || n.includes("ls") || n.includes("search") || n.includes("grep") || n.includes("find")) return <EyeIcon />;
  if (n.includes("edit") || n.includes("patch") || n.includes("replace") || n.includes("str_replace")) return <PencilIcon />;
  return <FileIcon />;
}

// ============================================================
// Helpers
// ============================================================

function getToolSummary(toolUse: ToolUseBlockType): { description: string; badge: string | null } {
  const input = toolUse.input;
  const name = toolUse.name.toLowerCase();
  const filePath = (input.file_path as string) || (input.path as string) || "";
  const fileName = filePath ? (filePath.split("/").pop() ?? filePath) : "";

  if (name === "todowrite") {
    return { description: "Update Todos", badge: null };
  }
  if (name.includes("write") || name.includes("create")) {
    return { description: fileName ? `Created ${fileName}` : toolUse.name, badge: fileName || null };
  }
  if (name.includes("edit") || name.includes("patch") || name.includes("str_replace")) {
    return { description: fileName ? `Edited ${fileName}` : toolUse.name, badge: fileName || null };
  }
  if (name.includes("read") || name.includes("view")) {
    return { description: fileName ? `Read ${fileName}` : toolUse.name, badge: fileName || null };
  }
  if (name.includes("bash") || name.includes("execute")) {
    const command = (input.command as string) || (input.cmd as string) || "";
    return { description: command ? command.slice(0, 72) + (command.length > 72 ? "…" : "") : toolUse.name, badge: null };
  }
  if (name.includes("glob") || name.includes("grep") || name.includes("find") || name.includes("search")) {
    const pattern = (input.pattern as string) || (input.query as string) || "";
    return { description: pattern ? `Search: ${pattern}` : toolUse.name, badge: null };
  }
  const firstVal = Object.values(input)[0];
  return {
    description: typeof firstVal === "string" && firstVal.length < 80 ? firstVal : toolUse.name,
    badge: null,
  };
}

function computeTitle(blocks: PairedBlock[]): string {
  const toolPairs = blocks.filter((b): b is ToolUsePair => b.type === "tool_use_pair");
  const hasThinking = blocks.some((b) => b.type === "thinking");

  if (toolPairs.length === 0) return "Thought for a moment";
  if (toolPairs.length === 1) {
    const { description } = getToolSummary(toolPairs[0].toolUse);
    return description.length <= 60 ? description : "Used 1 tool";
  }

  const writtenFiles = toolPairs
    .filter((b) => b.toolUse.name.toLowerCase().includes("write"))
    .map((b) => (b.toolUse.input.file_path as string || "").split("/").pop() ?? "")
    .filter(Boolean);

  if (writtenFiles.length === 1) return `Created ${writtenFiles[0]}`;
  if (writtenFiles.length > 1 && writtenFiles.length <= 3) return `Created ${writtenFiles.join(", ")}`;
  if (writtenFiles.length > 3) return `Created ${writtenFiles.length} files`;

  return `${hasThinking ? "Thought and used" : "Used"} ${toolPairs.length} tool${toolPairs.length !== 1 ? "s" : ""}`;
}

// ============================================================
// Shared layout constants
// ============================================================

const iconCol: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  alignItems: "center",
  width: "18px",
  flexShrink: 0,
};

const connectorLine: CSSProperties = {
  flex: 1,
  width: 1,
  background: "var(--border-subtle)",
  margin: "3px 0",
  minHeight: "10px",
};

// ============================================================
// Tool input renderers
// ============================================================

const CODE_PRE: CSSProperties = {
  background: "var(--bg-code)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "var(--radius-sm)",
  fontFamily: "var(--font-mono)",
  fontSize: "12px",
  padding: "8px 10px",
  overflowX: "auto",
  margin: "6px 0 0",
  lineHeight: 1.5,
  color: "var(--text-code)",
  whiteSpace: "pre-wrap",
  wordBreak: "break-all",
};

function HighlightedJson({ value }: { value: string }) {
  const html = useMemo(() => hljs.highlight(value, { language: "json" }).value, [value]);
  return <pre dangerouslySetInnerHTML={{ __html: html }} style={CODE_PRE} />;
}

function BashInput({ command }: { command: string }) {
  const html = useMemo(() => {
    try { return hljs.highlight(command, { language: "bash" }).value; }
    catch { return command.replace(/&/g, "&amp;").replace(/</g, "&lt;"); }
  }, [command]);
  return <pre dangerouslySetInnerHTML={{ __html: html }} style={CODE_PRE} />;
}

function DiffView({ filePath, oldStr, newStr }: { filePath?: string; oldStr?: string; newStr?: string }) {
  const removedLines = oldStr ? oldStr.split("\n") : [];
  const addedLines = newStr ? newStr.split("\n") : [];
  const statsLine = [
    addedLines.length > 0 && newStr ? `+${addedLines.length} line${addedLines.length !== 1 ? "s" : ""}` : "",
    removedLines.length > 0 && oldStr ? `-${removedLines.length} line${removedLines.length !== 1 ? "s" : ""}` : "",
  ].filter(Boolean).join("  ");

  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", overflow: "hidden", margin: "6px 0 0", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
      <div style={{ padding: "4px 10px", background: "var(--bg-code-block-header)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "var(--text-code-lang)", fontSize: "11px" }}>
          {filePath ? filePath.split("/").pop() : "diff"}
        </span>
        {statsLine && (
          <span style={{ fontSize: "10px", color: "var(--text-tertiary)", letterSpacing: "0.03em" }}>{statsLine}</span>
        )}
      </div>
      <div style={{ maxHeight: "320px", overflowY: "auto" }}>
        {removedLines.map((line, i) => (
          <div key={`-${i}`} style={{ display: "flex", background: "rgba(239,68,68,0.07)", borderLeft: "2px solid rgba(239,68,68,0.45)" }}>
            <span style={{ color: "#ef4444", padding: "0 8px", userSelect: "none", flexShrink: 0, lineHeight: "1.6em" }}>-</span>
            <span style={{ color: "var(--text-primary)", padding: "0 8px 0 0", lineHeight: "1.6em", whiteSpace: "pre-wrap", wordBreak: "break-all", flex: 1 }}>{line}</span>
          </div>
        ))}
        {addedLines.map((line, i) => (
          <div key={`+${i}`} style={{ display: "flex", background: "rgba(34,197,94,0.07)", borderLeft: "2px solid rgba(34,197,94,0.45)" }}>
            <span style={{ color: "#22c55e", padding: "0 8px", userSelect: "none", flexShrink: 0, lineHeight: "1.6em" }}>+</span>
            <span style={{ color: "var(--text-primary)", padding: "0 8px 0 0", lineHeight: "1.6em", whiteSpace: "pre-wrap", wordBreak: "break-all", flex: 1 }}>{line}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function FileContentView({ filePath, content }: { filePath?: string; content: string }) {
  const lines = content.split("\n");
  return (
    <div style={{ border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-sm)", overflow: "hidden", margin: "6px 0 0", fontSize: "12px", fontFamily: "var(--font-mono)" }}>
      <div style={{ padding: "4px 10px", background: "var(--bg-code-block-header)", borderBottom: "1px solid var(--border-subtle)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{ color: "var(--text-code-lang)", fontSize: "11px" }}>{filePath ? filePath.split("/").pop() : "file"}</span>
        <span style={{ fontSize: "10px", color: "var(--text-tertiary)" }}>+{lines.length} lines</span>
      </div>
      <pre style={{ ...CODE_PRE, margin: 0, borderRadius: 0, border: "none", maxHeight: "320px", overflowY: "auto" }}>{content}</pre>
    </div>
  );
}

function renderToolInput(toolUse: ToolUseBlockType): ReactNode {
  const name = toolUse.name.toLowerCase();
  const input = toolUse.input as Record<string, unknown>;

  if (name.includes("bash") || name === "execute") {
    const command = (input.command as string) || (input.cmd as string) || "";
    if (command) return <BashInput command={command} />;
  }

  if (name.includes("str_replace") || name.includes("edit") || name.includes("patch")) {
    const oldStr = input.old_string as string | undefined;
    const newStr = input.new_string as string | undefined;
    if (oldStr !== undefined || newStr !== undefined) {
      return <DiffView filePath={input.file_path as string | undefined} oldStr={oldStr} newStr={newStr} />;
    }
  }

  if (name.includes("write") || name.includes("create")) {
    const content = (input.content as string) || (input.new_file as string) || "";
    if (content) return <FileContentView filePath={input.file_path as string | undefined} content={content} />;
  }

  return <HighlightedJson value={JSON.stringify(input, null, 2)} />;
}

// ============================================================
// Specialized inline tool renderers
// ============================================================

function TodoListView({ todos }: { todos: Array<{ content: string; status: string }> }) {
  return (
    <div style={{ marginTop: "8px", display: "flex", flexDirection: "column", gap: "4px" }}>
      {todos.map((todo, i) => {
        const done = todo.status === "completed";
        const active = todo.status === "in_progress";
        return (
          <div key={i} style={{ display: "flex", alignItems: "flex-start", gap: "8px" }}>
            <span
              style={{
                flexShrink: 0,
                fontSize: "12px",
                lineHeight: "1.6",
                color: done ? "#22c55e" : active ? "var(--accent-orange)" : "var(--border-strong)",
              }}
            >
              {done ? "✓" : active ? "▸" : "○"}
            </span>
            <span
              style={{
                fontSize: "13px",
                color: done ? "var(--text-tertiary)" : "var(--text-secondary)",
                lineHeight: 1.6,
                textDecoration: done ? "line-through" : "none",
                opacity: done ? 0.7 : 1,
                wordBreak: "break-word",
              }}
            >
              {todo.content}
            </span>
          </div>
        );
      })}
    </div>
  );
}

const BASH_OUT_LIMIT = 500;

function BashInOutView({ command, result, isError }: { command: string; result: string; isError?: boolean }) {
  const rowStyle: CSSProperties = { display: "flex", alignItems: "stretch" };
  const labelStyle: CSSProperties = {
    padding: "5px 8px",
    fontWeight: 700,
    fontSize: "10px",
    letterSpacing: "0.06em",
    borderRight: "1px solid var(--border-subtle)",
    flexShrink: 0,
    display: "flex",
    alignItems: "center",
    background: "var(--bg-code-block-header)",
    color: "var(--text-tertiary)",
    width: "34px",
    justifyContent: "center",
  };
  const preStyle = (err?: boolean): CSSProperties => ({
    margin: 0,
    padding: "10px 10px",
    fontFamily: "var(--font-mono)",
    fontSize: "12px",
    background: err ? "var(--tool-error-bg)" : "var(--bg-code)",
    color: err ? "var(--tool-error-text)" : "var(--text-code)",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    flex: 1,
    lineHeight: 1.5,
    maxHeight: "140px",
    overflowY: "auto",
  });
  const truncated = result.length > BASH_OUT_LIMIT ? result.slice(0, BASH_OUT_LIMIT) + "\n…" : result;
  return (
    <div
      style={{
        marginTop: "8px",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-sm)",
        overflow: "hidden",
        fontFamily: "var(--font-mono)",
        fontSize: "12px",
      }}
    >
      {command && (
        <div style={{ ...rowStyle, borderBottom: result ? "1px solid var(--border-subtle)" : "none" }}>
          <span style={labelStyle}>IN</span>
          <pre style={preStyle()}>{command}</pre>
        </div>
      )}
      {result && (
        <div style={rowStyle}>
          <span style={{ ...labelStyle, color: isError ? "var(--tool-error-text)" : "var(--text-tertiary)" }}>OUT</span>
          <pre style={preStyle(isError)}>{truncated}</pre>
        </div>
      )}
    </div>
  );
}

function renderInlineContent(toolUse: ToolUseBlockType, toolResult: ToolResultBlock | null): ReactNode {
  const name = toolUse.name.toLowerCase();
  const input = toolUse.input as Record<string, unknown>;

  if (name === "todowrite") {
    const todos = input.todos as Array<{ content: string; status: string }> | undefined;
    if (Array.isArray(todos) && todos.length > 0) return <TodoListView todos={todos} />;
  }

  if (name.includes("bash") || name === "execute") {
    const command = (input.command as string) || (input.cmd as string) || "";
    const result = toolResult ? renderResultText(toolResult.content) : "";
    if (command || result) return <BashInOutView command={command} result={result} isError={toolResult?.is_error} />;
  }

  return null;
}

// ============================================================
// Show more / less button
// ============================================================

function ShowMoreBtn({
  expanded,
  visible,
  onClick,
}: {
  expanded: boolean;
  visible: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        color: "var(--text-tertiary)",
        fontSize: "12px",
        padding: "3px 0 0",
        fontFamily: "var(--font-ui)",
        display: "block",
        opacity: visible ? 1 : 0,
        pointerEvents: visible ? "auto" : "none",
        transition: "opacity var(--transition-fast)",
      }}
      onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-secondary)")}
      onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text-tertiary)")}
    >
      {expanded ? "Show less" : "Show more"}
    </button>
  );
}

// ============================================================
// Thinking item
// ============================================================

const THINKING_LIMIT = 300;

function ThinkingItem({ thinking }: { thinking: string }) {
  const [globalExpanded, setGlobalExpanded] = useState(getBlocksExpanded);
  const [localExpanded, setLocalExpanded] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  const isLong = thinking.length > THINKING_LIMIT;
  useEffect(() => subscribeBlocksExpanded((v) => { setGlobalExpanded(v); setLocalExpanded(null); }), []);
  const expanded = localExpanded !== null ? localExpanded : globalExpanded;
  const display = isLong && !expanded ? thinking.slice(0, THINKING_LIMIT) + "…" : thinking;

  return (
    <div
      style={{ display: "flex", gap: "10px" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={iconCol}>
        <div style={{ color: "var(--text-tertiary)", lineHeight: 0, paddingTop: "1px" }}>
          <ClockIcon />
        </div>
        <div style={connectorLine} />
      </div>
      <div style={{ flex: 1, paddingBottom: "10px", minWidth: 0 }}>
        <p
          style={{
            margin: 0,
            fontSize: "13px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
          }}
        >
          {display}
        </p>
        {isLong && (
          <ShowMoreBtn
            expanded={expanded}
            visible={hovered || expanded}
            onClick={() => setLocalExpanded(!expanded)}
          />
        )}
      </div>
    </div>
  );
}

// ============================================================
// Tool use item
// ============================================================

function renderResultText(content: ToolResultBlock["content"]): string {
  if (!content) return "";
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .filter((c) => c.type === "text")
      .map((c) => c.text ?? "")
      .join("\n");
  }
  return "";
}

function ToolItem({
  toolUse,
  toolResult,
}: {
  toolUse: ToolUseBlockType;
  toolResult: ToolResultBlock | null;
}) {
  const [globalExpanded, setGlobalExpanded] = useState(getBlocksExpanded);
  const [localExpanded, setLocalExpanded] = useState<boolean | null>(null);
  const [hovered, setHovered] = useState(false);
  useEffect(() => subscribeBlocksExpanded((v) => { setGlobalExpanded(v); setLocalExpanded(null); }), []);
  const expanded = localExpanded !== null ? localExpanded : globalExpanded;
  const { description, badge } = getToolSummary(toolUse);
  const resultText = toolResult ? renderResultText(toolResult.content) : "";
  const RESULT_LIMIT = 600;
  const inlineContent = renderInlineContent(toolUse, toolResult);

  return (
    <div
      style={{ display: "flex", gap: "10px" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <div style={iconCol}>
        <div style={{ color: "var(--text-tertiary)", lineHeight: 0, paddingTop: "1px" }}>
          {getToolIcon(toolUse.name)}
        </div>
        <div style={connectorLine} />
      </div>
      <div style={{ flex: 1, paddingBottom: "10px", minWidth: 0 }}>
        {/* Summary line */}
        <span
          style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            wordBreak: "break-word",
          }}
        >
          {description}
        </span>
        {!inlineContent && badge && (
          <div style={{ marginTop: "4px" }}>
            <span
              style={{
                display: "inline-block",
                fontSize: "11px",
                fontFamily: "var(--font-mono)",
                color: "var(--text-secondary)",
                background: "var(--bg-sidebar-active)",
                borderRadius: "4px",
                padding: "1px 7px",
              }}
            >
              {badge}
            </span>
          </div>
        )}

        {/* Specialized inline view — replaces show-more JSON for known tools */}
        {inlineContent}

        {/* Hover-reveal "Show more" + expanded JSON (non-specialized tools only) */}
        {!inlineContent && (
          <>
            <ShowMoreBtn
              expanded={expanded}
              visible={hovered || expanded}
              onClick={() => setLocalExpanded(!expanded)}
            />
            {expanded && (
              <div style={{ marginTop: "4px" }}>
                <div
                  style={{
                    fontSize: "10px",
                    fontWeight: 600,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.06em",
                    marginBottom: "2px",
                  }}
                >
                  Input
                </div>
                {renderToolInput(toolUse)}
                {resultText && (
                  <>
                    <div
                      style={{
                        fontSize: "10px",
                        fontWeight: 600,
                        color: toolResult?.is_error ? "var(--tool-error-text)" : "var(--text-tertiary)",
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                        marginTop: "8px",
                        marginBottom: "2px",
                      }}
                    >
                      Result
                    </div>
                    <pre
                      style={{
                        background: toolResult?.is_error ? "var(--tool-error-bg)" : "var(--bg-code)",
                        border: `1px solid ${toolResult?.is_error ? "var(--tool-error-border)" : "var(--border-subtle)"}`,
                        borderRadius: "var(--radius-sm)",
                        fontFamily: "var(--font-mono)",
                        fontSize: "12px",
                        padding: "8px 10px",
                        overflowX: "auto",
                        margin: 0,
                        lineHeight: 1.5,
                        color: toolResult?.is_error ? "var(--tool-error-text)" : "var(--text-code)",
                        whiteSpace: "pre-wrap",
                        wordBreak: "break-all",
                        maxHeight: "300px",
                        overflowY: "auto",
                      }}
                    >
                      {resultText.length > RESULT_LIMIT
                        ? resultText.slice(0, RESULT_LIMIT) + "\n…"
                        : resultText}
                    </pre>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

// ============================================================
// Done item
// ============================================================

function DoneItem() {
  return (
    <div style={{ display: "flex", gap: "10px", alignItems: "center" }}>
      <div style={{ width: "18px", display: "flex", justifyContent: "center", color: "var(--accent-orange)", flexShrink: 0 }}>
        <CheckCircleIcon />
      </div>
      <span style={{ fontSize: "13px", color: "var(--text-secondary)", fontFamily: "var(--font-ui)" }}>
        Done
      </span>
    </div>
  );
}

// ============================================================
// ThoughtChain — single collapsible wrapping all steps
// ============================================================

interface ThoughtChainProps {
  blocks: PairedBlock[];
}

export function ThoughtChain({ blocks }: ThoughtChainProps) {
  const [globalOpen, setGlobalOpen] = useState(getBlocksExpanded);
  const [localOpen, setLocalOpen] = useState<boolean | null>(null);
  useEffect(() => subscribeBlocksExpanded((v) => { setGlobalOpen(v); setLocalOpen(null); }), []);
  const open = localOpen !== null ? localOpen : globalOpen;
  const title = computeTitle(blocks);

  return (
    <div style={{ margin: "0 0 10px" }}>
      <button
        onClick={() => setLocalOpen(!open)}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: "6px",
          background: "none",
          border: "none",
          cursor: "pointer",
          color: "var(--text-secondary)",
          fontSize: "13px",
          fontFamily: "var(--font-ui)",
          padding: "2px 0",
          textAlign: "left",
        }}
      >
        <ChevronIcon open={open} />
        <span>{title}</span>
      </button>

      {open && (
        <div style={{ marginTop: "10px", paddingLeft: "4px" }}>
          {blocks.map((block, i) => {
            if (block.type === "thinking") {
              return <ThinkingItem key={i} thinking={block.thinking} />;
            }
            if (block.type === "tool_use_pair") {
              return (
                <ToolItem
                  key={i}
                  toolUse={block.toolUse}
                  toolResult={block.toolResult}
                />
              );
            }
            return null;
          })}
          <DoneItem />
        </div>
      )}
    </div>
  );
}
