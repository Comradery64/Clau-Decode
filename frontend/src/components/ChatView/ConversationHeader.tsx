import { useState, useRef, useEffect, useCallback } from "react";
import type { Session } from "../../api/types";
import { api } from "../../api/client";
import { emit } from "../../utils/events";

function formatModelDisplay(model: string): string {
  const withoutPrefix = model.replace(/^claude-/i, "");
  const normalised = withoutPrefix.replace(/-(\d+)(?:-(\d+))?$/, (_m, major, minor) =>
    minor !== undefined ? ` ${major}.${minor}` : ` ${major}`
  );
  return normalised.replace(/^(\w)/, (c) => c.toUpperCase());
}

function IconDownload() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
      <polyline points="7 10 12 15 17 10"/>
      <line x1="12" y1="15" x2="12" y2="3"/>
    </svg>
  );
}

function IconRefresh() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="23 4 23 10 17 10"/>
      <polyline points="1 20 1 14 7 14"/>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
    </svg>
  );
}

interface ConversationHeaderProps {
  session: Session | null;
}

export function ConversationHeader({ session }: ConversationHeaderProps) {
  const title = session === null ? "Loading…" : (session.title ?? "Untitled");
  const modelLabel = session?.model ? formatModelDisplay(session.model) : null;
  const [exportOpen, setExportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const handleClickOutside = useCallback((e: MouseEvent) => {
    if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
      setExportOpen(false);
    }
  }, []);

  useEffect(() => {
    if (exportOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [exportOpen, handleClickOutside]);

  const handleExport = async (format: "json" | "md") => {
    if (!session) return;
    setExporting(true);
    setExportOpen(false);
    try {
      const { blob, filename } = await api.exportSession(session.id, format);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Export failed:", err);
    } finally {
      setExporting(false);
    }
  };

  const btnBase: React.CSSProperties = {
    background: "none",
    border: "none",
    cursor: "pointer",
    color: "var(--text-tertiary)",
    padding: "6px",
    borderRadius: "var(--radius-sm)",
    display: "flex",
    transition: "color var(--transition-fast), background var(--transition-fast)",
  };

  return (
    <div
      style={{
        position: "relative",
        flexShrink: 0,
      }}
    >
      <div
        style={{
          height: "var(--header-height)",
          display: "flex",
          alignItems: "center",
          padding: "0 20px",
          background: "var(--bg-base)",
          gap: "12px",
        }}
      >
        {/* Title */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "6px",
            flex: 1,
            minWidth: 0,
          }}
        >
          <h1
            style={{
              margin: 0,
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--text-primary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {title}
          </h1>
        </div>

        {/* Right side */}
        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
          {modelLabel && (
            <span
              style={{
                fontSize: "12px",
                color: "var(--text-secondary)",
              }}
            >
              {modelLabel}
            </span>
          )}

          {/* Export dropdown */}
          {session && (
            <div ref={dropdownRef} style={{ position: "relative" }}>
              <button
                onClick={() => setExportOpen(!exportOpen)}
                disabled={exporting}
                title="Export session"
                aria-label="Export session"
                style={btnBase}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
                  (e.currentTarget as HTMLButtonElement).style.background = "none";
                }}
              >
                <IconDownload />
              </button>
              {exportOpen && (
                <div
                  style={{
                    position: "absolute",
                    right: 0,
                    top: "100%",
                    zIndex: 100,
                    background: "var(--bg-elevated)",
                    border: "1px solid var(--border-default)",
                    borderRadius: "var(--radius-md)",
                    boxShadow: "var(--shadow-lg)",
                    minWidth: "140px",
                    overflow: "hidden",
                  }}
                >
                  <button
                    onClick={() => handleExport("json")}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 12px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: "13px",
                      color: "var(--text-primary)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "none";
                    }}
                  >
                    Export as JSON
                  </button>
                  <button
                    onClick={() => handleExport("md")}
                    style={{
                      display: "block",
                      width: "100%",
                      padding: "8px 12px",
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      textAlign: "left",
                      fontSize: "13px",
                      color: "var(--text-primary)",
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLButtonElement).style.background = "none";
                    }}
                  >
                    Export as Markdown
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            onClick={() => emit("refresh", undefined)}
            title="Refresh (⌘R / ⌘J)"
            aria-label="Refresh"
            style={btnBase}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
              (e.currentTarget as HTMLButtonElement).style.background = "none";
            }}
          >
            <IconRefresh />
          </button>
        </div>
      </div>
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: "-19px",
          height: "20px",
          background: "linear-gradient(to bottom, var(--bg-base), transparent)",
          pointerEvents: "none",
          zIndex: 1,
        }}
      />
    </div>
  );
}
