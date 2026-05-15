import { useCallback, useEffect, useRef, useState } from "react";
import type { FileContent } from "../../api/types";
import { api } from "../../api/client";
import { useAppStore } from "../../store";
import hljs from "../../utils/hljs";
import { LS } from "../../utils/localStorage";
import { ScrollContainer } from "../ScrollContainer";
import { TextBlock } from "../Messages/TextBlock";

const MIN_WIDTH = 360;
// Leave at least this much room for the main pane.
const MIN_MAIN_PANE = 360;

function loadStoredWidth(): number {
  if (typeof window === "undefined") return 720;
  const raw = window.localStorage.getItem(LS.FILE_VIEWER_WIDTH);
  const n = raw ? Number(raw) : NaN;
  if (!Number.isFinite(n)) return 720;
  return n;
}

function isMarkdown(file: FileContent | null): boolean {
  if (!file) return false;
  if (file.language === "markdown") return true;
  const lower = file.name.toLowerCase();
  return lower.endsWith(".md") || lower.endsWith(".markdown") || lower.endsWith(".mdx");
}

function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function IconCopy() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function IconEdit() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

const PRE_STYLE = {
  margin: 0,
  padding: "16px 20px",
  fontFamily: "var(--font-mono)",
  fontSize: "13px",
  lineHeight: 1.6,
  background: "var(--bg-code-block)",
  minHeight: "100%",
  whiteSpace: "pre-wrap" as const,
  wordBreak: "break-word" as const,
  overflowWrap: "anywhere" as const,
} as const;

