import { useCallback, useEffect, useRef, useState } from "react";
import { api, getCachedConfig, getConfigCached } from "../../api/client";
import type { NativePtyFontFamily } from "../../api/types";
import { nativePtyFontStack, DEFAULT_NATIVE_PTY_FONT } from "../../constants/nativePtyFonts";
import { on } from "../../utils/events";
import { useNativePty } from "./hooks/useNativePty";
import {
  applyNativeTerminalTheme,
  createNativeFitAddon,
  createNativeTerminal,
  createNativeUnicodeAddon,
  type ITheme,
  type NativeTerminal,
  writeNativeTerminalBytes,
} from "./nativeTerminal/xtermTerminal";

export interface NativePtyNotice {
  kind: "error" | "info";
  text: string;
}

interface NativeTerminalViewProps {
  sessionId: string;
  onNotice?: (notice: NativePtyNotice) => void;
}

// Fallback width until config loads. Authoritative width is
// AppConfig.native_pty_cols — the SAME value the backend spawns the PTY at, so
// the browser terminal and the PTY always agree on width (no mismatch, no
// reflow gutter). The terminal is pinned to it; only rows track the viewport.
const DEFAULT_NATIVE_COLS = 100;
const TERMINAL_FONT_SIZE = 13;
const NATIVE_SCROLLBACK_ROWS = 5000;

function cssToken(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = window
    .getComputedStyle(document.documentElement)
    .getPropertyValue(name)
    .trim();
  return value || fallback;
}

function readDecodedTerminalTheme(): ITheme {
  const foreground = cssToken("--text-primary", "#484846");
  const background = cssToken("--bg-base", "#faf9f5");
  return {
    background,
    foreground,
    cursor: foreground,
    selectionBackground: cssToken("--accent-orange-subtle", "rgba(139, 115, 85, 0.08)"),
    selectionForeground: background,
    black: "#262624",
    red: cssToken("--tool-error-text", "#f87171"),
    green: cssToken("--accent-green", "#3fb950"),
    yellow: cssToken("--text-accent", "#e09a2a"),
    blue: cssToken("--hljs-property", "#7eb6c4"),
    magenta: cssToken("--hljs-keyword", "#c39ee0"),
    cyan: cssToken("--hljs-type", "#b8d4dc"),
    white: "#f5f4ed",
    brightBlack: cssToken("--text-tertiary", "#8a887f"),
    brightRed: "#fca5a5",
    brightGreen: "#6ee7a8",
    brightYellow: "#f5c542",
    brightBlue: "#9fd3df",
    brightMagenta: "#d8b4fe",
    brightCyan: "#d1f3f8",
    brightWhite: "#ffffff",
  };
}

