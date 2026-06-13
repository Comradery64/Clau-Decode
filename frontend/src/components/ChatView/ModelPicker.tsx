import { useEffect, useRef, useState } from "react";
import type { PermissionMode } from "../../api/types";

interface PermissionModeMeta {
  value: PermissionMode;
  label: string;
  description: string;
  tone: "neutral" | "danger" | "warn" | "info";
}

export const MODEL_OPTIONS = [
  { value: "default", label: "Auto", description: "Let the CLI pick the best model." },
  { value: "claude-opus-4-7", label: "Opus", description: "Highest capability, highest cost." },
  { value: "claude-sonnet-4-6", label: "Sonnet", description: "Balanced speed and capability." },
  { value: "claude-haiku-4-5", label: "Haiku", description: "Fastest and cheapest." },
] as const;

export type ModelId = typeof MODEL_OPTIONS[number]["value"];

const PERMISSION_MODES: PermissionModeMeta[] = [
  { value: "default", label: "default", description: "Claude prompts appear in Native View when needed.", tone: "info" },
  { value: "dontAsk", label: "dontAsk", description: "Run without prompting for permission.", tone: "neutral" },
  { value: "acceptEdits", label: "acceptEdits", description: "Auto-accept file edits; prompt for other tools.", tone: "neutral" },
  { value: "auto", label: "auto", description: "Heuristic auto-approval.", tone: "neutral" },
  { value: "bypassPermissions", label: "bypassPermissions", description: "Skip ALL permission checks. Dangerous.", tone: "danger" },
  { value: "plan", label: "plan", description: "Plan only — no tool execution.", tone: "info" },
];

function toneColor(tone: PermissionModeMeta["tone"]): string {
  // Muted palette — matches the dashboard TipCard tones so danger/info badges
  // read as accents rather than alarms.
  switch (tone) {
    case "danger": return "#c47a7a";
    case "warn": return "var(--accent-orange)";
    case "info": return "#7eb6c4";
    default: return "var(--text-secondary)";
  }
}

function modeMeta(mode: PermissionMode): PermissionModeMeta {
  return PERMISSION_MODES.find((m) => m.value === mode) ?? PERMISSION_MODES[0];
}

interface ModelPickerProps {
  model: ModelId;
  setModel: (m: ModelId) => void;
  permissionMode: PermissionMode;
  setPermissionMode: (m: PermissionMode) => void;
  defaultPermissionMode: PermissionMode;
}

