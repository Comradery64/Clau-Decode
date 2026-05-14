import React, { useState, useEffect } from "react";
import type { AppConfig, PermissionMode } from "../../api/types";
import { api, getCachedConfig, getConfigCached } from "../../api/client";
import { useAppStore } from "../../store";
import type { SessionSortOrder } from "../../store";
import { PathEditor } from "./PathEditor";
import { ScrollContainer } from "../ScrollContainer";

const PROFILE_COLORS = ["#b8956a", "#3b82f6", "#10b981", "#9b8ec4", "#c47a7a", "#c9a96e", "#7eb6c4", "#d4758a"];

function ProfileSection({ config, onConfigChange }: { config: AppConfig; onConfigChange: (c: AppConfig) => void }) {
  const [newName, setNewName] = useState("");
  const [newPath, setNewPath] = useState("");
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editNameValue, setEditNameValue] = useState("");
  const setProfiles = useAppStore((s) => s.setProfiles);
  const setActiveProfileId = useAppStore((s) => s.setActiveProfileId);

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    try {
      const created = await api.createProfile(name);
      setNewName("");
      const updated = { ...config, profiles: [...config.profiles, created] };
      onConfigChange(updated);
      const data = await api.getProfiles();
      setProfiles(data.profiles);
      setActiveProfileId(data.active_profile_id);
    } catch { /* ignore */ }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteProfile(id);
      const updated = { ...config, profiles: config.profiles.filter((p) => p.id !== id) };
      onConfigChange(updated);
      const data = await api.getProfiles();
      setProfiles(data.profiles);
      setActiveProfileId(data.active_profile_id);
    } catch { /* ignore */ }
  };

  const handleRename = async (id: string) => {
    const name = editNameValue.trim();
    if (!name) { setEditingNameId(null); return; }
    try {
      await api.updateProfile(id, { name });
      const updated = {
        ...config,
        profiles: config.profiles.map((p) => (p.id === id ? { ...p, name } : p)),
      };
      onConfigChange(updated);
      setProfiles(updated.profiles);
    } catch { /* ignore */ }
    setEditingNameId(null);
  };

  const handleColorChange = async (id: string, color: string) => {
    try {
      await api.updateProfile(id, { color });
      const updated = {
        ...config,
        profiles: config.profiles.map((p) => (p.id === id ? { ...p, color } : p)),
      };
      onConfigChange(updated);
      setProfiles(updated.profiles);
    } catch { /* ignore */ }
  };

  const handleAddPath = async (profileId: string) => {
    const path = newPath.trim();
    if (!path) return;
    const profile = config.profiles.find((p) => p.id === profileId);
    if (!profile) return;
    try {
      const updatedPaths = [...profile.data_paths, path];
      await api.updateProfile(profileId, { data_paths: updatedPaths });
      const updated = {
        ...config,
        profiles: config.profiles.map((p) => (p.id === profileId ? { ...p, data_paths: updatedPaths } : p)),
      };
      onConfigChange(updated);
      setProfiles(updated.profiles);
      setNewPath("");
    } catch { /* ignore */ }
  };

  const handleRemovePath = async (profileId: string, pathIndex: number) => {
    const profile = config.profiles.find((p) => p.id === profileId);
    if (!profile) return;
    const updatedPaths = profile.data_paths.filter((_, i) => i !== pathIndex);
    try {
      await api.updateProfile(profileId, { data_paths: updatedPaths });
      const updated = {
        ...config,
        profiles: config.profiles.map((p) => (p.id === profileId ? { ...p, data_paths: updatedPaths } : p)),
      };
      onConfigChange(updated);
      setProfiles(updated.profiles);
    } catch { /* ignore */ }
  };

  return (
    <div>
      <div
        style={{
          fontSize: "11px",
          fontWeight: 600,
          color: "var(--text-tertiary)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          marginBottom: "10px",
        }}
      >
        Profiles
      </div>

      {config.profiles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
          {config.profiles.map((p) => {
            const isExpanded = expandedId === p.id;
            return (
              <div
                key={p.id}
                style={{
                  background: "var(--bg-tool-block)",
                  borderRadius: "var(--radius-sm)",
                  border: "1px solid var(--border-subtle)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "10px",
                    padding: "8px 10px",
                    cursor: "pointer",
                  }}
                  onClick={() => setExpandedId(isExpanded ? null : p.id)}
                >
                  <span
                    style={{
                      width: "14px",
                      height: "14px",
                      borderRadius: "50%",
                      background: p.color,
                      flexShrink: 0,
                    }}
                  />
                  {editingNameId === p.id ? (
                    <input
                      value={editNameValue}
                      onChange={(e) => setEditNameValue(e.target.value)}
                      onBlur={() => handleRename(p.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") handleRename(p.id);
                        if (e.key === "Escape") setEditingNameId(null);
                      }}
                      autoFocus
                      style={{
                        flex: 1,
                        fontSize: "13px",
                        fontWeight: 500,
                        color: "var(--text-primary)",
                        background: "var(--bg-sidebar)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                        padding: "1px 6px",
                        fontFamily: "var(--font-ui)",
                        outline: "none",
                      }}
                    />
                  ) : (
                    <span
                      style={{ flex: 1, fontSize: "13px", color: "var(--text-primary)", fontWeight: 500, cursor: "text" }}
                      onClick={(e) => { e.stopPropagation(); setEditingNameId(p.id); setEditNameValue(p.name); }}
                    >
                      {p.name}
                    </span>
                  )}
                  <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
                    {p.data_paths.length} path{p.data_paths.length !== 1 ? "s" : ""}
                  </span>
                  <span style={{ fontSize: "9px", color: "var(--text-tertiary)", transition: "transform var(--transition-fast)", transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block" }}>▾</span>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(p.id); }}
                    style={{
                      background: "none",
                      border: "none",
                      cursor: "pointer",
                      color: "var(--text-tertiary)",
                      fontSize: "16px",
                      padding: "2px 4px",
                      lineHeight: 1,
                    }}
                    aria-label={`Delete profile ${p.name}`}
                  >
                    ×
                  </button>
                </div>

                {isExpanded && (
                  <div style={{ padding: "0 10px 10px", borderTop: "1px solid var(--border-subtle)" }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "8px 0" }}>
                      {PROFILE_COLORS.map((c) => (
                        <button
                          key={c}
                          onClick={() => handleColorChange(p.id, c)}
                          style={{
                            width: "22px",
                            height: "22px",
                            borderRadius: "50%",
                            background: c,
                            border: p.color === c ? "2px solid var(--text-primary)" : "2px solid transparent",
                            cursor: "pointer",
                            padding: 0,
                            transition: "border-color var(--transition-fast), transform var(--transition-fast)",
                            transform: p.color === c ? "scale(1.15)" : "scale(1)",
                          }}
                        />
                      ))}
                    </div>
                    <div style={{ fontSize: "11px", fontWeight: 600, color: "var(--text-tertiary)", textTransform: "uppercase", letterSpacing: "0.04em", margin: "8px 0 6px" }}>Data paths</div>
                    {p.data_paths.map((dp, i) => (
                      <div key={i} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
                        <code style={{ flex: 1, fontSize: "12px", color: "var(--text-secondary)", background: "var(--bg-sidebar)", padding: "4px 8px", borderRadius: "var(--radius-sm)" }}>
                          {dp}
                        </code>
                        <button
                          onClick={() => handleRemovePath(p.id, i)}
                          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--text-tertiary)", fontSize: "14px", padding: "2px 4px" }}
                          aria-label="Remove path"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                    <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                      <input
                        value={expandedId === p.id ? newPath : ""}
                        onChange={(e) => setNewPath(e.target.value)}
                        onKeyDown={(e) => { if (e.key === "Enter") handleAddPath(p.id); }}
                        placeholder="~/.claude"
                        style={{
                          flex: 1,
                          padding: "4px 8px",
                          fontSize: "12px",
                          background: "var(--bg-sidebar)",
                          color: "var(--text-primary)",
                          border: "1px solid var(--border-subtle)",
                          borderRadius: "var(--radius-sm)",
                          fontFamily: "var(--font-ui)",
                          outline: "none",
                        }}
                      />
                      <button
                        onClick={() => handleAddPath(p.id)}
                        disabled={!newPath.trim()}
                        style={{
                          padding: "4px 10px",
                          fontSize: "12px",
                          background: newPath.trim() ? "var(--accent-orange)" : "var(--bg-tool-block)",
                          color: newPath.trim() ? "var(--text-on-accent)" : "var(--text-tertiary)",
                          border: "1px solid",
                          borderColor: newPath.trim() ? "var(--accent-orange)" : "var(--border-subtle)",
                          borderRadius: "var(--radius-sm)",
                          cursor: newPath.trim() ? "pointer" : "default",
                          fontFamily: "var(--font-ui)",
                        }}
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          placeholder="New profile name…"
          style={{
            flex: 1,
            padding: "6px 10px",
            fontSize: "13px",
            background: "var(--bg-tool-block)",
            color: "var(--text-primary)",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            fontFamily: "var(--font-ui)",
            outline: "none",
          }}
        />
        <button
          onClick={handleCreate}
          disabled={!newName.trim()}
          style={{
            padding: "6px 14px",
            fontSize: "13px",
            background: newName.trim() ? "var(--accent-orange)" : "var(--bg-tool-block)",
            color: newName.trim() ? "var(--text-on-accent)" : "var(--text-tertiary)",
            border: "1px solid",
            borderColor: newName.trim() ? "var(--accent-orange)" : "var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            cursor: newName.trim() ? "pointer" : "default",
            fontFamily: "var(--font-ui)",
          }}
        >
          Add
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Shared style helpers — single typography scale, single muted palette.
// ---------------------------------------------------------------------------

// 11px uppercase section label · 13px body · 12px hint. No other sizes.
const sectionLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "10px",
  display: "flex",
  alignItems: "center",
};

const HINT_STYLE: React.CSSProperties = {
  fontSize: "12px",
  color: "var(--text-tertiary)",
  lineHeight: 1.5,
  marginTop: "6px",
};

// Muted danger that matches ChatInput's permission picker — no harsh #ef4444.
const TONE_DANGER = "#c47a7a";

function segmentBtnStyle(active: boolean): React.CSSProperties {
  return {
    padding: "6px 14px",
    fontSize: "13px",
    background: active ? "var(--accent-orange)" : "var(--bg-tool-block)",
    color: active ? "var(--text-on-accent)" : "var(--text-secondary)",
    border: "1px solid",
    borderColor: active ? "var(--accent-orange)" : "var(--border-subtle)",
    borderRadius: "var(--radius-sm)",
    cursor: "pointer",
    fontFamily: "var(--font-ui)",
    textTransform: "capitalize",
    transition: "all var(--transition-fast)",
  };
}

// Theme-aware checkbox — native <input> doesn't restyle its unchecked background
// for dark mode (renders white). This draws our own box from theme tokens so
// it reads correctly in both themes.
function Checkbox({
  checked,
  onChange,
  danger,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  const tint = danger ? TONE_DANGER : "var(--accent-orange)";
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      onClick={(e) => { e.preventDefault(); onChange(!checked); }}
      style={{
        width: "16px",
        height: "16px",
        flexShrink: 0,
        marginTop: "1px",
        background: checked ? tint : "var(--bg-tool-block)",
        border: `1px solid ${checked ? tint : "var(--border-default)"}`,
        borderRadius: "3px",
        cursor: "pointer",
        padding: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        transition: "background 120ms ease, border-color 120ms ease",
      }}
    >
      {checked && (
        <svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true">
          <path d="M2.5 6.2 5 8.7 9.5 3.5" stroke="var(--text-on-accent)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}

function ToggleRow({
  label, hint, checked, onChange, danger,
}: {
  label: string;
  hint?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  danger?: boolean;
}) {
  return (
    <div
      onClick={() => onChange(!checked)}
      style={{ display: "flex", alignItems: "flex-start", gap: "10px", cursor: "pointer" }}
    >
      <Checkbox checked={checked} onChange={onChange} danger={danger} />
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: "13px", color: danger && checked ? TONE_DANGER : "var(--text-primary)" }}>
          {label}
        </div>
        {hint && (
          <div style={{ fontSize: "12px", color: "var(--text-tertiary)", marginTop: "2px", lineHeight: 1.4 }}>
            {hint}
          </div>
        )}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Permission-mode section (Phase 9 Rev 2)
// ---------------------------------------------------------------------------

const PERMISSION_MODE_OPTIONS: Array<{
  value: PermissionMode;
  label: string;
  description: React.ReactNode;
}> = [
  {
    value: "dontAsk",
    label: "dontAsk",
    description: (
      <>
        <em>Recommended.</em> Run without prompting for permission.
      </>
    ),
  },
  {
    value: "acceptEdits",
    label: "acceptEdits",
    description: <>Auto-accept file edits; prompt for other tools.</>,
  },
  {
    value: "auto",
    label: "auto",
    description: <>Heuristic auto-approval.</>,
  },
  {
    value: "bypassPermissions",
    label: "bypassPermissions",
    description: (
      <>
        <em>Dangerous.</em> Skip all checks.
      </>
    ),
  },
  {
    value: "plan",
    label: "plan",
    description: <>Plan only, do not execute tools.</>,
  },
];

function PermissionModeSection({
  config,
  onChange,
}: {
  config: AppConfig;
  onChange: (updated: AppConfig) => void;
}) {
  const current: PermissionMode = config.claude_default_permission_mode ?? "dontAsk";
  const danger = current === "bypassPermissions";
  const selected = PERMISSION_MODE_OPTIONS.find((o) => o.value === current);
  return (
    <div>
      <div style={sectionLabelStyle}>
        Default permission mode
        {danger && (
          <span style={{
            marginLeft: "8px",
            fontSize: "10px",
            fontWeight: 600,
            letterSpacing: "0.04em",
            color: TONE_DANGER,
            background: "color-mix(in srgb, " + TONE_DANGER + " 16%, transparent)",
            border: `1px solid color-mix(in srgb, ${TONE_DANGER} 40%, transparent)`,
            borderRadius: "var(--radius-pill)",
            padding: "1px 7px",
            textTransform: "uppercase",
          }}>
            Dangerous
          </span>
        )}
      </div>
      <select
        value={current}
        onChange={(e) =>
          onChange({ ...config, claude_default_permission_mode: e.target.value as PermissionMode })
        }
        style={{
          width: "100%",
          padding: "8px 10px",
          fontSize: "13px",
          fontFamily: "var(--font-mono)",
          color: "var(--text-primary)",
          background: "var(--bg-input)",
          border: "1px solid var(--border-default)",
          borderRadius: "var(--radius-sm)",
          cursor: "pointer",
        }}
      >
        {PERMISSION_MODE_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
      {selected && (
        <div style={HINT_STYLE}>
          {selected.description}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Auto-recap section
// ---------------------------------------------------------------------------

function AutoRecapSection({
  config,
  onChange,
}: {
  config: AppConfig;
  onChange: (updated: AppConfig) => void;
}) {
  const enabled = config.claude_recap_enabled;
  const minutes = config.claude_recap_idle_minutes;
  return (
    <div>
      <div style={sectionLabelStyle}>Auto-recap</div>
      <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
        <ToggleRow
          label="Enable auto-recap"
          checked={enabled}
          onChange={(v) => onChange({ ...config, claude_recap_enabled: v })}
        />
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "10px",
            opacity: enabled ? 1 : 0.5,
          }}
        >
          <label style={{ fontSize: "13px", color: "var(--text-secondary)", minWidth: "100px" }}>
            Idle minutes
          </label>
          <input
            type="number"
            min={1}
            max={60}
            value={minutes}
            disabled={!enabled}
            onChange={(e) => {
              const n = parseInt(e.target.value, 10);
              if (n >= 1 && n <= 60) onChange({ ...config, claude_recap_idle_minutes: n });
            }}
            style={{
              width: "80px",
              padding: "5px 8px",
              fontSize: "13px",
              background: "var(--bg-input)",
              border: "1px solid var(--border-default)",
              borderRadius: "var(--radius-sm)",
              color: "var(--text-primary)",
              fontFamily: "var(--font-mono)",
            }}
          />
        </div>
        <div style={HINT_STYLE}>
          Generate a short Haiku-backed summary when you return to a session after being away.
          Recaps are stored in clau-decode only — they never modify your conversation file.
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------

export default function SettingsModal() {
  const closeSettings = useAppStore((s) => s.closeSettings);
  const sessionSortOrder = useAppStore((s) => s.sessionSortOrder);
  const setSessionSortOrder = useAppStore((s) => s.setSessionSortOrder);
  const showParentFolder = useAppStore((s) => s.showParentFolder);
  const setShowParentFolder = useAppStore((s) => s.setShowParentFolder);
  // Seed from the boot-time config fetch (warmed by App.tsx for theme). If the
  // cache hasn't populated yet — e.g. modal opened before the boot fetch
  // resolved — fall back to the deduped fetcher so we don't fire a second call.
  const [config, setConfig] = useState<AppConfig | null>(getCachedConfig);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [rescanStatus, setRescanStatus] = useState<"idle" | "scanning" | "done">("idle");

  useEffect(() => {
    if (config) return;
    getConfigCached()
      .then(setConfig)
      .catch((err: unknown) => {
        setLoadError(err instanceof Error ? err.message : "Failed to load config");
      });
  }, [config]);

  function save(updated: AppConfig) {
    setConfig(updated);
    api.updateConfig(updated).catch(() => {});
  }

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
              fontSize: "15px",
              fontWeight: 600,
              color: "var(--text-primary)",
              letterSpacing: "-0.005em",
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
        <ScrollContainer style={{ flex: 1, padding: "20px 24px" }}>
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
            <div style={{ display: "flex", flexDirection: "column", gap: "22px" }}>
              {/* Profiles section */}
              <ProfileSection config={config} onConfigChange={setConfig} />

              {/* Data Paths section — only show when no profiles configured */}
              {config.profiles.length === 0 && <PathEditor config={config} onConfigChange={setConfig} />}

              {/* Sort order section */}
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

              {/* Parent folder prefix toggle */}
              <div>
                <ToggleRow
                  label="Show parent folder in project names"
                  checked={showParentFolder}
                  onChange={setShowParentFolder}
                />
              </div>

              {/* Theme section */}
              <div>
                <div style={sectionLabelStyle}>Theme</div>
                <div style={{ display: "flex", gap: "8px" }}>
                  {(["light", "dark", "system"] as const).map((theme) => (
                    <button
                      key={theme}
                      onClick={() => {
                        const updated = { ...config, theme };
                        setConfig(updated);
                        api.updateConfig(updated).catch(() => {});
                        const applyTheme = (
                          window as Window & { __clauDecodeApplyTheme?: (t: string) => void }
                        ).__clauDecodeApplyTheme;
                        if (applyTheme) applyTheme(theme);
                      }}
                      style={segmentBtnStyle(config.theme === theme)}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>

              {/* Behaviour section */}
              <div>
                <div style={sectionLabelStyle}>Behaviour</div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <ToggleRow
                    label="Allow editing & deleting messages"
                    hint="Creates a backup before every write"
                    checked={config.edit_enabled}
                    onChange={(v) => save({ ...config, edit_enabled: v })}
                  />
                  <ToggleRow
                    label="Open browser on startup"
                    checked={config.auto_open_browser}
                    onChange={(v) => save({ ...config, auto_open_browser: v })}
                  />
                </div>
              </div>

              {/* Server section */}
              <div>
                <div style={sectionLabelStyle}>
                  Server
                  <span style={{ fontSize: "10px", color: "var(--text-tertiary)", fontWeight: 400, marginLeft: "6px", textTransform: "none", letterSpacing: 0 }}>
                    requires restart
                  </span>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                    <label style={{ fontSize: "13px", color: "var(--text-secondary)", minWidth: "80px" }}>Port</label>
                    <input
                      type="number"
                      min={1024}
                      max={65535}
                      value={config.port}
                      onChange={(e) => {
                        const port = parseInt(e.target.value, 10);
                        if (port >= 1024 && port <= 65535) save({ ...config, port });
                      }}
                      style={{
                        width: "90px",
                        padding: "5px 8px",
                        fontSize: "13px",
                        background: "var(--bg-input)",
                        border: "1px solid var(--border-default)",
                        borderRadius: "var(--radius-sm)",
                        color: "var(--text-primary)",
                        fontFamily: "var(--font-mono)",
                      }}
                    />
                  </div>
                  <ToggleRow
                    label="Expose on local network"
                    hint="Binds to 0.0.0.0 — anyone on your network can view your data"
                    checked={config.host === "0.0.0.0"}
                    onChange={(v) => save({ ...config, host: v ? "0.0.0.0" : "127.0.0.1" })}
                    danger={config.host === "0.0.0.0"}
                  />
                  <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginTop: "2px" }}>
                    <button
                      onClick={async () => {
                        setRescanStatus("scanning");
                        try { await api.refresh(); } catch { /* ignore */ }
                        setRescanStatus("done");
                        setTimeout(() => setRescanStatus("idle"), 2000);
                      }}
                      disabled={rescanStatus === "scanning"}
                      style={{
                        alignSelf: "flex-start",
                        padding: "6px 14px",
                        fontSize: "13px",
                        background: "var(--bg-tool-block)",
                        color: rescanStatus === "done" ? "var(--accent-orange)" : "var(--text-secondary)",
                        border: "1px solid",
                        borderColor: rescanStatus === "done" ? "var(--accent-orange)" : "var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                        cursor: rescanStatus === "scanning" ? "default" : "pointer",
                        fontFamily: "var(--font-ui)",
                        transition: "all var(--transition-fast)",
                      }}
                    >
                      {rescanStatus === "scanning" ? "Scanning…" : rescanStatus === "done" ? "Done ✓" : "Force rescan"}
                    </button>
                    <div style={HINT_STYLE}>
                      Re-reads every configured data path for new or changed sessions. Use this if you edited a session JSONL outside clau-decode, or if a session you expect to see isn't appearing.
                    </div>
                  </div>
                </div>
              </div>

              {/* Chat — Default Permission Mode section */}
              <PermissionModeSection config={config} onChange={save} />

              {/* Chat — Auto-recap section */}
              <AutoRecapSection config={config} onChange={save} />
            </div>
          )}
        </ScrollContainer>

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
