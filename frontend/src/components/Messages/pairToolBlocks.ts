import type {
  ContentBlock,
  TextBlock,
  ThinkingBlock,
  ToolUseBlock,
  ToolResultBlock,
  ImageBlock,
} from "../../api/types";

export type ToolUsePair = {
  type: "tool_use_pair";
  toolUse: ToolUseBlock;
  toolResult: ToolResultBlock | null;
};

export type PairedBlock = TextBlock | ThinkingBlock | ToolUsePair | ImageBlock;

/**
 * Takes a flat ContentBlock[] and pairs each tool_use with its matching
 * tool_result (by tool_use_id). Tool results are consumed and not emitted
 * separately. Order is preserved; tool_use appears where it did originally.
 */
export function pairToolBlocks(blocks: ContentBlock[]): PairedBlock[] {
  // First pass: collect all tool_result blocks indexed by tool_use_id
  const resultMap = new Map<string, ToolResultBlock>();
  for (const block of blocks) {
    if (block.type === "tool_result") {
      resultMap.set(block.tool_use_id, block);
    }
  }

  // Second pass: emit paired items, skip standalone tool_result blocks
  const result: PairedBlock[] = [];
  for (const block of blocks) {
    if (block.type === "text" || block.type === "thinking" || block.type === "image") {
      result.push(block);
    } else if (block.type === "tool_use") {
      result.push({
        type: "tool_use_pair",
        toolUse: block,
        toolResult: resultMap.get(block.id) ?? null,
      });
    }
    // tool_result consumed above; emitted via its paired tool_use
  }

  return result;
}
