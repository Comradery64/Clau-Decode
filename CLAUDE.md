# clau-decode — Operational Notes for Agents

Repo-specific gotchas. Read before touching the running app or making claims about UI behavior.

## Frontend bundle is the source of truth at runtime

`src/clau_decode/static/` (assets, `index.html`, favicons) is **tracked in git and ships in the wheel** — see `.gitignore:53` (`!src/clau_decode/static/`, *"Keep the built static assets — they ship with the package"*). The committed `frontend/src/*` source is **irrelevant to the running app** until you rebuild — FastAPI serves the on-disk bundle. After any frontend change, run `npm run build` and **commit the regenerated bundle alongside the source change**, so a fresh clone and the published package both pick up your fix.

**Anytime you change `frontend/src/*` and then test in the browser:**

```sh
lsof -ti:4242 | xargs kill -9 2>/dev/null    # kill the dev server first
cd frontend && npm run build                  # regenerates static/assets/* + rewrites static/index.html
cd .. && nohup ~/bin/clau-decode-launch --no-open > /tmp/clau-decode.log 2>&1 & disown
```

**Always sanity-check the bundle** before claiming a fix is live:

```sh
# pick a distinctive symbol from your patch
grep -l 'mySymbol' src/clau_decode/static/assets/ChatView-*.js
ls -la src/clau_decode/static/assets/ChatView-*.js  # mtime must be > your commit time
```

A bundle dated before your commit is a stale-bundle bug, not a logic bug. Do not debug the symptom — rebuild first.

## Backend is editable-installed

`pip show clau-decode` reports `Editable project location`. Backend Python changes in `src/clau_decode/*` take effect on next server restart — no reinstall needed. Tests run via `pytest` from the repo root.

## Test profile

Only ever launch clau-decode via `~/bin/clau-decode-launch` (sets `ANTHROPIC_API_KEY` from Keychain, uses the `zai` cc-mirror profile). Never test against the `crad` profile (the user's personal subscription).

## Worktrees

Five Wave-1 cleanup worktrees live under `.claude/worktrees/agent-*`. Each is a separate branch with uncommitted WIP. Operate inside the worktree dir for any git ops; never run destructive git commands from the main worktree expecting them to propagate to a worktree (they won't).

## Port 4242 + orphan PTYs

The server lives on `4242`. Spawned `claude` child PTYs are visible via `pgrep -fl "cc-mirror.*native/claude.*--permission-mode"`. The runner's `DEFAULT_IDLE_TIMEOUT_S = 300.0` keeps inactive PTYs alive for 5 minutes — if you're chasing an "orphan PTY" symptom, that's the headline number.

```sh
# kill them all if testing accumulates orphans
pgrep -f "cc-mirror.*native/claude.*--permission-mode" | xargs kill -9 2>/dev/null
```
