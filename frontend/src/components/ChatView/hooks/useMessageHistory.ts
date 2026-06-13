import { useEffect, useRef } from "react";
import { useSessionDetail } from "../../Messages/hooks/useSessionDetail";

// Terminal-style Up/Down message recall for the chat input.
//
// History is seeded from all past user messages in the session JSONL and grows
// as the user sends new messages. Up walks backwards (older), Down walks
// forwards (newer). The "saved" buffer remembers what the user was typing
// before they started navigating, so Down past position 0 restores it.
//
// The cursor-at-edge guard is enforced by the consumer's onKeyDown — this hook
// only fires when called.
export interface MessageHistoryApi {
  // Pulls the previous (older) history entry. Returns the recalled text if a
  // step was taken, or null if at the oldest entry / empty history.
  // `currentInput` is what the user has typed so far, captured into the
  // "saved" buffer the first time we step backwards.
  stepBack(currentInput: string): string | null;
  // Pulls the next (newer) history entry, or restores the saved input when
  // walking forward past the most recent entry. Returns the new text to show,
  // or null if not currently navigating.
  stepForward(): string | null;
  // Records a sent message and resets navigation position.
  recordSend(text: string): void;
  // Resets navigation position without touching history (call on user typing).
  resetPosition(): void;
}

export function useMessageHistory(sessionId: string): MessageHistoryApi {
  const historyRef = useRef<string[]>([]);
  const historyPosRef = useRef(-1); // -1 = not browsing
  const savedInputRef = useRef("");

  // Seed history from all past user messages in the session (parsed from JSONL)
  const { detail } = useSessionDetail(sessionId);
  useEffect(() => {
    if (!detail?.messages) return;
    const texts: string[] = [];
    for (const msg of detail.messages) {
      if (msg.role !== "user") continue;
      const text = msg.content_blocks
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map((b) => b.text)
        .join("\n")
        .trim();
      if (text) texts.push(text);
    }
    historyRef.current = texts;
  }, [detail?.messages]);

  return {
    stepBack(currentInput: string): string | null {
      const history = historyRef.current;
      if (history.length === 0) return null;
      if (historyPosRef.current === -1) {
        savedInputRef.current = currentInput;
      }
      const nextPos = historyPosRef.current + 1;
      if (nextPos >= history.length) return null;
      historyPosRef.current = nextPos;
      return history[history.length - 1 - nextPos];
    },
    stepForward(): string | null {
      if (historyPosRef.current === -1) return null;
      const nextPos = historyPosRef.current - 1;
      historyPosRef.current = nextPos;
      if (nextPos === -1) return savedInputRef.current;
      return historyRef.current[historyRef.current.length - 1 - nextPos];
    },
    recordSend(text: string): void {
      historyRef.current.push(text);
      historyPosRef.current = -1;
    },
    resetPosition(): void {
      historyPosRef.current = -1;
    },
  };
}
