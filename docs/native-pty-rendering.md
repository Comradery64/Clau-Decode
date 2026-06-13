# Native PTY Rendering

The Native view uses `ghostty-web`, a browser terminal renderer backed by Ghostty's VT engine compiled to WebAssembly. The frontend writes raw PTY bytes to the terminal; terminal emulation, alternate screen behavior, redraws, wrapping, and scrollback belong to Ghostty.

Rendering rules:

- Keep backend PTY resize invalidation because frames produced at different column counts cannot be replayed reliably.
- Treat the backend PTY output ring as a byte log, not as a terminal-state snapshot. Replay it into Ghostty only when the ring is complete and its saved rows/cols match the fitted browser terminal. If the ring overflowed or dimensions differ, attach cleanly and render only future live chunks.
- Do not trim or interpret PTY escape sequences in React.
- Do not patch or clip Ghostty renderer rows. Scrollback lines can legitimately
  have a different internal shape during replay or after resize; row-level
  mutation causes stale-width history to repaint as scrambled text.
- Do not disable terminal scrollback.
- The PTY font is user-configurable in Settings (`native_pty_font_family`). Each
  option maps to a CSS family stack in `frontend/src/constants/nativePtyFonts.ts`.
  OFL fonts are bundled as local `@font-face` woff2 under
  `frontend/src/assets/fonts/` (no remote/CDN fonts at runtime); commercial
  fonts are offered but not bundled and render only if installed. Apply font
  changes in place (`options.fontFamily` + re-measure) — never remount the
  terminal, or live scrollback is lost.
- The PTY width is a single config value in terminal columns
  (`AppConfig.native_pty_cols`, default 100), shared by the backend spawn
  (`TIOCSWINSZ`) and the browser terminal. The terminal is PINNED to that width
  and NEVER reflows it — only rows track the viewport height. (ghostty-web 0.4
  reflows stale-width scrollback lossily, so changing the width would scramble
  history; we match Claude's spawn width and display as-is.)
- Keep Decoded as the canonical transcript view; Native is the terminal viewport over the live PTY stream.

## Security

The Native view mirrors the **raw PTY byte stream** to the browser (via SSE +
the snapshot ring) and renders it on a canvas. Anything Claude prints on screen
— including secrets surfaced during `/login`, env dumps, etc. — therefore
reaches the browser DOM/canvas. This is inherent to a terminal mirror and is
acceptable because clau-decode is a **local, single-user** app bound to
`127.0.0.1`. Do not expose the server on a public interface.

Server-side, raw PTY bytes must never be written to logs or disk by default.
The one place that used to dump them — the `/btw` extraction-failure path —
now only writes the raw buffer to `/tmp` when `CLAU_DECODE_DEBUG` is set
(opt-in); otherwise it logs the buffer length only.
