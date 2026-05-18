<h1 align="center">Clau-Decode</h1>

<p align="center">
  <em>Browse, search, and analyze your AI coding assistant chat history — entirely local, entirely private.</em>
</p>

<p align="center">
  <a href="https://github.com/Comradery64/Clau-Decode/actions/workflows/ci.yml">
    <img alt="CI" src="https://img.shields.io/github/actions/workflow/status/Comradery64/Clau-Decode/ci.yml?branch=main&label=CI&style=flat-square">
  </a>
  <a href="LICENSE">
    <img alt="License" src="https://img.shields.io/badge/license-FSL--1.1--Apache--2.0-blue?style=flat-square">
  </a>
  <a href="pyproject.toml">
    <img alt="Python" src="https://img.shields.io/badge/python-3.10%2B-blue?style=flat-square">
  </a>
  <a href="https://github.com/Comradery64/Clau-Decode/blob/main/CHANGELOG.md">
    <img alt="Changelog" src="https://img.shields.io/badge/changelog-keep--a--changelog-orange?style=flat-square">
  </a>
</p>

<p align="center">
  <video
    src="https://github.com/user-attachments/assets/6f5a9a09-fbab-467f-82b1-c2e642dc8726"
    poster="https://github.com/Comradery64/Clau-Decode/raw/main/docs/demo-poster.jpg"
    controls
    muted
    playsinline
    width="820">
    <a href="https://github.com/user-attachments/assets/6f5a9a09-fbab-467f-82b1-c2e642dc8726">
      <img src="https://github.com/Comradery64/Clau-Decode/raw/main/docs/demo-poster.jpg" alt="Clau-Decode demo — click to play" width="820">
    </a>
  </video>
</p>

---

## Why Clau-Decode?

Your AI coding assistant writes a small mountain of JSONL session files into
`~/.claude/projects/` — useful, but unreadable and impossible to search by hand.
Clau-Decode reads those files locally, indexes them into SQLite, and serves a
fast browser UI with full-text search, conversation rendering, analytics, and a
recap engine.

## Quickstart

```bash
git clone https://github.com/Comradery64/Clau-Decode.git
cd Clau-Decode
pip install -e .           # or: uv sync
clau-decode                 # opens http://localhost:4242
```

Requires Python 3.10+. The wheel ships the pre-built frontend, so **no Node.js is needed** — only for development. All data stays on your machine — no telemetry.

## Features

### Session browser
- Conversations grouped by project, with star and archive
- Sort by recent, oldest, or alphabetical
- Hover preview before opening a session

### Search
- `Cmd+K` global search across every session — content, tool use, file paths, thinking blocks
- Inline live-search bar on the home page for quick lookups
- Results show highlighted excerpts and jump directly to the matching message

### Conversation viewer
- Rendered markdown with code syntax highlighting
- Tool-use blocks showing files read, commands run, edits made
- Thinking blocks revealing the model's reasoning
- Sidechain branches for sub-agent conversations
- `Cmd+O` expand/collapse all tool + thinking blocks
- `Cmd+E` toggle full tool output without truncation

### Home dashboard
- One headline insight banner when something surprising happens (a big week, a major model shift, a heavily-used tool)
- 30-day activity heatmap and 7-day sparklines next to top-line counts
- Featured "Pick up where you left off" card, with an "awaiting you" marker on threads waiting for your reply
- Most-touched files (click to open in the file viewer)
- Clickable project strip filters the sidebar

### File viewer
- Slides in as a resizable split pane on the right; the sidebar collapses automatically and restores when you close it
- Drag the left edge to resize — the width persists across sessions
- Word-wrapped source — no horizontal scrolling for long lines
- Markdown files render formatted by default, with a one-click toggle to raw source
- In-place editing with `Cmd+S` to save, dirty-state indicator, and confirm-on-discard
- Sandboxed to session-related directories; refuses binary or oversized writes

### Analytics
- Daily, weekly, and per-session token + cost breakdowns
- Cost estimation with live pricing data
- Model usage breakdown and trends
- Tool usage statistics
- File touch analysis
- Optimization tips (repeated reads, oversized results, cache hit rates)

### Live updates
- File watcher tails session files in real time
- UI auto-refreshes when new messages arrive
- Notification bell for unread updates

### Headless runner
- Send messages to sessions directly from the web UI
- Drives the CLI in stream-json mode for live responses
- Auto-stop watchdog for stuck sessions
- Slash command support with fallback to plain text

### Export
- Export any conversation as JSON or Markdown — includes token counts and cost estimates

