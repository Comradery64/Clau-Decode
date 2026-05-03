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
        gap: "16px",
        color: "var(--text-tertiary)",
        userSelect: "none",
      }}
    >
      <svg
        viewBox="0 0 40 40"
        width="48"
        height="48"
        aria-hidden="true"
        style={{ opacity: 0.8 }}
      >
        <circle cx="20" cy="20" r="20" fill="#d97706" opacity="0.15" />
        <text
          x="20"
          y="26"
          textAnchor="middle"
          fontSize="20"
          fill="#d97706"
          fontFamily="-apple-system, BlinkMacSystemFont, sans-serif"
        >
          C
        </text>
      </svg>
      <p
        style={{
          margin: 0,
          fontSize: "14px",
          color: "var(--text-tertiary)",
          letterSpacing: "0.01em",
        }}
      >
        Select a conversation to view
      </p>
    </div>
  );
}
