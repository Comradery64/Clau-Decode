import React from "react";

// ---------------------------------------------------------------------------
// Shared style helpers — single typography scale, single muted palette.
// ---------------------------------------------------------------------------

// 11px uppercase section label · 13px body · 12px hint. No other sizes.
export const sectionLabelStyle: React.CSSProperties = {
  fontSize: "11px",
  fontWeight: 600,
  color: "var(--text-tertiary)",
  textTransform: "uppercase",
  letterSpacing: "0.06em",
  marginBottom: "10px",
  display: "flex",
  alignItems: "center",
};

export const HINT_STYLE: React.CSSProperties = {
  fontSize: "12px",
  color: "var(--text-tertiary)",
  lineHeight: 1.5,
  marginTop: "6px",
};

// Muted danger that matches ChatInput's permission picker — no harsh #ef4444.
export const TONE_DANGER = "#c47a7a";

export function segmentBtnStyle(active: boolean): React.CSSProperties {
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
export function Checkbox({
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

export function ToggleRow({
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
