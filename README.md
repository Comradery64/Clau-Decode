# Clau-Decode

A local web app for browsing, searching, and analyzing your [Claude Code](https://claude.ai/code) chat history.

All your sessions stay on your machine — nothing is sent to any server.

---

## What it does

- **Browse** every Claude Code session, organized by project
- **Search** across all conversations with full-text search
- **View** messages with proper formatting — code blocks, tool calls, thinking blocks
- **Live updates** — the UI refreshes automatically when new sessions are written

---

## Requirements

- **Python 3.10 or newer** — check with `python3 --version`
- **Claude Code** installed and used at least once (so `~/.claude/projects/` exists)

---

## Installation

Pick whichever method matches how you manage Python tools:

**With `uv` (fastest):**
```bash
uv tool install git+https://github.com/nicholasgasior/clau-decode
```

**With `pipx`:**
```bash
pipx install git+https://github.com/nicholasgasior/clau-decode
```

**With `pip`:**
```bash
pip install git+https://github.com/nicholasgasior/clau-decode
```

---

## Quick start

```bash
clau-decode
```

That's it. The app scans `~/.claude` automatically, starts a local server, and opens your browser at `http://localhost:4242`.

---

## CLI options

| Flag | What it does | Default |
|------|-------------|---------|
| `--path PATH` | Add an extra folder to scan (repeatable) | `~/.claude` |
| `--port PORT` | Change the port | `4242` |
| `--host HOST` | Change the bind address | `127.0.0.1` |
| `--no-open` | Don't open a browser window on startup | _(opens browser)_ |
| `--version` | Print the version and exit | |

**Examples:**

Scan a second Claude Code directory:
```bash
clau-decode --path ~/work/.claude
```

Use a different port and skip the browser:
```bash
clau-decode --port 8080 --no-open
```

---

## Configuration

Settings are saved to `~/.config/clau-decode/config.json` after you change them in the UI. You can also edit this file directly:

```json
{
  "data_paths": ["~/.claude"],
  "theme": "system",
  "auto_open_browser": true,
  "port": 4242
}
```

The session index is stored at `~/.cache/clau-decode/index.db`. Delete this file to force a full rescan.

---

## Development setup

Clone the repo and let `uv` handle the environment:

```bash
git clone https://github.com/nicholasgasior/clau-decode
cd clau-decode
uv run pytest
```

`uv` creates an isolated virtual environment and installs all dependencies automatically on the first run — no manual activation needed.

Run the app directly from source:

```bash
uv run clau-decode
```

---

## License

MIT