### Multi-profile support
- Switch between separate config directories (e.g. multiple Claude installations or sandboxes)
- Each profile has its own data paths and color
- Click the avatar in the bottom-left to switch

### Themes
- Light, dark, and system theme
- Dark mode is tuned for long sessions — neutral surfaces, accent reserved for primary actions and live signals

## Usage

### CLI

| Flag | Description | Default |
|------|-------------|---------|
| `--path PATH` | Add a scan path (repeatable) | auto-detected |
| `--port PORT` | Override the listening port | `4242` |
| `--host HOST` | Bind host | `127.0.0.1` |
| `--expose` | Bind to `0.0.0.0` (accessible on the local network) | off |
| `--no-open` | Don't open the browser on startup | opens browser |
| `--enable-edit` | Enable message editing + deletion (creates a backup before every write) | off |
| `--force-refresh` | Clear the cache and force a full rescan | off |
| `--since YYYYMMDD` | Only include sessions on or after this date | all |
| `--version` | Print version and exit | |

> `--expose` makes your chat history visible to anyone on the same network. Use it on trusted networks only.

**Subcommands:**

| Command | Description |
|---------|-------------|
| `clau-decode` | Launch the web UI (default) |
| `clau-decode scan` | Rescan and print summary |
| `clau-decode today` | Show today's token usage and cost |
| `clau-decode stats` | Print statistical metrics |
| `clau-decode tips` | Print optimization tips |

### Keyboard shortcuts

| Shortcut | Action |
|----------|--------|
| `Cmd+K` | Open global search |
| `Cmd+O` | Expand/collapse all tool + thinking blocks |
| `Cmd+E` | Toggle full tool results |
| `Cmd+S` | Save (in file editor) |
| `Cmd+I` | Toggle chat panel |
| `Cmd+B` | Toggle sidebar |
| `Shift+Cmd+,` | Open settings |
| `Esc` | Close dialog / search |

## Configuration

Settings are saved to `~/.config/clau-decode/config.json`. Edit them in the UI,
or directly:

```json
{
  "data_paths": ["~/.claude"],
  "theme": "system",
  "auto_open_browser": true,
  "port": 4242,
  "edit_enabled": false
}
```

The session index lives at `~/.cache/clau-decode/index.db`. Delete it to force a
full rescan, or run `clau-decode --force-refresh`.

## Architecture

Clau-Decode is a local-first FastAPI server that scans your AI coding
assistant's JSONL session files into a SQLite index, serves a React +
TypeScript SPA, and optionally drives the Claude CLI in stream-json mode for
in-app sessions.

See [`ARCHITECTURE.md`](ARCHITECTURE.md) for a system diagram and deeper notes.

## Development

```bash
git clone https://github.com/Comradery64/Clau-Decode
cd Clau-Decode

# Install backend deps + build the frontend
make dev

# Run the app from source
make run

# Run tests
make test

# Rebuild the frontend only
make frontend
```

