import { useState, useEffect } from "react";
import type { AppConfig } from "../../api/types";
import { api } from "../../api/client";
import { useAppStore } from "../../store";
import type { SessionSortOrder } from "../../store";
import { PathEditor } from "./PathEditor";

export default function SettingsModal() {
  const closeSettings = useAppStore((s) => s.closeSettings);
  const sessionSortOrder = useAppStore((s) => s.sessionSortOrder);
  const setSessionSortOrder = useAppStore((s) => s.setSessionSortOrder);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api
      .getConfig()
      .then(setConfig)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load config");
      });
  }, []);

  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") closeSettings();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [closeSettings]);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Settings"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        background: "var(--bg-modal-overlay)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "16px",
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) closeSettings();
      }}
    >
      <div
        style={{
          width: "100%",
          maxWidth: "480px",
          background: "var(--bg-modal)",
          borderRadius: "var(--radius-lg)",
          boxShadow: "var(--shadow-lg)",
          display: "flex",
          flexDirection: "column",
          maxHeight: "calc(100vh - 64px)",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "20px 24px 16px",
            borderBottom: "1px solid var(--border-subtle)",
          }}
        >
          <h2
            style={{
              margin: 0,
              fontSize: "16px",
              fontWeight: 600,
              color: "var(--text-primary)",
            }}
          >
            Settings
          </h2>
          <button
            onClick={closeSettings}
            aria-label="Close settings"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-tertiary)",
              fontSize: "20px",
              lineHeight: 1,
              padding: "4px",
              borderRadius: "var(--radius-sm)",
              transition: "color var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
            }}
          >
            ×
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: "auto", padding: "20px 24px" }}>
          {loadError && (
            <div
              style={{
                padding: "12px",
                background: "var(--tool-error-bg)",
                border: "1px solid var(--tool-error-border)",
                borderRadius: "var(--radius-sm)",
                fontSize: "13px",
                color: "var(--tool-error-border)",
                marginBottom: "16px",
              }}
            >
              {loadError}
            </div>
          )}

          {!config && !loadError && (
            <div
              style={{
                textAlign: "center",
                padding: "24px",
                fontSize: "13px",
                color: "var(--text-tertiary)",
              }}
            >
              Loading…
            </div>
          )}

          {config && (
            <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
              {/* Data Paths section */}
              <PathEditor config={config} onConfigChange={setConfig} />

              {/* Sort order section */}
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "10px",
                  }}
                >
                  Session order
                </div>
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

              {/* Theme section */}
              <div>
                <div
                  style={{
                    fontSize: "12px",
                    fontWeight: 600,
                    color: "var(--text-tertiary)",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                    marginBottom: "10px",
                  }}
                >
                  Theme
                </div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {(["light", "dark", "system"] as const).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => {
                        const updated = { ...config, theme };
                        setConfig(updated);
                        api.updateConfig(updated).catch(() => {});
                        // Apply immediately to the DOM — don't wait for API round-trip
                        const applyTheme = (
                          window as Window & { __clauDecodeApplyTheme?: (t: string) => void }
                        ).__clauDecodeApplyTheme;
                        if (applyTheme) applyTheme(theme);
                      }}
                      style={{
                        padding: "6px 14px",
                        fontSize: "13px",
                        background:
                          config.theme === theme
                            ? "var(--accent-orange)"
                            : "var(--bg-tool-block)",
                        color:
                          config.theme === theme
                            ? "var(--text-on-accent)"
                            : "var(--text-secondary)",
                        border: "1px solid",
                        borderColor:
                          config.theme === theme
                            ? "var(--accent-orange)"
                            : "var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                        cursor: "pointer",
                        fontFamily: "var(--font-ui)",
                        textTransform: "capitalize",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            padding: "16px 24px",
            borderTop: "1px solid var(--border-subtle)",
            display: "flex",
            justifyContent: "flex-end",
          }}
        >
          <button
            onClick={closeSettings}
            style={{
              padding: "7px 16px",
              fontSize: "13px",
              background: "var(--bg-tool-block)",
              color: "var(--text-secondary)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              cursor: "pointer",
              fontFamily: "var(--font-ui)",
              transition: "all var(--transition-fast)",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background =
                "var(--bg-sidebar-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-tool-block)";
            }}
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
