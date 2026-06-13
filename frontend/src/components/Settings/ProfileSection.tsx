import { useState } from "react";
import type { AppConfig } from "../../api/types";
import { api } from "../../api/client";
import { useAppStore } from "../../store";

const PROFILE_COLORS = ["#b8956a", "#3b82f6", "#10b981", "#9b8ec4", "#c47a7a", "#c9a96e", "#7eb6c4", "#d4758a"];

export function ProfileSection({ config, onConfigChange }: { config: AppConfig; onConfigChange: (c: AppConfig) => void }) {
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
