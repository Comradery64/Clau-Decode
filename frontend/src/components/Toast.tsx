import { useEffect, useState } from "react";
import { on } from "../utils/events";

interface ToastItem {
  id: number;
  message: string;
  kind: "error" | "info";
}

const AUTO_DISMISS_MS = 5000;

let _nextId = 0;

/**
 * Global toast host. Mounted once at the app root; listens on the "toast"
 * event bus and renders transient, auto-dismissing notifications. Used to
 * surface failures from fire-and-forget actions (e.g. open-in-terminal) that
 * would otherwise fail silently.
 */
export function Toast() {
  const [items, setItems] = useState<ToastItem[]>([]);

  useEffect(() => {
    return on("toast", ({ message, kind }) => {
      const id = _nextId++;
      setItems((prev) => [...prev, { id, message, kind: kind ?? "info" }]);
      setTimeout(() => {
        setItems((prev) => prev.filter((t) => t.id !== id));
      }, AUTO_DISMISS_MS);
    });
  }, []);

  if (items.length === 0) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 20,
        left: "50%",
        transform: "translateX(-50%)",
        display: "flex",
        flexDirection: "column",
        gap: 8,
        zIndex: 9999,
        pointerEvents: "none",
        maxWidth: "min(90vw, 480px)",
      }}
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="status"
          onClick={() => setItems((prev) => prev.filter((x) => x.id !== t.id))}
          style={{
            pointerEvents: "auto",
            cursor: "pointer",
            minWidth: 260,
            padding: "11px 15px",
            borderRadius: "var(--radius-md)",
            fontSize: 13,
            lineHeight: 1.45,
            // Opaque surface (--bg-sidebar is `transparent`, which made it
            // see-through). Errors reuse the same tokens as every other error
            // surface in the app; info uses the default subtle border.
            color: t.kind === "error" ? "var(--tool-error-text)" : "var(--text-primary)",
            background: "var(--bg-modal)",
            border: `1px solid ${t.kind === "error" ? "var(--tool-error-border)" : "var(--border-default)"}`,
            boxShadow: "var(--shadow-lg)",
          }}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
