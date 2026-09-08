import { useEffect, useRef, useState } from "react";
import type { AppConfig, Profile } from "../../api/types";
import { api } from "../../api/client";
import { useAppStore } from "../../store";
import { sectionLabelStyle, HINT_STYLE, TONE_DANGER } from "./shared";

const PROFILE_COLORS = ["#b8956a", "#3b82f6", "#10b981", "#9b8ec4", "#c47a7a", "#c9a96e", "#7eb6c4", "#d4758a"];

// Second click within this window actually deletes; otherwise the "Confirm?"
// state quietly reverts so a stray click can't destroy a profile.
const CONFIRM_DELETE_MS = 3000;

const errorStyle: React.CSSProperties = { ...HINT_STYLE, color: TONE_DANGER, marginTop: "6px" };

interface ProfileRowProps {
  profile: Profile;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onDelete: (id: string) => Promise<void>;
  onRename: (id: string, name: string) => Promise<void>;
  onColorChange: (id: string, color: string) => Promise<void>;
  onAddPath: (id: string, path: string) => Promise<void>;
  onRemovePath: (id: string, index: number) => Promise<void>;
}

function ProfileRow({
  profile, isExpanded, onToggleExpand, onDelete, onRename, onColorChange, onAddPath, onRemovePath,
}: ProfileRowProps) {
  const [editingName, setEditingName] = useState(false);
  const [editNameValue, setEditNameValue] = useState(profile.name);
  const [renaming, setRenaming] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  const [newPath, setNewPath] = useState("");
  const [savingPath, setSavingPath] = useState(false);
  const [removingIndex, setRemovingIndex] = useState<number | null>(null);
  const [savingColor, setSavingColor] = useState(false);
  const [panelError, setPanelError] = useState<string | null>(null);

  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const confirmTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pathInputRef = useRef<HTMLInputElement>(null);

  // Focus the add-path field whenever this row opens — this is the field
  // people actually came here for, most often right after creating a profile.
  useEffect(() => {
    if (isExpanded) pathInputRef.current?.focus();
  }, [isExpanded]);

  useEffect(() => () => {
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
  }, []);

  const handleDeleteClick = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setDeleteError(null);
      confirmTimeoutRef.current = setTimeout(() => setConfirmingDelete(false), CONFIRM_DELETE_MS);
      return;
    }
    if (confirmTimeoutRef.current) clearTimeout(confirmTimeoutRef.current);
    setDeleting(true);
    setDeleteError(null);
    try {
      await onDelete(profile.id);
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : "Failed to delete profile");
      setConfirmingDelete(false);
      setDeleting(false);
    }
  };

  const startRename = () => {
    setEditNameValue(profile.name);
    setRenameError(null);
    setEditingName(true);
  };

  const commitRename = async () => {
    const name = editNameValue.trim();
    if (!name || name === profile.name) { setEditingName(false); return; }
    setRenaming(true);
    setRenameError(null);
    try {
      await onRename(profile.id, name);
      setEditingName(false);
    } catch (err) {
      setRenameError(err instanceof Error ? err.message : "Failed to rename");
    } finally {
      setRenaming(false);
    }
  };

  const handleColorClick = async (color: string) => {
    if (color === profile.color || savingColor) return;
    setSavingColor(true);
    setPanelError(null);
    try {
      await onColorChange(profile.id, color);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Failed to update color");
    } finally {
      setSavingColor(false);
    }
  };

  const handleAddPath = async () => {
    const path = newPath.trim();
    if (!path || savingPath) return;
    if (profile.data_paths.includes(path)) {
      setPanelError("That path is already in this profile");
      return;
    }
    setSavingPath(true);
    setPanelError(null);
    try {
      await onAddPath(profile.id, path);
      setNewPath("");
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Failed to add path");
    } finally {
      setSavingPath(false);
    }
  };

  const handleRemovePath = async (index: number) => {
    setRemovingIndex(index);
    setPanelError(null);
    try {
      await onRemovePath(profile.id, index);
    } catch (err) {
      setPanelError(err instanceof Error ? err.message : "Failed to remove path");
    } finally {
      setRemovingIndex(null);
    }
  };

  return (
    <div
      style={{
        background: "var(--bg-tool-block)",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border-subtle)",
        overflow: "hidden",
      }}
    >
      <div
        style={{ display: "flex", alignItems: "center", gap: "10px", padding: "8px 10px", cursor: "pointer" }}
        onClick={onToggleExpand}
      >
        <span style={{ width: "14px", height: "14px", borderRadius: "50%", background: profile.color, flexShrink: 0 }} />
        {editingName ? (
          <input
            value={editNameValue}
            onChange={(e) => setEditNameValue(e.target.value)}
            onClick={(e) => e.stopPropagation()}
            onBlur={commitRename}
            onKeyDown={(e) => {
              if (e.key === "Enter") commitRename();
              if (e.key === "Escape") setEditingName(false);
            }}
            disabled={renaming}
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
          <span style={{ flex: 1, display: "flex", alignItems: "center", gap: "4px", minWidth: 0 }}>
            <span
              style={{
                fontSize: "13px",
                color: "var(--text-primary)",
                fontWeight: 500,
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
              }}
            >
              {profile.name}
            </span>
            <button
              onClick={(e) => { e.stopPropagation(); startRename(); }}
              aria-label={`Rename ${profile.name}`}
              title="Rename"
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text-tertiary)",
                fontSize: "11px",
                padding: "2px",
                lineHeight: 1,
                flexShrink: 0,
                opacity: 0.6,
              }}
            >
              ✎
            </button>
          </span>
        )}
        <span style={{ fontSize: "11px", color: "var(--text-tertiary)" }}>
          {profile.data_paths.length} path{profile.data_paths.length !== 1 ? "s" : ""}
        </span>
        <span
          style={{
            fontSize: "9px",
            color: "var(--text-tertiary)",
            transition: "transform var(--transition-fast)",
            transform: isExpanded ? "rotate(180deg)" : "rotate(0deg)",
            display: "inline-block",
          }}
        >
          ▾
        </span>
        <button
          onClick={(e) => { e.stopPropagation(); handleDeleteClick(); }}
          disabled={deleting}
          aria-label={confirmingDelete ? `Confirm delete of profile ${profile.name}` : `Delete profile ${profile.name}`}
          title={confirmingDelete ? "Click again to confirm" : "Delete profile"}
          style={{
            background: confirmingDelete ? TONE_DANGER : "none",
            border: "none",
            borderRadius: "var(--radius-sm)",
            cursor: deleting ? "not-allowed" : "pointer",
            color: confirmingDelete ? "var(--text-on-accent)" : "var(--text-tertiary)",
            fontSize: confirmingDelete ? "10px" : "16px",
            fontWeight: confirmingDelete ? 600 : 400,
            padding: confirmingDelete ? "3px 7px" : "2px 4px",
            lineHeight: 1.4,
            transition: "background var(--transition-fast), color var(--transition-fast)",
          }}
        >
          {deleting ? "…" : confirmingDelete ? "Confirm?" : "×"}
        </button>
      </div>

      {renameError && <div style={{ ...errorStyle, padding: "0 10px 8px", marginTop: 0 }}>{renameError}</div>}
      {deleteError && <div style={{ ...errorStyle, padding: "0 10px 8px", marginTop: 0 }}>{deleteError}</div>}

      {isExpanded && (
        <div style={{ padding: "0 10px 10px", borderTop: "1px solid var(--border-subtle)" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px", margin: "8px 0" }}>
            {PROFILE_COLORS.map((c) => (
              <button
                key={c}
                onClick={() => handleColorClick(c)}
                disabled={savingColor}
                style={{
                  width: "22px",
                  height: "22px",
                  borderRadius: "50%",
                  background: c,
                  border: profile.color === c ? "2px solid var(--text-primary)" : "2px solid transparent",
                  cursor: savingColor ? "not-allowed" : "pointer",
                  padding: 0,
                  transition: "border-color var(--transition-fast), transform var(--transition-fast)",
                  transform: profile.color === c ? "scale(1.15)" : "scale(1)",
                }}
              />
            ))}
          </div>
          <div
            style={{
              fontSize: "11px",
              fontWeight: 600,
              color: "var(--text-tertiary)",
              textTransform: "uppercase",
              letterSpacing: "0.04em",
              margin: "8px 0 6px",
            }}
          >
            Data paths
          </div>
          {profile.data_paths.length === 0 && (
            <div style={{ fontSize: "12px", color: "var(--text-tertiary)", padding: "4px 0 8px" }}>
              No paths yet — sessions for this profile won't show until you add one.
            </div>
          )}
          {profile.data_paths.map((dp, i) => (
            <div key={dp} style={{ display: "flex", alignItems: "center", gap: "6px", marginBottom: "4px" }}>
              <code
                style={{
                  flex: 1,
                  fontSize: "12px",
                  color: "var(--text-secondary)",
                  background: "var(--bg-sidebar)",
                  padding: "4px 8px",
                  borderRadius: "var(--radius-sm)",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}
              >
                {dp}
              </code>
              <button
                onClick={() => handleRemovePath(i)}
                disabled={removingIndex !== null}
                aria-label={`Remove ${dp}`}
                style={{
                  background: "none",
                  border: "none",
                  cursor: removingIndex !== null ? "not-allowed" : "pointer",
                  color: "var(--text-tertiary)",
                  fontSize: "14px",
                  padding: "2px 4px",
                }}
              >
                {removingIndex === i ? "…" : "×"}
              </button>
            </div>
          ))}
          <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
            <input
              ref={pathInputRef}
              value={newPath}
              onChange={(e) => setNewPath(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") handleAddPath(); }}
              disabled={savingPath}
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
              onClick={handleAddPath}
              disabled={!newPath.trim() || savingPath}
              style={{
                padding: "4px 10px",
                fontSize: "12px",
                background: newPath.trim() ? "var(--accent-orange)" : "var(--bg-tool-block)",
                color: newPath.trim() ? "var(--text-on-accent)" : "var(--text-tertiary)",
                border: "1px solid",
                borderColor: newPath.trim() ? "var(--accent-orange)" : "var(--border-subtle)",
                borderRadius: "var(--radius-sm)",
                cursor: newPath.trim() && !savingPath ? "pointer" : "default",
                fontFamily: "var(--font-ui)",
              }}
            >
              {savingPath ? "…" : "Add"}
            </button>
          </div>
          {panelError && <div style={errorStyle}>{panelError}</div>}
        </div>
      )}
    </div>
  );
}

export function ProfileSection({ config, onConfigChange }: { config: AppConfig; onConfigChange: (c: AppConfig) => void }) {
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const setProfiles = useAppStore((s) => s.setProfiles);
  const setActiveProfileId = useAppStore((s) => s.setActiveProfileId);

  const syncFromServer = async () => {
    const data = await api.getProfiles();
    setProfiles(data.profiles);
    setActiveProfileId(data.active_profile_id);
  };

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setCreateError(null);
    try {
      const created = await api.createProfile(name);
      setNewName("");
      onConfigChange({ ...config, profiles: [...config.profiles, created] });
      await syncFromServer();
      // Drop straight into the panel where the actual next step lives:
      // giving this profile a real data path instead of the ~/.claude default.
      setExpandedId(created.id);
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Failed to create profile");
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (id: string) => {
    await api.deleteProfile(id);
    onConfigChange({ ...config, profiles: config.profiles.filter((p) => p.id !== id) });
    await syncFromServer();
    setExpandedId((cur) => (cur === id ? null : cur));
  };

  const handleRename = async (id: string, name: string) => {
    await api.updateProfile(id, { name });
    const updated = { ...config, profiles: config.profiles.map((p) => (p.id === id ? { ...p, name } : p)) };
    onConfigChange(updated);
    setProfiles(updated.profiles);
  };

  const handleColorChange = async (id: string, color: string) => {
    await api.updateProfile(id, { color });
    const updated = { ...config, profiles: config.profiles.map((p) => (p.id === id ? { ...p, color } : p)) };
    onConfigChange(updated);
    setProfiles(updated.profiles);
  };

  const handleAddPath = async (id: string, path: string) => {
    const profile = config.profiles.find((p) => p.id === id);
    if (!profile) return;
    const updatedPaths = [...profile.data_paths, path];
    await api.updateProfile(id, { data_paths: updatedPaths });
    const updated = { ...config, profiles: config.profiles.map((p) => (p.id === id ? { ...p, data_paths: updatedPaths } : p)) };
    onConfigChange(updated);
    setProfiles(updated.profiles);
  };

  const handleRemovePath = async (id: string, index: number) => {
    const profile = config.profiles.find((p) => p.id === id);
    if (!profile) return;
    const updatedPaths = profile.data_paths.filter((_, i) => i !== index);
    await api.updateProfile(id, { data_paths: updatedPaths });
    const updated = { ...config, profiles: config.profiles.map((p) => (p.id === id ? { ...p, data_paths: updatedPaths } : p)) };
    onConfigChange(updated);
    setProfiles(updated.profiles);
  };

  return (
    <div>
      <div style={sectionLabelStyle}>Profiles</div>

      {config.profiles.length === 0 && (
        <div style={{ ...HINT_STYLE, marginTop: 0, marginBottom: "12px" }}>
          Split sessions into separate scopes (e.g. personal vs. work) by data path. Without a
          profile, every configured path is shown together.
        </div>
      )}

      {config.profiles.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "6px", marginBottom: "12px" }}>
          {config.profiles.map((p) => (
            <ProfileRow
              key={p.id}
              profile={p}
              isExpanded={expandedId === p.id}
              onToggleExpand={() => setExpandedId(expandedId === p.id ? null : p.id)}
              onDelete={handleDelete}
              onRename={handleRename}
              onColorChange={handleColorChange}
              onAddPath={handleAddPath}
              onRemovePath={handleRemovePath}
            />
          ))}
        </div>
      )}

      <div style={{ display: "flex", gap: "8px" }}>
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") handleCreate(); }}
          disabled={creating}
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
          disabled={!newName.trim() || creating}
          style={{
            padding: "6px 14px",
            fontSize: "13px",
            background: newName.trim() ? "var(--accent-orange)" : "var(--bg-tool-block)",
            color: newName.trim() ? "var(--text-on-accent)" : "var(--text-tertiary)",
            border: "1px solid",
            borderColor: newName.trim() ? "var(--accent-orange)" : "var(--border-subtle)",
            borderRadius: "var(--radius-sm)",
            cursor: newName.trim() && !creating ? "pointer" : "default",
            fontFamily: "var(--font-ui)",
          }}
        >
          {creating ? "…" : "Add"}
        </button>
      </div>
      {createError && <div style={errorStyle}>{createError}</div>}
    </div>
  );
}
