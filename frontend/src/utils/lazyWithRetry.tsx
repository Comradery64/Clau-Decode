import React from "react";

// Match the various flavours of "couldn't fetch / parse the JS chunk" errors
// thrown by Vite, webpack, and modern browsers when an /assets/<hash>.js file
// is missing or served with the wrong MIME type. We DON'T want to swallow
// generic runtime errors here — only chunk-load failures get the reload UI;
// everything else bubbles up to ErrorBoundary as before.
export function isChunkLoadError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  if (err.name === "ChunkLoadError") return true;
  const msg = err.message || "";
  return (
    /Failed to fetch dynamically imported module/i.test(msg) ||
    /Loading chunk \S+ failed/i.test(msg) ||
    /Failed to load module script/i.test(msg) ||
    /Importing a module script failed/i.test(msg)
  );
}

function ChunkLoadFallback() {
  return (
    <div
      role="alert"
      style={{
        padding: "24px",
        fontFamily: "var(--font-ui)",
        fontSize: "13px",
        color: "var(--text-primary)",
        background: "var(--bg-modal)",
        borderRadius: "var(--radius-lg)",
        maxWidth: "420px",
        margin: "40px auto",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <strong style={{ display: "block", marginBottom: "8px" }}>
        Update required
      </strong>
      <p style={{ margin: "0 0 16px", color: "var(--text-secondary)" }}>
        This part of the app couldn&apos;t load — usually because a newer build
        is on the server and your browser is holding a stale reference. Reload
        to pick up the latest version.
      </p>
      <button
        type="button"
        onClick={() => window.location.reload()}
        style={{
          padding: "6px 14px",
          cursor: "pointer",
          border: "1px solid var(--border-subtle)",
          background: "var(--bg-button)",
          color: "var(--text-primary)",
          borderRadius: "var(--radius-sm)",
          fontSize: "13px",
        }}
      >
        Reload
      </button>
    </div>
  );
}

/**
 * Drop-in replacement for `React.lazy` that converts chunk-load failures
 * (the "Failed to fetch dynamically imported module" class of errors, which
 * happen when a user's browser has a stale reference to a hash from a
 * previous build) into a visible, recoverable reload prompt instead of a
 * blank render-error screen.
 *
 * Non-chunk errors continue to surface through React's normal error path
 * so genuine bugs still hit ErrorBoundary.
 */
export function lazyWithRetry<T extends React.ComponentType<unknown>>(
  factory: () => Promise<{ default: T }>,
): React.LazyExoticComponent<React.ComponentType<unknown>> {
  return React.lazy(() =>
    factory().catch((err) => {
      if (isChunkLoadError(err)) {
        // Resolve to a synthetic module whose default export is the reload
        // prompt. Suspense then renders the prompt in the same slot the
        // original component would have occupied.
        return { default: ChunkLoadFallback as unknown as T };
      }
      throw err;
    }),
  );
}
