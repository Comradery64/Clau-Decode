import { useAppStore } from "../../store";
import type { SessionSortOrder } from "../../store";
import { sectionLabelStyle } from "./shared";

export function SortOrderSection() {
  const sessionSortOrder = useAppStore((s) => s.sessionSortOrder);
  const setSessionSortOrder = useAppStore((s) => s.setSessionSortOrder);

  return (
    <div>
      <div style={sectionLabelStyle}>Session order</div>
      <div style={{ display: "flex", gap: "8px" }}>
        {([
          ["recent", "Most recent"],
          ["oldest", "Oldest first"],
          ["alpha", "Project A–Z"],
        ] as [SessionSortOrder, string][]).map(([order, label]) => (
          <button
            key={order}
            onClick={() => setSessionSortOrder(order)}
            style={{
              padding: "6px 14px",
              fontSize: "13px",
              background: sessionSortOrder === order
                ? "var(--accent-orange)"
                : "var(--bg-tool-block)",
              color: sessionSortOrder === order
                ? "var(--text-on-accent)"
                : "var(--text-secondary)",
              border: "1px solid",
              borderColor: sessionSortOrder === order
                ? "var(--accent-orange)"
                : "var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              transition: "all var(--transition-fast)",
              whiteSpace: "nowrap",
            }}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
