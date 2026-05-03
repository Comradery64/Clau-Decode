import type { Message } from "../../api/types";
import { TextBlock } from "./TextBlock";
import { ThinkingBlock } from "./ThinkingBlock";
import { ToolUseBlock } from "./ToolUseBlock";
import { pairToolBlocks } from "./pairToolBlocks";

export function formatModelName(model: string): string {
  const lower = model.toLowerCase();
  const tierMatch = lower.match(/claude-(opus|sonnet|haiku|instant)[-_]?/);
  const tier = tierMatch ? tierMatch[1] : null;
  const versionMatch = lower.match(/(\d+)[-_](\d+)$/) ?? lower.match(/(\d+)$/);
  let version = "";
  if (versionMatch) {
    version = versionMatch.length === 3
      ? `${versionMatch[1]}.${versionMatch[2]}`
      : versionMatch[1];
  }
  if (tier) {
    const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);
    return version ? `${tierName} ${version}` : tierName;
  }
  return model;
}

interface AssistantMessageProps {
  messages: Message[];
  model: string | null;
}

export function AssistantMessage({ messages, model }: AssistantMessageProps) {
  const allBlocks = messages.flatMap((m) => m.content_blocks);
  const pairedBlocks = pairToolBlocks(allBlocks);

  const hasVisible = pairedBlocks.some(
    (b) =>
      b.type === "tool_use_pair" ||
      (b.type === "text" && b.text.trim() !== "") ||
      (b.type === "thinking" && b.thinking.trim() !== "")
  );
  if (!hasVisible) return null;

  return (
    <div style={{ padding: "4px 24px 16px" }}>
      {pairedBlocks.map((item, i) => {
        if (item.type === "text") {
          return <TextBlock key={i} text={item.text} />;
        }
        if (item.type === "thinking") {
          return <ThinkingBlock key={i} thinking={item.thinking} />;
        }
        if (item.type === "tool_use_pair") {
          return (
            <ToolUseBlock
              key={i}
              toolUse={item.toolUse}
              toolResult={item.toolResult}
            />
          );
        }
        return null;
      })}
      {model && (
        <div
          style={{
            marginTop: "8px",
            fontSize: "11px",
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-ui)",
          }}
        >
          {formatModelName(model)}
        </div>
      )}
    </div>
  );
}