export function FileViewer() {
  const viewingFilePath = useAppStore((s) => s.viewingFilePath);
  const setViewingFilePath = useAppStore((s) => s.setViewingFilePath);
  const [file, setFile] = useState<FileContent | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [highlighted, setHighlighted] = useState<string | null>(null);
  const [visible, setVisible] = useState(false);
  const [closing, setClosing] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [editEnabled, setEditEnabled] = useState<boolean>(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Panel width — drag-resizable, persisted across sessions.
  const [width, setWidth] = useState<number>(loadStoredWidth);
  const widthRef = useRef(width);
  widthRef.current = width;
  const [resizing, setResizing] = useState(false);

  // "Show raw" toggle for markdown files (overrides rendered view).
  const [showRawMarkdown, setShowRawMarkdown] = useState(false);

  // Resolve edit-enabled flag from config (cheap one-shot, cache in state).
  useEffect(() => {
    api.getConfig()
      .then((cfg) => setEditEnabled(cfg.edit_enabled))
      .catch(() => setEditEnabled(false));
  }, []);

  // Clamp stored width into a valid range for the current viewport. Runs once
  // on mount and whenever the window resizes — keeps the panel sane if the
  // user drags the browser window narrower than the saved width.
  useEffect(() => {
    const clamp = () => {
      const max = Math.max(MIN_WIDTH, window.innerWidth - MIN_MAIN_PANE);
      setWidth((w) => Math.max(MIN_WIDTH, Math.min(w, max)));
    };
    clamp();
    window.addEventListener("resize", clamp);
    return () => window.removeEventListener("resize", clamp);
  }, []);

  const startResize = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = widthRef.current;
    setResizing(true);
    const onMove = (ev: MouseEvent) => {
      const dx = startX - ev.clientX;
      const max = Math.max(MIN_WIDTH, window.innerWidth - MIN_MAIN_PANE);
      const next = Math.max(MIN_WIDTH, Math.min(startWidth + dx, max));
      setWidth(next);
    };
    const onUp = () => {
      setResizing(false);
      window.localStorage.setItem(LS.FILE_VIEWER_WIDTH, String(widthRef.current));
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    };
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }, []);

  useEffect(() => {
    if (!viewingFilePath) {
      setFile(null);
      setHighlighted(null);
      setError(null);
      setVisible(false);
      setClosing(false);
      setEditing(false);
      setDraft("");
      setSaveError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    setEditing(false);
    setHighlighted(null); // clear stale highlight from a prior file
    api.readFile(viewingFilePath)
      .then((data) => {
        if (cancelled) return;
        setFile(data);
        setDraft(data.content);

        // Three reasons to skip the inline hljs pass:
        //  1. No detected language — nothing to highlight against.
        //  2. Will be rendered as markdown — TextBlock runs rehype-highlight
        //     internally per code fence, so the whole-file pass is wasted.
        //  3. File is huge — synchronous hljs.highlight on 100KB+ of source
        //     blocks the main thread for seconds; raw text is acceptable.
        const SYNTAX_HIGHLIGHT_LIMIT = 100_000;
        const willRenderAsMarkdown = isMarkdown(data);
        const tooLarge = data.content.length > SYNTAX_HIGHLIGHT_LIMIT;
        if (!data.language || willRenderAsMarkdown || tooLarge) return;

        // Defer to after first paint so the viewer renders the raw text
        // immediately. hljs.highlight is synchronous and can be slow on
        // large files — running it in an idle callback keeps the open
        // animation smooth and the panel responsive.
        const idle = (cb: () => void) => {
          const w = window as Window & { requestIdleCallback?: (cb: () => void) => void };
          if (w.requestIdleCallback) w.requestIdleCallback(cb);
          else setTimeout(cb, 0);
        };
        idle(() => {
          if (cancelled) return;
          try {
            const result = hljs.highlight(data.content, { language: data.language! });
            if (!cancelled) setHighlighted(result.value);
          } catch {
            /* leave as plain text */
          }
        });
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed to read file");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [viewingFilePath]);

  useEffect(() => {
    if (!viewingFilePath) return;
    requestAnimationFrame(() => setVisible(true));
  }, [viewingFilePath]);

  // Focus the textarea when entering edit mode.
  useEffect(() => {
    if (editing) textareaRef.current?.focus();
  }, [editing]);

  const dirty = editing && draft !== (file?.content ?? "");

  const close = () => {
    if (dirty) {
      const ok = window.confirm("Discard unsaved changes?");
      if (!ok) return;
    }
    setClosing(true);
    setTimeout(() => setViewingFilePath(null), 180);
  };

  const handleCopy = async () => {
    if (file) {
      await navigator.clipboard.writeText(editing ? draft : file.content).catch(() => {});
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const startEdit = () => {
    if (!file) return;
    setDraft(file.content);
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    if (dirty) {
      const ok = window.confirm("Discard unsaved changes?");
      if (!ok) return;
    }
    setDraft(file?.content ?? "");
    setSaveError(null);
    setEditing(false);
  };

  const save = async () => {
    if (!file || !viewingFilePath) return;
    setSaving(true);
    setSaveError(null);
    try {
      await api.writeFile(viewingFilePath, draft);
      // Persist new content as the canonical file state and re-highlight.
      const newFile = { ...file, content: draft, size: new Blob([draft]).size };
      setFile(newFile);
      if (file.language) {
        try {
          const result = hljs.highlight(draft, { language: file.language });
          setHighlighted(result.value);
        } catch {
          setHighlighted(null);
        }
      }
      setEditing(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  // Cmd/Ctrl+S to save while editing.
  useEffect(() => {
    if (!editing) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        void save();
      }
    };
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editing, draft, file, viewingFilePath]);

  if (!viewingFilePath) return null;

  const fileName = viewingFilePath.split("/").pop() || viewingFilePath;
  const isOpen = visible && !closing;

  const headerButton = {
    background: "none",
    border: "none",
    cursor: "pointer",
    padding: "5px 9px",
    borderRadius: "var(--radius-sm)",
    display: "inline-flex",
    alignItems: "center",
    gap: "5px",
    fontSize: "12px",
    fontFamily: "var(--font-ui)",
    color: "var(--text-tertiary)",
    transition: "background 0.12s, color 0.12s",
  };

  // Preview is always the default for markdown; the Raw/Preview toggle is the
  // only thing that flips it. (Previously gated on a size heuristic that
  // overrode the toggle for big files — confusing and wrong.)
  const renderAsMarkdown = isMarkdown(file) && !editing && !showRawMarkdown;

  return (
    // Outer collapses from width 0 → target so the main body's flex space
    // flows smoothly instead of snapping. Inner stays at full target width
    // and gets clipped by overflow:hidden during the wipe.
    <div
      aria-hidden={!isOpen}
      style={{
        flex: "0 0 auto",
        width: isOpen ? `${width}px` : 0,
        minWidth: 0,
        overflow: "hidden",
        transition: resizing ? "none" : "width 180ms ease-out",
      }}
    >
    <div
      style={{
        width: `${width}px`,
        height: "100%",
        display: "flex",
        flexDirection: "column",
        background: "var(--bg-base)",
        borderLeft: "1px solid var(--border-subtle)",
        position: "relative",
        opacity: isOpen ? 1 : 0,
        transition: resizing ? "none" : "opacity 180ms ease-out",
      }}
    >
      {/* Resize handle on the left edge. */}
      <div
        onMouseDown={startResize}
        title="Drag to resize"
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: 0,
          width: "4px",
          cursor: "col-resize",
          zIndex: 2,
          background: resizing ? "var(--border-default)" : "transparent",
          transition: "background 0.12s",
        }}
        onMouseEnter={(e) => {
          if (!resizing) e.currentTarget.style.background = "var(--border-default)";
        }}
        onMouseLeave={(e) => {
          if (!resizing) e.currentTarget.style.background = "transparent";
        }}
      />
      {/* Header */}
      <div
        style={{
          height: "var(--header-height)",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 10px 0 18px",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "8px", overflow: "hidden", flex: 1, minWidth: 0 }}>
          <span
            style={{
              fontSize: "14px",
              fontWeight: 500,
              color: "var(--text-primary)",
              fontFamily: "var(--font-ui)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {fileName}
          </span>
          {file?.language && (
            <span
              style={{
                fontSize: "11px",
                color: "var(--text-tertiary)",
                fontFamily: "var(--font-mono)",
                flexShrink: 0,
              }}
            >
              {file.language}
            </span>
          )}
          {dirty && (
            <span
              title="Unsaved changes"
              style={{
                width: "6px",
                height: "6px",
                borderRadius: "50%",
                background: "var(--accent-orange)",
                flexShrink: 0,
              }}
            />
          )}
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "2px", flexShrink: 0 }}>
          {file && !editing && isMarkdown(file) && (
            <button
              onClick={() => setShowRawMarkdown((v) => !v)}
              title={showRawMarkdown ? "Show rendered markdown" : "Show raw source"}
              style={{
                ...headerButton,
                color: showRawMarkdown ? "var(--text-primary)" : "var(--text-tertiary)",
                background: showRawMarkdown ? "var(--bg-sidebar-hover)" : "none",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-primary)";
                if (!showRawMarkdown) e.currentTarget.style.background = "var(--bg-sidebar-hover)";
              }}
              onMouseLeave={(e) => {
                if (!showRawMarkdown) {
                  e.currentTarget.style.color = "var(--text-tertiary)";
                  e.currentTarget.style.background = "none";
                }
              }}
            >
              {showRawMarkdown ? "Preview" : "Raw"}
            </button>
          )}
          {file && !editing && editEnabled && (
            <button
              onClick={startEdit}
              title="Edit"
              style={headerButton}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = "var(--text-primary)";
                e.currentTarget.style.background = "var(--bg-sidebar-hover)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = "var(--text-tertiary)";
                e.currentTarget.style.background = "none";
              }}
            >
              <IconEdit /> Edit
            </button>
          )}
          {editing && (
            <>
              <button
                onClick={save}
                disabled={!dirty || saving}
                title="Save (⌘S)"
                style={{
                  ...headerButton,
                  color: dirty && !saving ? "var(--accent-orange)" : "var(--text-tertiary)",
                  cursor: dirty && !saving ? "pointer" : "default",
                  fontWeight: 500,
                }}
              >
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                onClick={cancelEdit}
                title="Cancel"
                style={headerButton}
                onMouseEnter={(e) => {
                  e.currentTarget.style.color = "var(--text-primary)";
                  e.currentTarget.style.background = "var(--bg-sidebar-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.color = "var(--text-tertiary)";
                  e.currentTarget.style.background = "none";
                }}
              >
                Cancel
              </button>
            </>
          )}
          {file && (
            <button
              onClick={handleCopy}
              title={copied ? "Copied!" : "Copy"}
              style={{
                ...headerButton,
                color: copied ? "var(--accent-orange)" : "var(--text-tertiary)",
              }}
              onMouseEnter={(e) => {
                if (!copied) {
                  e.currentTarget.style.color = "var(--text-primary)";
                  e.currentTarget.style.background = "var(--bg-sidebar-hover)";
                }
              }}
              onMouseLeave={(e) => {
                if (!copied) {
                  e.currentTarget.style.color = "var(--text-tertiary)";
                  e.currentTarget.style.background = "none";
                }
              }}
            >
              <IconCopy />
            </button>
          )}
          <button
            onClick={close}
            aria-label="Close file viewer"
            style={headerButton}
            onMouseEnter={(e) => {
              e.currentTarget.style.color = "var(--text-primary)";
              e.currentTarget.style.background = "var(--bg-sidebar-hover)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.color = "var(--text-tertiary)";
              e.currentTarget.style.background = "none";
            }}
          >
            <IconClose />
          </button>
        </div>
      </div>

      {saveError && (
        <div style={{
          padding: "8px 18px",
          fontSize: "12px",
          background: "var(--tool-error-bg)",
          color: "var(--tool-error-text)",
          borderBottom: "1px solid var(--tool-error-border)",
        }}>
          {saveError}
        </div>
      )}

      {/* Body */}
      {editing ? (
        // Direct overflow scroll on the textarea — ScrollContainer would clip
        // editing affordances (caret, selection).
        <textarea
          ref={textareaRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          spellCheck={false}
          style={{
            flex: 1,
            width: "100%",
            margin: 0,
            padding: "16px 20px",
            fontFamily: "var(--font-mono)",
            fontSize: "13px",
            lineHeight: 1.6,
            background: "var(--bg-code-block)",
            color: "var(--text-code)",
            border: "none",
            outline: "none",
            resize: "none",
            whiteSpace: "pre-wrap",
            wordBreak: "break-word",
            overflowWrap: "anywhere",
            overflowY: "auto",
            tabSize: 2,
          }}
        />
      ) : (
        <ScrollContainer style={{ flex: 1 }}>
          {loading && (
            <div style={{ padding: "24px", textAlign: "center", color: "var(--text-tertiary)", fontSize: "13px" }}>
              Loading…
            </div>
          )}
          {error && (
            <div style={{ padding: "24px", color: "var(--tool-error-text)", fontSize: "13px" }}>
              {error}
            </div>
          )}
          {file && !loading && (
            renderAsMarkdown ? (
              <div style={{ padding: "20px 24px" }}>
                <TextBlock text={file.content} />
              </div>
            ) : (
              <pre style={PRE_STYLE}>
                {highlighted ? (
                  <code dangerouslySetInnerHTML={{ __html: highlighted }} />
                ) : (
                  <code>{file.content}</code>
                )}
              </pre>
            )
          )}
        </ScrollContainer>
      )}
    </div>
    </div>
  );
}

export default FileViewer;