export function NativeTerminalView({ sessionId, onNotice }: NativeTerminalViewProps) {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const terminalRef = useRef<NativeTerminal | null>(null);
  const initialSizeRef = useRef<{ rows: number; cols: number } | null>(null);
  const wroteSnapshotRef = useRef<string | null>(null);
  const lastNoticeRef = useRef<string | null>(null);
  const [initialSize, setInitialSize] = useState<{ rows: number; cols: number } | null>(null);
  const [terminalReady, setTerminalReady] = useState(0);
  const [nativeFont, setNativeFont] = useState<NativePtyFontFamily>(
    getCachedConfig()?.native_pty_font_family ?? DEFAULT_NATIVE_PTY_FONT,
  );
  const [nativeCols, setNativeCols] = useState<number>(
    getCachedConfig()?.native_pty_cols ?? DEFAULT_NATIVE_COLS,
  );

  // Live PTY output. xterm preserves the user's scroll position on write (it
  // only follows the tail when already at the bottom), so we just write — no
  // manual viewport bookkeeping.
  const handleOutputChunk = useCallback((chunk: Uint8Array) => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    writeNativeTerminalBytes(terminal, chunk);
  }, []);

  const { snapshot, snapshotBytes, alive, starting, writeInput, resize, error } = useNativePty(
    sessionId,
    { initialSize, onOutputChunk: handleOutputChunk },
  );

  useEffect(() => {
    initialSizeRef.current = null;
    setInitialSize(null);
    wroteSnapshotRef.current = null;
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    void getConfigCached().then((cfg) => {
      if (!cancelled) {
        setNativeFont(cfg.native_pty_font_family ?? DEFAULT_NATIVE_PTY_FONT);
        setNativeCols(cfg.native_pty_cols ?? DEFAULT_NATIVE_COLS);
      }
    }).catch(() => {});
    const unsubscribe = on("config-updated", (cfg) => {
      setNativeFont(cfg.native_pty_font_family ?? DEFAULT_NATIVE_PTY_FONT);
      setNativeCols(cfg.native_pty_cols ?? DEFAULT_NATIVE_COLS);
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  useEffect(() => {
    const handlePageHide = () => {
      api.ptyKillKeepalive(sessionId);
    };
    window.addEventListener("pagehide", handlePageHide);
    return () => {
      window.removeEventListener("pagehide", handlePageHide);
      void api.ptyBlur(sessionId).catch(() => {});
    };
  }, [sessionId]);

  // Create the xterm terminal. Recreated when the session or configured width
  // changes; font and theme are applied in place (below) so they don't remount.
  useEffect(() => {
    if (!hostRef.current) return undefined;

    // xterm v6 sizes via resize()/the fit addon, not constructor cols/rows.
    const terminal = createNativeTerminal({
      cursorBlink: true,
      fontFamily: nativePtyFontStack(nativeFont),
      fontSize: TERMINAL_FONT_SIZE,
      scrollback: NATIVE_SCROLLBACK_ROWS,
      theme: readDecodedTerminalTheme(),
      allowProposedApi: true,
    });
    const fitAddon = createNativeFitAddon();
    terminal.loadAddon(fitAddon);
    // Match claude's emoji/wide-char widths (Unicode 11) so glyphs don't shift
    // the line by a cell and cascade the offset down the screen on repaint.
    terminal.loadAddon(createNativeUnicodeAddon());
    terminal.unicode.activeVersion = "11";
    terminal.open(hostRef.current);
    terminalRef.current = terminal;
    setTerminalReady((key) => key + 1);

    const themeObserver = new MutationObserver(() => {
      applyNativeTerminalTheme(terminal, readDecodedTerminalTheme());
    });
    themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
    const inputDisposable = terminal.onData((data) => {
      void writeInput(data);
    });

    const setInitialTerminalSize = (nextInitialSize: { rows: number; cols: number }) => {
      if (initialSizeRef.current) return false;
      initialSizeRef.current = nextInitialSize;
      setInitialSize(nextInitialSize);
      return true;
    };
    // Width is pinned to nativeCols (matches the PTY spawn width); only the row
    // count follows the viewport height. xterm reflows losslessly anyway, but
    // pinning keeps the browser terminal exactly the PTY's width.
    const syncTerminalSize = () => {
      const dimensions = fitAddon.proposeDimensions();
      const rows = dimensions?.rows ?? terminal.rows;
      terminal.resize(nativeCols, rows);
      if (setInitialTerminalSize({ rows, cols: nativeCols })) return;
      void resize(rows, nativeCols);
    };
    syncTerminalSize();
    setInitialTerminalSize({ rows: terminal.rows, cols: nativeCols });
    const raf = requestAnimationFrame(syncTerminalSize);
    void document.fonts?.ready.then(syncTerminalSize).catch(() => {});
    const resizeObserver = new ResizeObserver(syncTerminalSize);
    resizeObserver.observe(hostRef.current);

    return () => {
      themeObserver.disconnect();
      resizeObserver.disconnect();
      cancelAnimationFrame(raf);
      inputDisposable.dispose();
      terminal.dispose();
      if (terminalRef.current === terminal) terminalRef.current = null;
      wroteSnapshotRef.current = null;
    };
  }, [nativeCols, resize, writeInput]);

  // Apply font changes in place (xterm re-measures + redraws on the setter).
  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    terminal.options.fontFamily = nativePtyFontStack(nativeFont);
  }, [nativeFont, terminalReady]);

  useEffect(() => {
    if (!snapshot || !snapshotBytes || !terminalRef.current) return;
    // Only replay a snapshot that belongs to the CURRENTLY selected session.
    // On a session switch the new terminal is recreated synchronously, but
    // `snapshot` state lags one commit behind the `sessionId` prop (it resets
    // via an effect). Without this guard the previous session's snapshot gets
    // written into the new terminal — its scrollback bleeds in until the
    // correct snapshot arrives. That window is invisible when switching to an
    // already-live PTY (its snapshot resolves immediately) but very visible on
    // the FIRST switch to a cold-spawning PTY, whose snapshot is delayed by the
    // spawn — "the other session is already there," gone on subsequent flips.
    if (snapshot.session_id !== sessionId) return;
    if (wroteSnapshotRef.current === snapshot.session_id) return;
    wroteSnapshotRef.current = snapshot.session_id;
    const terminal = terminalRef.current;
    // Replay the FULL captured ring so all of claude's history lands in xterm's
    // scrollback — a re-attach must be scrollable just like a cold spawn. We used
    // to trim to the LAST full repaint, which discarded everything above it and
    // left a one-screen buffer with nothing to scroll on re-attach (the bug:
    // reopen a session in Native and you couldn't scroll the history). Replaying
    // the whole ring reconstructs the same scrollback the cold-spawn path builds
    // by streaming. The terminal is freshly created per session, so there's no
    // stale buffer to clear first; xterm's VT engine renders at the pinned width.
    //
    // Chunked write: xterm's write() is synchronous on the VT parsing pass — a
    // large snapshot (hundreds of KB of escape sequences) blocks the main thread
    // for 800ms+. We write in 16KB chunks using xterm's built-in write callback,
    // which fires after each chunk is parsed+rendered, yielding frames between
    // chunks so the browser stays responsive throughout the replay.
    const data = snapshotBytes;
    const CHUNK_SIZE = 16384; // 16 KB per frame
    let offset = 0;
    const writeNextChunk = () => {
      if (offset >= data.length) {
        terminal.scrollToBottom();
        return;
      }
      const chunk = data.slice(offset, offset + CHUNK_SIZE);
      offset += CHUNK_SIZE;
      terminal.write(chunk, writeNextChunk);
    };
    writeNextChunk();
  }, [snapshot, snapshotBytes, terminalReady, sessionId]);

  // The PTY is spawned at the backend's default size, then resized to the
  // fitted row count. Once the PTY is alive, re-assert the fitted size so the
  // backend SIGWINCH lands at the dimensions xterm is actually showing (guards
  // against a resize that raced the spawn). Fires once per mount (terminal is
  // keyed per session, so a session switch gives a fresh ref).
  //
  // We deliberately do NOT send Ctrl+L (\f) here anymore. That was a leftover
  // from the canvas/WebGL-renderer era to repaint "stale bottom rows after
  // SIGWINCH" — a stale-*canvas* artifact. On the default DOM renderer (which
  // is what we use) the rows repaint correctly on their own, so the \f was pure
  // downside: claude responds to Ctrl+L by clearing and redrawing its footer
  // near the TOP of a fresh screen, leaving the rest of the tall pane blank
  // below it — the "too much room at the bottom of the native PTY" gap.
  const repaintedRef = useRef(false);
  useEffect(() => {
    if (alive !== true || repaintedRef.current) return;
    const terminal = terminalRef.current;
    if (!terminal) return;
    repaintedRef.current = true;
    void resize(terminal.rows, nativeCols);
  }, [alive, resize, nativeCols]);

  // Any claude scroll/jump (wheel, clicking the "Jump to bottom" hint, or the
  // Ctrl+End/Ctrl+Home/PageUp/PageDown keys) can leave xterm's canvas showing
  // stale/blank bottom rows: the renderer doesn't always repaint on a
  // programmatic / mid-scroll update, so the buffer is correct but the canvas
  // is stale. Once the interaction settles, force a cheap canvas repaint with
  // terminal.refresh() — NOT a resize. (An earlier version toggled the PTY one
  // row smaller and back to force a SIGWINCH re-layout; it worked, but that
  // resize is a full reflow on every scroll/click, which made scrolling janky.
  // refresh() repaints the existing buffer to the canvas without reflowing.)
  // Capture phase so it fires even though xterm consumes these events in
  // mouse-tracking mode. Keydown is filtered to the scroll keys so ordinary
  // typing never triggers a redraw.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return undefined;
    // The desync is cumulative — it only shows after a longer scroll, not a
    // small flick. So a wheel only schedules the (costly, slightly jumpy)
    // redraw once accumulated scroll distance crosses this threshold; the
    // accumulator resets after each redraw. Discrete jumps (clicking "Jump to
    // bottom", or Ctrl+End/Home/PageUp/PageDown) always redraw. Tune this px
    // value if small scrolls still trigger it / long scrolls don't.
    const WHEEL_REDRAW_THRESHOLD_PX = 800;
    let settleTimer = 0;
    let wheelAccumPx = 0;
    const scheduleRedraw = () => {
      window.clearTimeout(settleTimer);
      settleTimer = window.setTimeout(() => {
        const terminal = terminalRef.current;
        if (!terminal || terminal.rows <= 1) return;
        wheelAccumPx = 0;
        // Cheap canvas repaint of the whole viewport — no resize/reflow.
        terminal.refresh(0, terminal.rows - 1);
      }, 100);
    };
    const onWheel = (event: WheelEvent) => {
      wheelAccumPx += Math.abs(event.deltaY);
      if (wheelAccumPx >= WHEEL_REDRAW_THRESHOLD_PX) scheduleRedraw();
    };
    const onScrollKey = (event: KeyboardEvent) => {
      if (
        event.key === "PageUp" || event.key === "PageDown"
        || event.key === "Home" || event.key === "End"
      ) {
        scheduleRedraw();
      }
    };
    const opts: AddEventListenerOptions = { capture: true, passive: true };
    host.addEventListener("wheel", onWheel, opts);
    host.addEventListener("mouseup", scheduleRedraw, opts);
    host.addEventListener("keydown", onScrollKey, opts);
    return () => {
      host.removeEventListener("wheel", onWheel, opts);
      host.removeEventListener("mouseup", scheduleRedraw, opts);
      host.removeEventListener("keydown", onScrollKey, opts);
      window.clearTimeout(settleTimer);
    };
  }, [terminalReady]);

  useEffect(() => {
    const text = error
      ?? (starting ? "Starting native PTY…" : null)
      ?? (alive === false ? "Native PTY stopped" : null);
    if (!text) {
      lastNoticeRef.current = null;
      return;
    }
    const notice: NativePtyNotice = { kind: error ? "error" : "info", text };
    const key = `${notice.kind}:${notice.text}`;
    if (lastNoticeRef.current === key) return;
    lastNoticeRef.current = key;
    onNotice?.(notice);
  }, [alive, error, onNotice, starting]);

  return (
    <section
      data-testid="native-terminal-view"
      aria-label="Native Claude terminal"
      style={{
        flex: 1,
        minHeight: 0,
        width: "100%",
        background: "var(--bg-base)",
        borderTop: "1px solid var(--border-subtle)",
        overflow: "hidden",
      }}
    >
      {/* Centering: host div is a flex container so that the .xterm-screen
          pixel-width element (set by xterm JS) is centered reliably. margin:auto
          on .xterm did not work because .xterm itself has no explicit narrower
          width — its inner children use position:absolute and don't expand the
          block box, so both auto margins computed to zero. */}
      <div
        ref={hostRef}
        data-testid="native-terminal-host"
        style={{ height: "100%", width: "100%", padding: 0, display: "flex", justifyContent: "center", alignItems: "flex-start" }}
      />
    </section>
  );
}

export default NativeTerminalView;
