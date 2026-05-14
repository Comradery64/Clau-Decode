import { useState } from "react";
import type { AppConfig } from "../../api/types";
import { api } from "../../api/client";

interface PathEditorProps {
  config: AppConfig;
  onConfigChange: (updated: AppConfig) => void;
}

export function PathEditor({ config, onConfigChange }: PathEditorProps) {
  const [newPath, setNewPath] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const applyChange = async (updated: AppConfig) => {
    setSaving(true);
    setError(null);
    try {
      const saved = await api.updateConfig(updated);
      await api.refresh();
      onConfigChange(saved);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = (path: string) => {
    applyChange({
      ...config,
      data_paths: config.data_paths.filter((p) => p !== path),
    });
  };

  const handleAdd = () => {
    const trimmed = newPath.trim();
    if (!trimmed || config.data_paths.includes(trimmed)) return;
    applyChange({
      ...config,
      data_paths: [...config.data_paths, trimmed],
    }).then(() => setNewPath(""));
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") handleAdd();
  };

  return (
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
        Data Paths
      </div>

      {/* Existing paths */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
        {config.data_paths.length === 0 && (
          <div style={{ fontSize: "13px", color: "var(--text-tertiary)", padding: "8px 0" }}>
            No paths configured
          </div>
        )}
        {config.data_paths.map((path) => (
          <div
            key={path}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
              background: "var(--bg-tool-block)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              padding: "6px 10px",
            }}
          >
            <code
              style={{
                flex: 1,
                fontSize: "12px",
                fontFamily: "var(--font-mono)",
                color: "var(--text-primary)",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {path}
            </code>
            <button
              onClick={() => handleRemove(path)}
              disabled={saving}
              aria-label={`Remove ${path}`}
              style={{
                background: "none",
                border: "none",
                cursor: saving ? "not-allowed" : "pointer",
                color: "var(--text-tertiary)",
                fontSize: "14px",
                lineHeight: 1,
                padding: "2px 4px",
                borderRadius: "var(--radius-sm)",
                flexShrink: 0,
                transition: "color var(--transition-fast)",
              }}
              onMouseEnter={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--tool-error-border)";
              }}
              onMouseLeave={(e) => {
                (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
              }}
            >
              ×
            </button>
          </div>
        ))}
      </div>

      {/* Add path row */}
      <div style={{ display: "flex", gap: "8px" }}>
        <input
          type="text"
          value={newPath}
          onChange={(e) => setNewPath(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="/path/to/claude/sessions"
          style={{
            flex: 1,
            padding: "7px 10px",
            fontSize: "13px",
            fontFamily: "var(--font-mono)",
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: "var(--radius-sm)",
            color: "var(--text-primary)",
            outline: "none",
          }}
        />
        <button
          onClick={handleAdd}
          disabled={saving || !newPath.trim()}
          style={{
            padding: "7px 14px",
            fontSize: "13px",
            background: newPath.trim() ? "var(--accent-orange)" : "var(--bg-tool-block)",
            color: newPath.trim() ? "var(--text-on-accent)" : "var(--text-tertiary)",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: newPath.trim() && !saving ? "pointer" : "not-allowed",
            fontFamily: "var(--font-ui)",
            transition: "background var(--transition-fast)",
            flexShrink: 0,
          }}
        >
          Add
        </button>
      </div>

      {error && (
        <div
          style={{
            marginTop: "8px",
            fontSize: "12px",
            color: "var(--tool-error-border)",
          }}
        >
          {error}
        </div>
      )}
    </div>
  );
}