Requires Python 3.10+, [`uv`](https://docs.astral.sh/uv/), and Node.js 20+ for
frontend development.

GitHub Actions runs lint, type-check, and the Python + frontend test suites on
every PR — see [`.github/workflows/ci.yml`](.github/workflows/ci.yml).

## Contributing

Pull requests are welcome. Please read [`CONTRIBUTING.md`](CONTRIBUTING.md) for
the dev setup, code style, and commit conventions, and our
[Code of Conduct](CODE_OF_CONDUCT.md).

## Security

If you discover a security issue, please follow the responsible disclosure
process in [`SECURITY.md`](SECURITY.md) — do **not** open a public issue.

## Related docs

- [`ARCHITECTURE.md`](ARCHITECTURE.md) — system diagram and component overview
- [`CONTRIBUTING.md`](CONTRIBUTING.md) — dev setup and PR guidelines
- [`CODE_OF_CONDUCT.md`](CODE_OF_CONDUCT.md) — community expectations
- [`SECURITY.md`](SECURITY.md) — responsible disclosure
- [`CHANGELOG.md`](CHANGELOG.md) — release notes

## Acknowledgements

Clau-Decode is **inspired by, and built around the file format of, [Claude](https://www.anthropic.com/claude) and Claude Code from [Anthropic](https://www.anthropic.com/)**. This project is not affiliated with, endorsed by, or sponsored by Anthropic, PBC. *Claude* and *Claude Code* are trademarks of Anthropic, PBC; all references in this project are nominative.

> *A personal note from the author* — I didn't write the code in this repository or build any of the underlying tools. I sat at my computer, typed into it, and kept asking it for more. The actual line-by-line authoring was done by AI coding assistants — Anthropic's [Claude](https://www.anthropic.com/claude) (Sonnet and Opus) and [Z.ai](https://z.ai/)'s GLM-5.1, with the latter doing a substantial share of the heavy lifting alongside them. They aren't in the lists below because they're AI models rather than libraries, but they deserve named credit here. The projects, products, and people below did the rest of the real work that made Clau-Decode possible:

**Backend (Python)**

- [FastAPI](https://fastapi.tiangolo.com/) — HTTP API framework
- [Uvicorn](https://www.uvicorn.org/) — ASGI server
- [Pydantic](https://docs.pydantic.dev/) — data validation and settings
- [aiosqlite](https://github.com/omnilib/aiosqlite) — async SQLite driver
- [SQLite](https://www.sqlite.org/) — embedded database, including the [FTS5](https://www.sqlite.org/fts5.html) full-text search extension
- [watchfiles](https://github.com/samuelcolvin/watchfiles) — filesystem change notifications
- [anyio](https://github.com/agronholm/anyio) and [httpx](https://www.python-httpx.org/) — async primitives and HTTP client
- [Hatch](https://hatch.pypa.io/) and [hatch-vcs](https://github.com/ofek/hatch-vcs) — packaging and version management
- [uv](https://docs.astral.sh/uv/) — Python project and tool runner
- [pytest](https://docs.pytest.org/), [pytest-asyncio](https://github.com/pytest-dev/pytest-asyncio), and [pytest-cov](https://github.com/pytest-dev/pytest-cov) — testing

**Frontend (Web)**

- [React](https://react.dev/) and [React DOM](https://react.dev/reference/react-dom) — UI runtime
- [TypeScript](https://www.typescriptlang.org/) — typed JavaScript
- [Vite](https://vitejs.dev/) — bundler / dev server
- [Vitest](https://vitest.dev/) and [@testing-library](https://testing-library.com/) — unit / component testing
- [Zustand](https://github.com/pmndrs/zustand) — state management
- [react-markdown](https://github.com/remarkjs/react-markdown), [remark-gfm](https://github.com/remarkjs/remark-gfm), and [rehype-highlight](https://github.com/rehypejs/rehype-highlight) — Markdown rendering and code highlighting
- [highlight.js](https://highlightjs.org/) — syntax highlighter behind rehype-highlight
- [Apache ECharts](https://echarts.apache.org/) — analytics charts
- [OverlayScrollbars](https://kingsora.github.io/OverlayScrollbars/) — custom scrollbars
- [clsx](https://github.com/lukeed/clsx) — conditional class names
- [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/) — JS runtime and package manager

**Demo reel pipeline**

- [VHS](https://github.com/charmbracelet/vhs) — terminal recording as code (with [ttyd](https://github.com/tsl0922/ttyd) under the hood)
- [chafa](https://hpjansson.org/chafa/) — image-to-ANSI rendering, used to embed pixel-art into the terminal welcome banner
- [ImageMagick](https://imagemagick.org/) — image autocrop and text-on-color rendering for the outro card
- [FFmpeg](https://ffmpeg.org/) — video concat, audio mixing, sidechain ducking, and final mux
- [testreel](https://github.com/greentfrapp/testreel) — programmatic Chromium recording for the web-app segment
- [Playwright](https://playwright.dev/) — browser automation underlying testreel
- [tmux](https://github.com/tmux/tmux) — terminal multiplexer (optional, for multi-pane VHS scenes)
- Methodology reference: [saas-product-demo-video](https://github.com/noamdorr/saas-product-demo-video) — the SaaS demo-reel skill that inspired our soundtrack-splice and beat-alignment approach

**Tooling and platforms**

- [Homebrew](https://brew.sh/) — package management for the demo-reel toolchain on macOS
- [GitHub Actions](https://github.com/features/actions) — CI / type-check / test runners
- [Ruff](https://docs.astral.sh/ruff/) and [pre-commit](https://pre-commit.com/) — code style and pre-commit hooks
- [Editorconfig](https://editorconfig.org/) — consistent indentation across editors

Every project listed above is independently licensed by its respective authors; check each project's repository for terms. If we've missed an attribution, please [open an issue](https://github.com/Comradery64/Clau-Decode/issues).

## License

This project is licensed under the **Functional Source License, Version 1.1,
with the Apache 2.0 Future License**
([FSL-1.1-Apache-2.0](LICENSE)).

In short:
- Free for personal use, internal business use, modification, and forking.
- You may not use it to build a competing commercial product or service.
- Each release automatically converts to Apache 2.0 two years after publication.

See [`LICENSE`](LICENSE) for the full text and the
[FSL FAQ](https://fsl.software/) for context.
