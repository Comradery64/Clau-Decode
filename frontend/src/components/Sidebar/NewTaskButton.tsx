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
import { useAppStore } from "../../store";
import { isNativePtyFocused } from "../../utils/nativePtyFocus";

/** Kick off a new session and navigate to it. Returns the new id on success.
 *
 * cwd inheritance: if the user is currently viewing a chat, the new chat
 * defaults to that chat's cwd. Without this the backend falls back to the
 * globally most-recent session's cwd, which feels wrong when the user has
 * just navigated to an older chat in a different directory. The detail
 * fetch costs one extra round-trip but only fires on the + click. */
export async function startNewSession(): Promise<string | null> {
  try {
    let cwd: string | undefined;
    let provider: string | undefined;
    const currentSid = useAppStore.getState().selectedSessionId;
    if (currentSid) {
      try {
        const detail = await api.getSession(currentSid);
        cwd = detail.cwd ?? undefined;
        // Inherit the current chat's provider so "+" from inside a Codex chat
        // stays Codex instead of falling back to the active (Claude) profile.
        provider = detail.provider ?? undefined;
      } catch {
        // Fall through to backend default — better than blocking the new
        // chat over a transient detail-fetch failure.
      }
    }
    const opts: { cwd?: string; provider?: string } = {};
    if (cwd) opts.cwd = cwd;
    if (provider && provider !== "claude") opts.provider = provider;
    const r = await api.newSession(Object.keys(opts).length ? opts : undefined);
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

function IconSpinner() {
  // Inline CSS keyframes keep this self-contained — no global style needed.
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      style={{ animation: "ntb-spin 0.7s linear infinite" }}
    >
      <style>{`@keyframes ntb-spin { to { transform: rotate(360deg); } }`}</style>
      <path d="M12 3 a 9 9 0 0 1 9 9" />
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
  const [pending, setPending] = React.useState(false);

  const trigger = React.useCallback(async () => {
    if (pending) return;  // double-click guard
    setPending(true);
    try {
      await startNewSession();
    } finally {
      setPending(false);
    }
  }, [pending]);

  // Cmd+Shift+O — sits next to the existing Cmd+O (toggle tool/thinking
  // blocks) and mirrors VS Code's "Open" convention. Registered in the
  // capture phase so it beats focused-input handlers, matching the rest
  // of the app's Cmd-shortcut wiring in App.tsx.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey)) return;
      if (isNativePtyFocused()) return;
      if (!e.shiftKey) return;
      if (e.key.toLowerCase() !== "o") return;
      e.preventDefault();
      void trigger();
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [trigger]);

  return (
    <button
      onClick={() => void trigger()}
      disabled={pending}
      aria-label="New task (Cmd+Shift+O)"
      aria-busy={pending}
      title="New task — Cmd+Shift+O"
      style={{
        ...btnStyle,
        cursor: pending ? "wait" : "pointer",
        opacity: pending ? 0.7 : 1,
      }}
      onMouseEnter={(e) => {
        if (pending) return;
        (e.currentTarget as HTMLButtonElement).style.background = "var(--bg-sidebar-hover)";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-primary)";
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.background = "none";
        (e.currentTarget as HTMLButtonElement).style.color = "var(--text-tertiary)";
      }}
    >
      {pending ? <IconSpinner /> : <IconPlus />}
    </button>
  );
}
