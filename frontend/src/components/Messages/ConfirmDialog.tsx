import type { ReactNode } from "react";

interface Props {
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
}

export function ConfirmDialog({
  title, body, confirmLabel = "Delete", onConfirm, onCancel,
}: Props) {
  return (
    <div
      style={{
        position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)",
        display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000,
      }}
      onClick={onCancel}
    >
      <div
        style={{
          background: "var(--bg-panel)", borderRadius: "8px", padding: "24px",
          maxWidth: "380px", width: "100%", boxShadow: "0 8px 32px rgba(0,0,0,0.4)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3 style={{ margin: "0 0 10px", fontSize: "15px", fontWeight: 600,
                     color: "var(--text-primary)" }}>
          {title}
        </h3>
        <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "20px",
                      lineHeight: 1.5 }}>
          {body}
        </div>
        <div style={{ display: "flex", gap: "8px", justifyContent: "flex-end" }}>
          <button
            onClick={onCancel}
            style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "4px",
                     background: "none", color: "var(--text-secondary)",
                     border: "1px solid var(--border)", cursor: "pointer" }}
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            style={{ fontSize: "13px", padding: "6px 14px", borderRadius: "4px",
                     background: "#ef4444", color: "#fff", border: "none", cursor: "pointer" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
