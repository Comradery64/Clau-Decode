# Changelog

All notable changes to clau-decode will be documented in this file.

The format is based on [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). While the project is in the 0.x series, breaking changes may land in any minor release; we'll call them out clearly.

## [Unreleased]

### Added

### Changed

### Deprecated

### Removed

### Fixed

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

[Unreleased]: https://github.com/Comradery64/clau-decode/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/Comradery64/clau-decode/releases/tag/v0.1.0
