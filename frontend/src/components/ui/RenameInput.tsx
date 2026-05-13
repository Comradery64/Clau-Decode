import { useState, useRef, useEffect } from "react";

// ---------------------------------------------------------------------------
// Rename inline input
// ---------------------------------------------------------------------------

export function RenameInput({
  initialValue,
  onCommit,
  onCancel,
}: {
  initialValue: string;
  onCommit: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
    inputRef.current?.select();
  }, []);

  const commit = () => {
    const trimmed = value.trim();
    if (trimmed) onCommit(trimmed);
    else onCancel();
  };

  return (
    <input
      ref={inputRef}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") { e.preventDefault(); commit(); }
        if (e.key === "Escape") { e.preventDefault(); onCancel(); }
      }}
      onBlur={() => { if (value.trim() && value.trim() !== initialValue) commit(); else onCancel(); }}
      onClick={(e) => e.stopPropagation()}
      style={{
        flex: 1,
        border: "1px solid var(--border-accent)",
        borderRadius: "var(--radius-sm)",
        background: "var(--bg-input)",
        color: "var(--text-primary)",
        fontSize: "14px",
        fontFamily: "var(--font-ui)",
        padding: "1px 6px",
        outline: "none",
        minWidth: 0,
      }}
    />
  );
}
