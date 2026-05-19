/**
 * "New Task" entry point — issue #9.
 *
 * Sits in the sidebar header next to the collapse + mode-switch buttons.
 * Click (or Cmd+Shift+O) POSTs to /api/sessions/new — a pure metadata mint:
 * the backend assigns a fresh uuid but does NOT spawn the CLI and does NOT
 * write any JSONL. We navigate the user to /chat/<id> immediately; the
 * session stays empty until the user submits their first message, and that
 * submission is what materialises the JSONL via `claude --session-id`. The
 * watcher → SSE pipeline indexes it the moment it appears.
 *
 * The startNewSession helper is exported so unit tests can drive it
 * without going through the DOM.
 */

import React from "react";
import { api } from "../../api/client";
import { navigateTo } from "../../router";

/** Kick off a new session and navigate to it. Returns the new id on success. */
export async function startNewSession(): Promise<string | null> {
  try {
    const r = await api.newSession();
    navigateTo(`/chat/${r.session_id}`);
    return r.session_id;
  } catch {
    // Swallow — the button shouldn't disappear if the backend is briefly down,
    // and the user can retry. Errors are still visible in the network panel.
    return null;
  }
}

function IconPlus() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <line x1="12" y1="5" x2="12" y2="19" />
      <line x1="5" y1="12" x2="19" y2="12" />
    </svg>
  );
}

const btnStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--text-tertiary)",
  padding: "6px",
  borderRadius: "var(--radius-sm)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  flexShrink: 0,
  transition: "color var(--transition-fast), background var(--transition-fast)",
};

export function NewTaskButton() {
  // Cmd+Shift+O — sits next to the existing Cmd+O (toggle tool/thinking
  // blocks) and mirrors VS Code's "Open" convention. Registered in the
  // capture phase so it beats focused-input handlers, matching the rest
  // of the app's Cmd-shortcut wiring in App.tsx.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (!e.shiftKey) return;
      if (e.key.toLowerCase() !== "o") return;
      e.preventDefault();
      void startNewSession();
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, []);

  return (
    <button
      onClick={() => void startNewSession()}
      aria-label="New task (Cmd+Shift+O)"
      title="New task — Cmd+Shift+O"
      style={btnStyle}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "none";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
      }}
    >
      <IconPlus />
    </button>
  );
}
