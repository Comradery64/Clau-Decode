import { useState, useEffect } from "react";
import { TextBlock } from "./TextBlock";
import { useAppStore } from "../../store";

interface ThinkingBlockProps {
  thinking: string;
}

export function ThinkingBlock({ thinking }: ThinkingBlockProps) {
  const [open, setOpen] = useState(false);
  const blocksExpanded = useAppStore((s) => s.blocksExpanded);
  useEffect(() => { setOpen(blocksExpanded); }, [blocksExpanded]);

  return (
    <div style={{ margin: "6px 0 10px" }}>
      <button
        onClick={() => setOpen((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "6px",
          background: "none",
          border: "none",
          cursor: "pointer",
          padding: "4px 0",
          fontFamily: "var(--font-ui)",
          fontSize: "13px",
          color: "var(--text-tertiary)",
          fontStyle: "italic",
        }}
      >
        <span
          style={{
            display: "inline-block",
            fontSize: "8px",
            transition: "transform var(--transition-fast)",
            transform: open ? "rotate(90deg)" : "rotate(0deg)",
          }}
        >
          ▶
        </span>
        <span>Thought for a moment</span>
      </button>
      {open && (
        <div
          style={{
            background: "var(--bg-thinking)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
            padding: "12px 14px",
            marginTop: "6px",
            borderLeft: "3px solid var(--border-strong)",
          }}
        >
          <TextBlock text={thinking} />
        </div>
      )}
    </div>
  );
}