export function ModelPicker({
  model,
  setModel,
  permissionMode,
  setPermissionMode,
  defaultPermissionMode,
}: ModelPickerProps) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<"model" | "permission">("model");
  const [bypassConfirmed, setBypassConfirmed] = useState(false);
  const [pendingBypass, setPendingBypass] = useState(false);

  const pickerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!pickerOpen) return;
    const onClick = (e: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target as Node)) {
        setPickerOpen(false);
        setPendingBypass(false);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [pickerOpen]);

  const selectMode = (mode: PermissionMode) => {
    if (mode === "bypassPermissions" && !bypassConfirmed) {
      setPendingBypass(true);
      return;
    }
    setPermissionMode(mode);
    setPickerOpen(false);
    setPendingBypass(false);
  };

  const confirmBypass = () => {
    setBypassConfirmed(true);
    setPermissionMode("bypassPermissions");
    setPickerOpen(false);
    setPendingBypass(false);
  };

  const meta = modeMeta(permissionMode);
  const overridden = permissionMode !== defaultPermissionMode;
  const modeColor = toneColor(meta.tone);

  return (
    <div ref={pickerRef} style={{ position: "relative" }}>
      <button
        type="button"
        onClick={() => setPickerOpen((v) => !v)}
        title={`${MODEL_OPTIONS.find((m) => m.value === model)?.label ?? "Auto"} · ${meta.label}`}
        style={{
          display: "flex",
          alignItems: "center",
          gap: "4px",
          padding: "4px 8px",
          borderRadius: "8px",
          background: "transparent",
          border: "none",
          color: modeColor,
          cursor: "pointer",
          fontSize: "11px",
          fontFamily: "var(--font-ui)",
          fontWeight: 500,
        }}
      >
        {(overridden || model !== "default") && (
          <span
            style={{
              width: "6px",
              height: "6px",
              borderRadius: "50%",
              background: overridden ? modeColor : "var(--accent-orange)",
              display: "inline-block",
            }}
          />
        )}
        <span>{MODEL_OPTIONS.find((m) => m.value === model)?.label ?? "Auto"}</span>
        <span style={{ color: "var(--text-tertiary)" }}>·</span>
        <span>{meta.label}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" aria-hidden="true">
          <path d="M2 4l3 3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {pickerOpen && (
        <div
          style={{
            position: "absolute",
            right: 0,
            bottom: "calc(100% + 6px)",
            zIndex: 50,
            width: "280px",
            background: "var(--bg-elevated, var(--bg-base))",
            border: "1px solid var(--border-default)",
            borderRadius: "12px",
            boxShadow: "0 8px 24px rgba(0,0,0,0.12)",
            overflow: "hidden",
          }}
        >
          {/* Tab bar */}
          <div style={{ display: "flex", borderBottom: "1px solid var(--border-subtle)" }}>
            {(["model", "permission"] as const).map((tab) => {
              const isActive = pickerTab === tab;
              const label = tab === "model" ? "Model" : "Permission";
              return (
                <button
                  key={tab}
                  type="button"
                  onClick={() => { setPickerTab(tab); setPendingBypass(false); }}
                  style={{
                    flex: 1,
                    padding: "9px 0",
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                    fontSize: "12px",
                    fontWeight: isActive ? 600 : 400,
                    color: isActive ? "var(--text-primary)" : "var(--text-tertiary)",
                    borderBottom: isActive ? "2px solid var(--text-primary)" : "2px solid transparent",
                    transition: "color 0.15s, border-color 0.15s",
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          {/* Tab content */}
          {pickerTab === "model" && MODEL_OPTIONS.map((m) => {
            const active = m.value === model;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setModel(m.value)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 14px",
                  border: "none",
                  background: active ? "var(--bg-sidebar-hover)" : "transparent",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = active
                    ? "var(--bg-sidebar-hover)"
                    : "transparent";
                }}
              >
                <div style={{ fontSize: "13px", fontFamily: "var(--font-ui)", fontWeight: 600, color: "var(--text-secondary)", display: "flex", alignItems: "center", gap: "6px" }}>
                  {active && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M2 6l3 3 5-5" stroke="var(--text-secondary)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {!active && <span style={{ width: "12px" }} />}
                  {m.label}
                  {m.value === "default" && (
                    <span style={{ fontWeight: 400, color: "var(--text-tertiary)", fontSize: "11px" }}>default</span>
                  )}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px", paddingLeft: "18px" }}>
                  {m.description}
                </div>
              </button>
            );
          })}

          {pickerTab === "permission" && PERMISSION_MODES.map((m) => {
            const t = toneColor(m.tone);
            const active = m.value === permissionMode;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => selectMode(m.value)}
                style={{
                  display: "block",
                  width: "100%",
                  textAlign: "left",
                  padding: "9px 14px",
                  border: "none",
                  background: active ? "var(--bg-sidebar-hover)" : "transparent",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--border-subtle)",
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLButtonElement).style.background = active
                    ? "var(--bg-sidebar-hover)"
                    : "transparent";
                }}
              >
                <div style={{ fontSize: "13px", fontFamily: "var(--font-ui)", fontWeight: 600, color: t, display: "flex", alignItems: "center", gap: "6px" }}>
                  {active && (
                    <svg width="12" height="12" viewBox="0 0 12 12" fill="none" style={{ flexShrink: 0 }}>
                      <path d="M2 6l3 3 5-5" stroke={t} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                  {!active && <span style={{ width: "12px" }} />}
                  {m.label}
                  {m.value === defaultPermissionMode && (
                    <span style={{ fontWeight: 400, color: "var(--text-tertiary)", fontSize: "11px" }}>default</span>
                  )}
                </div>
                <div style={{ fontSize: "11px", color: "var(--text-tertiary)", marginTop: "2px", paddingLeft: "18px" }}>
                  {m.description}
                </div>
              </button>
            );
          })}
          {pickerTab === "permission" && pendingBypass && (
            <div
              style={{
                padding: "10px 14px",
                background: "rgba(239, 68, 68, 0.10)",
                borderTop: "1px solid rgba(239, 68, 68, 0.40)",
                fontSize: "11px",
                color: "#b91c1c",
                lineHeight: 1.4,
              }}
            >
              Bypass runs every tool without checks. Continue?
              <div style={{ display: "flex", gap: "6px", marginTop: "6px" }}>
                <button type="button" onClick={confirmBypass} style={bypassYesStyle}>Yes, bypass</button>
                <button type="button" onClick={() => setPendingBypass(false)} style={bypassNoStyle}>Cancel</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const bypassYesStyle: React.CSSProperties = {
  padding: "3px 10px",
  fontSize: "11px",
  background: "#ef4444",
  color: "#fff",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
};

const bypassNoStyle: React.CSSProperties = {
  padding: "3px 10px",
  fontSize: "11px",
  background: "transparent",
  color: "var(--text-secondary)",
  border: "1px solid var(--border-subtle)",
  borderRadius: "6px",
  cursor: "pointer",
};
