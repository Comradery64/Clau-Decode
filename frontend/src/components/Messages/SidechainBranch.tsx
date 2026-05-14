import type { Message } from "../../api/types";
import { AssistantMessage } from "./AssistantMessage";

interface SidechainBranchProps {
  messages: Message[];
}

export function SidechainBranch({ messages }: SidechainBranchProps) {
  if (messages.length === 0) return null;

  return (
    <details
      style={{
        margin: "4px 24px",
        background: "var(--bg-tool-result)",
        border: "1px solid var(--border-subtle)",
        borderRadius: "var(--radius-md)",
        padding: "0",
      }}
    >
      <summary
        style={{
          padding: "8px 12px",
          fontSize: "13px",
          color: "var(--text-secondary)",
          cursor: "pointer",
          userSelect: "none",
          listStyle: "none",
        }}
      >
        ▶ Sub-agent response ({messages.length} message{messages.length !== 1 ? "s" : ""})
      </summary>
      <div
        style={{
          padding: "8px 0",
          borderTop: "1px solid var(--border-subtle)",
        }}
      >
        {messages.map((m) =>
          m.role === "assistant" ? (
            <AssistantMessage key={m.id} messages={[m]} model={m.model ?? null} />
          ) : null
        )}
      </div>
    </details>
  );
}
