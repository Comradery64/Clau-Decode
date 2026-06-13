import React from "react";
import type { AppConfig, PermissionMode } from "../../api/types";
import { HINT_STYLE, sectionLabelStyle, TONE_DANGER } from "./shared";

const PERMISSION_MODE_OPTIONS: Array<{
  value: PermissionMode;
  label: string;
  description: React.ReactNode;
}> = [
  {
    value: "default",
    label: "default",
    description: (
      <>
        <em>Recommended.</em> Claude prompts appear in Native View when needed.
      </>
    ),
  },
  {
    value: "dontAsk",
    label: "dontAsk",
    description: <>Run without prompting for permission.</>,
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

export function PermissionModeSection({
  config,
  onChange,
}: {
  config: AppConfig;
  onChange: (updated: AppConfig) => void;
}) {
  const current: PermissionMode = config.claude_default_permission_mode ?? "default";
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
