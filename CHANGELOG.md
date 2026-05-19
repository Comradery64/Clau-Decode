# Changelog

All notable changes to Clau-Decode will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the project is in the 0.x series, breaking changes may land in any minor release; we'll call them out clearly.

## [0.2.0] - 2026-05-18

### Added

- **Message history in chat input** — Up/Down arrow keys cycle through all past user messages from the conversation (parsed from JSONL). Up at cursor position 0 recalls older messages; Down at end of text moves forward. Normal cursor movement is preserved everywhere else.
- **Model selector** — pick Auto / Opus / Sonnet / Haiku directly in the chat input bar, no trip to settings required.
- **File explorer** — `Cmd+Shift+E` toggles a resizable file explorer panel beside the conversation.
- **New Task** — `Cmd+Shift+O` or the "New Task" button starts a fresh, empty session without an auto-greeting.
- **Sidebar drag-resize & collapse** — drag the right edge to resize the sidebar; drag past the snap threshold to collapse it with a smooth animation. Width persists across changes (not just drag release).
- **Favicon set & webmanifest** — multi-size favicons and a PWA manifest for a proper browser tab identity.
- **Readline-style editing** — `Ctrl+E` jumps to end of line, `Ctrl+K` kills to end of line, in the chat textarea.
- **Active session marker** — sidebar shows a pulsing indicator on sessions that are currently streaming.
- **Real-time session rename sync** — renaming a session propagates to all connected browser tabs instantly.
- **Worktree support** — resume and open-terminal commands now understand git worktrees.
- **Remote viewer support** — host-only actions (edit, send) are disabled for remote viewers to prevent accidents.
- **Full-length session titles** — titles are no longer truncated at 80 characters; sidebar shows the full text with hover overflow.

### Changed

- **Dependency upgrades** — React 18 → 19, Vite 5 → 8, Zustand 4 → 5, Vitest 2 → 4.
- **Sidebar header** — no gradient fade; cleaner, flatter look. Collapsed state shows full-width toggle button.
- **Context menus** — submenus flip direction when near the viewport edge instead of overflowing off-screen.
- **Dark mode code blocks** — increased border alpha so the divider between header and body is visible.
- **Thought chain titles** — verbs are capitalized and always include a noun for multi-tool turns.

### Fixed

- **Search scroll-to-message** — uses `getBoundingClientRect` for accurate positioning; results ordered by timestamp.
- **Scroll position** — re-pins correctly across container resizes (file explorer open/close, sidebar toggle).
- **FTS5 search** — punctuation in queries no longer causes syntax errors; treated as plain text.
- **File preview editing** — separated from the global `edit_enabled` flag, fixing a 422 error on save.
- **File explorer breadcrumb** — stays on a single line instead of wrapping.
- **Sidebar collapse animation** — unified to 352 ms ease-out; auto-collapses on narrow windows.
- **Runner fallback** — falls back to plain `claude` when the inferred binary isn't on PATH.
- **Stale chunk imports** — gracefully handles changed content hashes on lazy-loaded bundles.
- **Title truncation** — removed the 80-char DB truncation; added a migration to restore full titles.
- **New Task auto-greeting** — new sessions start empty; no text injected on the user's behalf (#9).

### Security

## [0.1.0] - 2026-05-13

Initial public release.

### Added

- **Session browser** — conversations grouped by project, with star/archive, sort by recent/oldest/alphabetical, and hover previews.
- **Global search** — `Cmd+K` searches across every session including content, tool use, file paths, and thinking blocks. Inline live-search bar on the home page for quick lookups.
- **Conversation viewer** — rendered markdown with syntax-highlighted code blocks, tool-use blocks, thinking blocks, and sidechain branches for sub-agent conversations.
- **Analytics dashboard** — daily, weekly, and per-session token and cost breakdowns, model usage trends, top tools, most-touched files, and a 30-day activity heatmap.
- **File viewer** — resizable split pane with word-wrapped source, markdown preview, in-place editing (`Cmd+S`), and a sandbox limited to session-related directories.
- **Multi-profile support** — switch between separate config directories (multiple Claude installations, sandboxes, etc.), each with its own data paths and color.
- **Headless CLI runner** — send messages to sessions directly from the web UI; drives the CLI in stream-json mode with an auto-stop watchdog and slash command support.
- **Export** — export any conversation as JSON or Markdown, with token counts and cost estimates included.
- **Recap generation** — headline insights surfaced on the home page when something surprising happens (a big week, a major model shift, a heavily-used tool).
- **Live updates** — file watcher tails session files in real time and the UI auto-refreshes when new messages arrive.
- **Tips engine** — flags repeated file reads, oversized tool results, and low cache-hit rates.
- **Keyboard shortcuts** — `Cmd+K`, `Cmd+O`, `Cmd+E`, `Cmd+S`, `Cmd+I`, `Cmd+B`, `Shift+Cmd+,`.

### Changed

- License changed from MIT to [FSL-1.1-Apache-2.0](LICENSE). All prior unreleased history was developed under MIT; the 0.1.0 release and everything after it ship under FSL-1.1-Apache-2.0, which converts to Apache 2.0 two years after each release.

[0.2.0]: https://github.com/Comradery64/Clau-Decode/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/Comradery64/Clau-Decode/releases/tag/v0.1.0
