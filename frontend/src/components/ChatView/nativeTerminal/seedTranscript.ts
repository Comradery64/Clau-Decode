// Render a session's prior message transcript into plain terminal text, so the
// Native view can seed xterm's scrollback with history on attach. Needed because
// `claude --resume` only paints ONE screen — the rest of the conversation lives
// in claude's own scroll, not xterm's, so a re-attach has nothing to scroll
// without this. Output is CR+LF-terminated and wrapped to the terminal width.
//
// This is deliberately a compact, readable rendering (not a faithful reproduction
// of claude's TUI): role headers + text, with one-line markers for tool calls /
// results / thinking / images. The live claude screen renders below the
// "live session" separator.

import type { ContentBlock, Message } from "../../../api/types";

const ESC = "\x1b";
const RESET = `${ESC}[0m`;
const DIM = `${ESC}[2m`;
const BOLD = `${ESC}[1m`;
const CYAN = `${ESC}[36m`;
const GREEN = `${ESC}[32m`;

// Word-wrap a plain (no-ANSI) line to `cols`. Long unbroken tokens are hard-split.
function wrapPlain(line: string, cols: number): string[] {
  if (line.length <= cols) return [line];
  const out: string[] = [];
  let rest = line;
  while (rest.length > cols) {
    let bp = rest.lastIndexOf(" ", cols);
    if (bp <= 0) bp = cols; // no space to break on — hard split
    out.push(rest.slice(0, bp));
    rest = rest.slice(bp).replace(/^ +/, "");
  }
  if (rest.length) out.push(rest);
  return out;
}

function truncate(s: string, n: number): string {
  const oneLine = s.replace(/\s+/g, " ").trim();
  return oneLine.length > n ? `${oneLine.slice(0, n - 1)}…` : oneLine;
}

// Non-text blocks → a single dim marker line (already short; not wrapped).
function markerForBlock(block: ContentBlock): string | null {
  switch (block.type) {
    case "thinking":
      return `${DIM}  · thinking${RESET}`;
    case "tool_use":
      return `${DIM}  ⚙ ${block.name}${RESET}`;
    case "tool_result": {
      const c = block.content;
      const text = typeof c === "string"
        ? c
        : Array.isArray(c)
          ? c.map((p) => p.text ?? "").join(" ")
          : "";
      return `${DIM}  ↳ ${truncate(text, 100)}${RESET}`;
    }
    case "image":
      return `${DIM}  [image]${RESET}`;
    default:
      return null;
  }
}

export function renderTranscriptForTerminal(messages: Message[], cols: number): string {
  const width = Math.max(20, cols);
  const lines: string[] = [];

  for (const m of messages) {
    if (m.is_meta) continue;
    const header = m.role === "user"
      ? `${BOLD}${CYAN}▌ You${RESET}`
      : m.role === "assistant"
        ? `${BOLD}${GREEN}▌ Claude${RESET}`
        : `${DIM}▌ ${m.role}${RESET}`;
    lines.push(header);

    for (const block of m.content_blocks ?? []) {
      if (block.type === "text") {
        for (const raw of block.text.split("\n")) {
          for (const wrapped of wrapPlain(raw, width)) lines.push(wrapped);
        }
      } else {
        const marker = markerForBlock(block);
        if (marker) lines.push(marker);
      }
    }
    lines.push("");
  }

  const rule = "─".repeat(Math.min(width, 60));
  lines.push(`${DIM}${rule} live session ${rule}${RESET}`);
  lines.push("");

  // xterm raw write needs CR+LF to return to column 0 on each new line.
  return lines.join("\r\n") + "\r\n";
}
