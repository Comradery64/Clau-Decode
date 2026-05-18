import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../api/client";
import type { PermissionMode } from "../../api/types";
import { useSessionDetail } from "../Messages/hooks/useSessionDetail";

interface ChatInputProps {
  sessionId: string;
  isStreaming: boolean;
  disabled?: boolean;
  onStop: () => void;
  defaultPermissionMode: PermissionMode;
}

interface PermissionModeMeta {
  value: PermissionMode;
  label: string;
  description: string;
  tone: "neutral" | "danger" | "warn" | "info";
}

const MODEL_OPTIONS = [
  { value: "default", label: "Auto", description: "Let the CLI pick the best model." },
  { value: "claude-opus-4-7", label: "Opus", description: "Highest capability, highest cost." },
  { value: "claude-sonnet-4-6", label: "Sonnet", description: "Balanced speed and capability." },
  { value: "claude-haiku-4-5", label: "Haiku", description: "Fastest and cheapest." },
] as const;

type ModelId = typeof MODEL_OPTIONS[number]["value"];

const PERMISSION_MODES: PermissionModeMeta[] = [
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

export function ChatInput({
  sessionId,
  isStreaming,
  disabled,
  onStop,
  defaultPermissionMode,
}: ChatInputProps) {
  const [input, setInput] = useState("");
  const [stash, setStash] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [permissionMode, setPermissionMode] = useState<PermissionMode>(defaultPermissionMode);
  const [model, setModel] = useState<ModelId>("default");

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerTab, setPickerTab] = useState<"model" | "permission">("model");
  const [bypassConfirmed, setBypassConfirmed] = useState(false);
  const [pendingBypass, setPendingBypass] = useState(false);

  const [quietWarning, setQuietWarning] = useState(false);
  const [quietAgeSeconds, setQuietAgeSeconds] = useState<number | null>(null);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const [autoRestoreSuppressed, setAutoRestoreSuppressed] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const wasStreamingRef = useRef(isStreaming);

  // Message history (terminal-style Up/Down navigation)
  const historyRef = useRef<string[]>([]);
  const historyPosRef = useRef(-1);   // -1 = not browsing
  const savedInputRef = useRef("");

  // Seed history from all past user messages in the session (parsed from JSONL)
  const { detail } = useSessionDetail(sessionId);
  useEffect(() => {
    if (!detail?.messages) return;
    const texts: string[] = [];
    for (const msg of detail.messages) {
      if (msg.role !== "user") continue;
      const text = msg.content_blocks
        .filter((b): b is { type: "text"; text: string } => b.type === "text")
        .map(b => b.text)
        .join("\n")
        .trim();
      if (text) texts.push(text);
    }
    historyRef.current = texts;
  }, [detail?.messages]);

  const postSendPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const postSendPollCountRef = useRef(0);

  useEffect(() => {
    setPermissionMode(defaultPermissionMode);
  }, [defaultPermissionMode]);

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

  useEffect(() => {
    const prev = wasStreamingRef.current;
    wasStreamingRef.current = isStreaming;
    if (prev && !isStreaming) {
      if (stash !== null && input.length === 0 && !autoRestoreSuppressed) {
        setInput(stash);
        setStash(null);
      }
    }
  }, [isStreaming, stash, input, autoRestoreSuppressed]);

  // Stop the post-send poll when unmounting
  useEffect(() => {
    return () => {
      if (postSendPollRef.current) clearInterval(postSendPollRef.current);
    };
  }, []);

  // When streaming starts, the post-send poll is no longer needed
  useEffect(() => {
    if (isStreaming && postSendPollRef.current) {
      clearInterval(postSendPollRef.current);
      postSendPollRef.current = null;
    }
  }, [isStreaming]);

  useEffect(() => {
    if (!isStreaming) {
      setQuietWarning(false);
      setQuietAgeSeconds(null);
      setBannerDismissed(false);
      return;
    }
    let cancelled = false;
    const fetchStatus = async () => {
      try {
        const status = await api.getRunnerStatus(sessionId);
        if (cancelled) return;
        setQuietWarning(status.quiet_warning);
        setQuietAgeSeconds(status.quiet_age_seconds);
        // Surface runner errors while streaming (e.g. process died mid-turn)
        if (!status.busy && status.last_error) {
          setError(`Runner error: ${status.last_error}`);
        }
      } catch {
        // ignore
      }
    };
    fetchStatus();
    const id = setInterval(fetchStatus, 5000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
  }, [isStreaming, sessionId]);

  const autoSize = useCallback(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 200) + "px";
  }, []);

  useEffect(() => {
    autoSize();
  }, [input, autoSize]);

  const trimmed = input.trim();
  const canSend = !sending && !isStreaming && !disabled && trimmed.length > 0;

  const handleSend = useCallback(async () => {
    // Surface the reason instead of silently no-op'ing so the user always
    // gets feedback when they hit Send.
    if (sending) { setError("Already sending — wait a moment."); return; }
    if (isStreaming) { setError("A turn is already in progress. Click Stop to cancel it."); return; }
    if (disabled) { setError("This session is a fork/backup — sending is disabled."); return; }
    if (trimmed.length === 0) return;

    const text = trimmed;
    // Append to history immediately (session detail catches up via SSE later)
    historyRef.current.push(text);
    historyPosRef.current = -1;
    setSending(true);
    setError(null);
    // eslint-disable-next-line no-console
    console.log("[ChatInput] sendMessage →", { sessionId, permissionMode, length: text.length });
    try {
      const res = await api.sendMessage(sessionId, text, permissionMode, model === "default" ? undefined : model);
      // eslint-disable-next-line no-console
      console.log("[ChatInput] sendMessage ✓", res);
      setInput("");
      setAutoRestoreSuppressed(false);
      // Slash commands return synthetic responses (e.g. "/foo isn't available
      // in this environment.") in the POST response — those don't reach the
      // JSONL, so surface them inline instead of leaving the user with silence.
      if (res.result_text) {
        setError(res.result_text);
      }
      // Poll runner-status briefly so failures that happen before any JSONL
      // write (e.g. unrecognised flag, missing binary) surface as UI errors.
      if (postSendPollRef.current) clearInterval(postSendPollRef.current);
      postSendPollCountRef.current = 0;
      postSendPollRef.current = setInterval(async () => {
        postSendPollCountRef.current++;
        // Stop after ~20s regardless
        if (postSendPollCountRef.current > 10) {
          if (postSendPollRef.current) clearInterval(postSendPollRef.current);
          postSendPollRef.current = null;
          return;
        }
        try {
          const status = await api.getRunnerStatus(sessionId);
          if (!status.busy && status.last_error) {
            setError(`Runner error: ${status.last_error}`);
            clearInterval(postSendPollRef.current!);
            postSendPollRef.current = null;
          } else if (status.busy) {
            // Hand off to the streaming poller once the process is confirmed running
            clearInterval(postSendPollRef.current!);
            postSendPollRef.current = null;
          }
        } catch {
          // ignore transient fetch errors
        }
      }, 2000);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error("[ChatInput] sendMessage ✗", e);
      setError(e instanceof Error ? e.message : "Failed to send message");
    } finally {
      setSending(false);
    }
  }, [sending, isStreaming, disabled, trimmed, sessionId, permissionMode]);

  const handleStash = useCallback(() => {
    if (input.length === 0) return;
    setStash(input);
    setInput("");
    setAutoRestoreSuppressed(false);
  }, [input]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    const ta = e.currentTarget;

    // Up arrow — recall older message, but only when cursor is at position 0
    if (e.key === "ArrowUp" && !e.shiftKey && !e.ctrlKey && !e.metaKey
      && ta.selectionStart === 0 && ta.selectionEnd === 0) {
      const history = historyRef.current;
      if (history.length > 0) {
        if (historyPosRef.current === -1) {
          savedInputRef.current = input;
        }
        const nextPos = historyPosRef.current + 1;
        if (nextPos < history.length) {
          historyPosRef.current = nextPos;
          const recalled = history[history.length - 1 - nextPos];
          setInput(recalled);
          // Keep cursor at position 0 so repeated Up presses keep navigating back
          requestAnimationFrame(() => {
            textareaRef.current?.setSelectionRange(0, 0);
          });
        }
        e.preventDefault();
        return;
      }
    }

    // Down arrow — recall newer message, but only when cursor is at end
    if (e.key === "ArrowDown" && !e.shiftKey && !e.ctrlKey && !e.metaKey
      && ta.selectionStart === input.length && ta.selectionEnd === input.length
      && historyPosRef.current !== -1) {
      const nextPos = historyPosRef.current - 1;
      historyPosRef.current = nextPos;
      if (nextPos === -1) {
        setInput(savedInputRef.current);
      } else {
        const recalled = historyRef.current[historyRef.current.length - 1 - nextPos];
        setInput(recalled);
        // Keep cursor at end so repeated Down presses keep navigating forward
        requestAnimationFrame(() => {
          textareaRef.current?.setSelectionRange(recalled.length, recalled.length);
        });
      }
      e.preventDefault();
      return;
    }

    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
      e.preventDefault();
      handleStash();
      return;
    }
    if (e.ctrlKey && !e.metaKey) {
      const ta = e.currentTarget;
      const pos = ta.selectionStart;
      if (e.key === "e") {
        // Ctrl+E — move cursor to end of line
        e.preventDefault();
        const lineEnd = ta.value.indexOf("\n", pos);
        const target = lineEnd === -1 ? ta.value.length : lineEnd;
        ta.setSelectionRange(target, target);
        return;
      }
      if (e.key === "k") {
        // Ctrl+K — delete from cursor to end of line
        e.preventDefault();
        const lineEnd = ta.value.indexOf("\n", pos);
        const target = lineEnd === -1 ? ta.value.length : lineEnd;
        const next = ta.value.substring(0, pos) + ta.value.substring(target);
        setInput(next);
        // Restore cursor on next tick after React re-renders
        requestAnimationFrame(() => ta.setSelectionRange(pos, pos));
        return;
      }
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const next = e.target.value;
    setInput(next);
    historyPosRef.current = -1;
    if (stash !== null && next.length > 0) {
      setAutoRestoreSuppressed(true);
    }
  };

  const handleStashBadgeClick = () => {
    if (stash === null) return;
    if (input.length === 0) {
      setInput(stash);
      setStash(null);
      setAutoRestoreSuppressed(false);
    } else {
      setInput(`${input}\n\n${stash}`);
      setStash(null);
      setAutoRestoreSuppressed(false);
    }
  };

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
  const showDefaultWarn = permissionMode === "default";

  return (
    <div
      style={{
        flexShrink: 0,
        padding: "12px 24px 18px",
        background: "var(--bg-base)",
      }}
    >
      <div
        style={{
          maxWidth: "var(--message-max-width)",
          margin: "0 auto",
        }}
      >
        {quietWarning && !bannerDismissed && (
          <div
            role="status"
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              padding: "8px 14px",
              marginBottom: "10px",
              background: "rgba(245, 158, 11, 0.10)",
              border: "1px solid rgba(245, 158, 11, 0.40)",
              borderRadius: "12px",
              color: "#92400e",
              fontSize: "12px",
              lineHeight: 1.4,
            }}
          >
            <span style={{ flex: 1 }}>
              Quiet for {quietAgeSeconds ?? 0}s — possibly waiting on an interactive permission prompt.
            </span>
            <button onClick={onStop} style={bannerBtnStyle}>Stop turn</button>
            <button
              onClick={() => setBannerDismissed(true)}
              aria-label="Dismiss"
              style={bannerDismissStyle}
            >×</button>
          </div>
        )}

        {error && (
          <div
            style={{
              padding: "8px 14px",
              marginBottom: "10px",
              background: "rgba(239, 68, 68, 0.08)",
              border: "1px solid rgba(239, 68, 68, 0.35)",
              borderRadius: "12px",
              fontSize: "12px",
              color: "#b91c1c",
              lineHeight: 1.4,
            }}
          >
            {error}
          </div>
        )}

        {showDefaultWarn && (
          <div
            style={{
              padding: "6px 14px",
              marginBottom: "8px",
              background: "rgba(245, 158, 11, 0.10)",
              border: "1px solid rgba(245, 158, 11, 0.40)",
              borderRadius: "10px",
              fontSize: "11px",
              color: "#92400e",
              lineHeight: 1.4,
            }}
          >
            Interactive mode — the assistant will hang waiting for a permission prompt that can't be answered from the web UI. Use Stop to recover.
          </div>
        )}

        {/* Chat input card */}
        <div
          style={{
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: "18px",
            padding: "14px 18px 10px",
            boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            opacity: disabled ? 0.6 : 1,
          }}
        >
          <textarea
            ref={textareaRef}
            value={input}
            onChange={handleInputChange}
            onKeyDown={handleKeyDown}
            disabled={disabled}
            rows={2}
            placeholder={
              disabled
                ? "This session is a fork/backup — sending is disabled."
                : "How can I help you today?"
            }
            style={{
              width: "100%",
              minHeight: "44px",
              maxHeight: "200px",
              border: "none",
              outline: "none",
              resize: "none",
              background: "transparent",
              color: "var(--text-primary)",
              fontFamily: "var(--font-content)",
              fontSize: "15px",
              lineHeight: 1.6,
              padding: 0,
              overflowY: "auto",
              display: "block",
            }}
          />

          {/* Bottom row inside the card */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: "10px",
              marginTop: "6px",
              paddingTop: "4px",
            }}
          >
            {/* Left: stash slot (no attach button — we don't support attachments) */}
            <div style={{ display: "flex", alignItems: "center", gap: "8px", minHeight: "32px" }}>
              {stash !== null ? (
                <button
                  type="button"
                  onClick={handleStashBadgeClick}
                  title="Restore stashed message"
                  style={{
                    background: "var(--bg-tool-block)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "999px",
                    color: "var(--text-secondary)",
                    fontSize: "11px",
                    padding: "4px 11px",
                    cursor: "pointer",
                    fontFamily: "var(--font-ui)",
                  }}
                >
                  1 stashed · click to restore
                </button>
              ) : (
                <span aria-hidden="true" />
              )}
            </div>

            {/* Right: unified settings pill + send/stop */}
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
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
                    fontSize: "13px",
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

              {isStreaming ? (
                <button
                  type="button"
                  onClick={onStop}
                  title="Stop"
                  aria-label="Stop"
                  style={sendBtnStyle(true)}
                >
                  <svg width="12" height="12" viewBox="0 0 12 12" aria-hidden="true">
                    <rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" />
                  </svg>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleSend}
                  title="Send (Enter)"
                  aria-label="Send message"
                  style={sendBtnStyle(canSend)}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" aria-hidden="true">
                    <path
                      d="M7 11.5V2.5M3 6l4-4 4 4"
                      stroke="currentColor"
                      strokeWidth="1.75"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      fill="none"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>

        <div
          style={{
            textAlign: "center",
            marginTop: "10px",
            fontSize: "12px",
            color: "var(--text-tertiary)",
            fontFamily: "var(--font-ui)",
          }}
        >
          Clau-Decode is AI and can make mistakes. Please double-check responses.
        </div>
      </div>
    </div>
  );
}

function sendBtnStyle(active: boolean): React.CSSProperties {
  return {
    width: "32px",
    height: "32px",
    borderRadius: "999px",
    border: "none",
    cursor: active ? "pointer" : "default",
    background: active ? "var(--text-primary)" : "var(--bg-tool-block)",
    color: active ? "var(--bg-base)" : "var(--text-tertiary)",
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    transition: "background var(--transition-fast)",
    flexShrink: 0,
  };
}

const bannerBtnStyle: React.CSSProperties = {
  padding: "3px 10px",
  fontSize: "11px",
  background: "var(--accent-orange)",
  color: "var(--text-on-accent)",
  border: "none",
  borderRadius: "6px",
  cursor: "pointer",
  fontWeight: 600,
};

const bannerDismissStyle: React.CSSProperties = {
  background: "none",
  border: "none",
  color: "inherit",
  cursor: "pointer",
  fontSize: "14px",
  lineHeight: 1,
  padding: "0 4px",
};

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

export default ChatInput;
