export function EmptyState() {
  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        height: "100%",
        gap: "12px",
        color: "var(--text-tertiary)",
        userSelect: "none",
        padding: "24px",
      }}
    >
      <svg
        viewBox="0 0 40 40"
        width="56"
        height="56"
        aria-hidden="true"
        style={{ opacity: 0.6 }}
      >
        <circle cx="20" cy="20" r="20" fill="var(--accent-orange)" opacity="0.12" />
        <text
          x="20"
          y="26"
          textAnchor="middle"
          fontSize="20"
          fill="var(--accent-orange)"
          fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
        >
          C
        </text>
      </svg>
      <p
        style={{
          margin: 0,
          fontSize: "15px",
          color: "var(--text-secondary)",
          letterSpacing: "0.01em",
          fontWeight: 500,
        }}
      >
        Select a conversation to view
      </p>
      <p
        style={{
          margin: 0,
          fontSize: "13px",
          color: "var(--text-tertiary)",
          letterSpacing: "0.01em",
        }}
      >
        Browse sessions in the sidebar or use keyboard shortcuts
      </p>
    </div>
  );
}

export function MessageSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div
      role="status"
      aria-label="Loading conversation"
      style={{
        padding: "20px 24px",
        display: "flex",
        flexDirection: "column",
        gap: "16px",
      }}
    >
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          data-skeleton
          style={{
            display: "flex",
            gap: "12px",
            alignItems: "flex-start",
            flexDirection: i % 2 === 0 ? "row" : "row-reverse",
          }}
        >
          <div
            style={{
              width: i % 2 === 0 ? "70%" : "50%",
              height: `${14 + (i % 3) * 4}px`,
              borderRadius: "var(--radius-md)",
              background: "var(--bg-tool-block)",
              animation: "skeleton-pulse 1.5s ease-in-out infinite",
              animationDelay: `${i * 0.15}s`,
            }}
          />
        </div>
      ))}
    </div>
  );
}
