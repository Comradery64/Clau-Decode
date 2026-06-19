/**
 * blockRenderers — provider-to-component registry (the extension seam).
 *
 * Both claude and codex currently resolve to the SAME underlying components.
 * The visual divergence for Codex is carried entirely by:
 *   1. The [data-provider="codex"] CSS skin (theme.css) — accent, surfaces.
 *   2. The provider-aware model label in formatModelName (AssistantMessage.tsx).
 *   3. The sidebar GPT badge (SessionItem.tsx).
 *
 * A thin CodexAssistantMessage wrapper was considered but would add indirection
 * with zero functional difference since all Codex-specific presentation is
 * already driven by CSS context + the label branch. If a future requirement
 * needs a structurally distinct Codex turn layout, replace the `codex` entry
 * here with a dedicated wrapper component without touching the claude path.
 */
import { UserMessage } from "./UserMessage";
import { AssistantMessage } from "./AssistantMessage";
import type { ComponentType } from "react";
import type { Message } from "../../api/types";

// ---------------------------------------------------------------------------
// RendererSet — the two component slots MessageList renders through.
// ---------------------------------------------------------------------------

export interface RendererSet {
  UserMessage: ComponentType<{ message: Message }>;
  AssistantMessage: ComponentType<{ messages: Message[]; model: string | null }>;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

const BLOCK_RENDERERS: Record<string, RendererSet> = {
  claude: { UserMessage, AssistantMessage },
  // codex reuses identical components; CSS skin + label branch carry the diff.
  codex: { UserMessage, AssistantMessage },
};

/** Returns the renderer set for the given provider, falling back to claude. */
export function getRenderers(provider: string | undefined): RendererSet {
  return BLOCK_RENDERERS[provider ?? "claude"] ?? BLOCK_RENDERERS["claude"];
}
