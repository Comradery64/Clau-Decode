import type { FileTouchEntry } from "../../api/types";
import { splitPath } from "./fmt";

export function TouchedFilesList({ entries, onOpen }: { entries: FileTouchEntry[]; onOpen: (path: string) => void }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
      {entries.map((entry) => {
        const { name, dir } = splitPath(entry.file);
        return (
          <button
            key={entry.file}
            onClick={() => onOpen(entry.file)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "9px 12px",
              background: "transparent",
              border: "none",
              borderRadius: "var(--radius-md)",
              cursor: "pointer",
              textAlign: "left",
              fontFamily: "inherit",
              color: "inherit",
              transition: "background 0.12s",
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = "var(--bg-tool-block)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = "transparent";
            }}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: "var(--text-tertiary)", flexShrink: 0 }} aria-hidden="true">
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
              <polyline points="14 2 14 8 20 8" />
            </svg>
            <div style={{ flex: 1, minWidth: 0, display: "flex", alignItems: "baseline", gap: "8px", overflow: "hidden" }}>
              <span style={{
                fontFamily: "var(--font-mono)",
                fontSize: "12.5px",
                color: "var(--text-primary)",
                whiteSpace: "nowrap",
                flexShrink: 0,
              }}>
                {name}
              </span>
              {dir && (
                <span style={{
                  fontSize: "11px",
                  color: "var(--text-tertiary)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  direction: "rtl",
                  textAlign: "left",
                }}>
                  {dir}
                </span>
              )}
            </div>
            <span style={{
              fontSize: "11px",
              fontFamily: "var(--font-mono)",
              color: "var(--text-tertiary)",
              flexShrink: 0,
            }}>
              {entry.count}× edits
            </span>
          </button>
        );
      })}
    </div>
  );
}
