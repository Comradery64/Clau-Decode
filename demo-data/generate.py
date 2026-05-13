#!/usr/bin/env python3
"""Deterministic mock-data generator for clau-decode screen recordings.

Produces a `projects/` tree mirroring what Claude Code writes to
`~/.claude/projects/`, with synthetic-but-realistic JSONL sessions.

Run from the repo root:
    python demo-data/generate.py

The output dir is wiped and rebuilt every run.
"""
from __future__ import annotations

import json
import random
import shutil
import uuid
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ---------------------------------------------------------------------------
# Config
# ---------------------------------------------------------------------------

SEED = 4242
OUT_ROOT = Path(__file__).parent / "projects"
TODAY = datetime(2026, 5, 13, 18, 0, 0, tzinfo=timezone.utc)

MODELS = {
    "sonnet": "claude-sonnet-4-6",
    "opus": "claude-opus-4-7",
    "haiku": "claude-haiku-4-5",
}

PROJECTS = {
    "nextjs-app": {
        "cwd": "/Users/alex/code/nextjs-app",
        "mangled": "-Users-alex-code-nextjs--app",
        "branch": "main",
    },
    "data-pipeline": {
        "cwd": "/Users/alex/code/data-pipeline",
        "mangled": "-Users-alex-code-data--pipeline",
        "branch": "main",
    },
    "infra": {
        "cwd": "/Users/alex/code/infra",
        "mangled": "-Users-alex-code-infra",
        "branch": "main",
    },
    "dotfiles": {
        "cwd": "/Users/alex/dotfiles",
        "mangled": "-Users-alex-dotfiles",
        "branch": "main",
    },
}

rng = random.Random(SEED)


def gen_uuid() -> str:
    return str(uuid.UUID(int=rng.getrandbits(128), version=4))


def iso(ts: datetime) -> str:
    return ts.strftime("%Y-%m-%dT%H:%M:%S.000Z")


# ---------------------------------------------------------------------------
# Session builder
# ---------------------------------------------------------------------------


class Session:
    def __init__(self, project_key: str, title: str, start: datetime, model: str = "sonnet"):
        self.proj = PROJECTS[project_key]
        self.project_key = project_key
        self.session_id = gen_uuid()
        self.title = title
        self.cwd = self.proj["cwd"]
        self.branch = self.proj["branch"]
        self.model_default = MODELS[model]
        self.ts = start
        self.parent: str | None = None
        self.parent_sidechain: str | None = None
        self.lines: list[dict] = []
        self.lines.append(
            {"type": "permission-mode", "permissionMode": "default", "sessionId": self.session_id}
        )
        self.lines.append(
            {"type": "custom-title", "customTitle": title, "sessionId": self.session_id}
        )

    def _tick(self, seconds: int) -> str:
        self.ts = self.ts + timedelta(seconds=seconds)
        return iso(self.ts)

    def _common(self) -> dict:
        return {
            "userType": "external",
            "entrypoint": "cli",
            "cwd": self.cwd,
            "sessionId": self.session_id,
            "version": "2.0.0",
            "gitBranch": self.branch,
        }

    def user(self, text: str, sec: int = 30) -> str:
        uid = gen_uuid()
        rec = {
            "parentUuid": self.parent,
            "isSidechain": False,
            "promptId": f"prompt-{uid[:8]}",
            "type": "user",
            "message": {"role": "user", "content": text},
            "uuid": uid,
            "timestamp": self._tick(sec),
            "isMeta": False,
            **self._common(),
        }
        self.lines.append(rec)
        self.parent = uid
        return uid

    def _asst_message(self, content: list[dict], stop_reason: str, usage: dict, model: str) -> dict:
        return {
            "model": model,
            "id": "msg_" + gen_uuid()[:12],
            "type": "message",
            "role": "assistant",
            "content": content,
            "stop_reason": stop_reason,
            "usage": usage,
        }

    def assistant(
        self,
        text: str,
        usage: dict | None = None,
        thinking: str | None = None,
        sec: int = 6,
        model: str | None = None,
    ) -> str:
        m = MODELS.get(model, model) if model else self.model_default
        content: list[dict] = []
        if thinking:
            content.append(
                {"type": "thinking", "thinking": thinking, "signature": "sig_" + gen_uuid()[:8]}
            )
        content.append({"type": "text", "text": text})
        usage = usage or _default_usage(len(text))
        uid = gen_uuid()
        rec = {
            "parentUuid": self.parent,
            "isSidechain": False,
            "message": self._asst_message(content, "end_turn", usage, m),
            "requestId": "req_" + gen_uuid()[:12],
            "type": "assistant",
            "uuid": uid,
            "timestamp": self._tick(sec),
            **self._common(),
        }
        self.lines.append(rec)
        self.parent = uid
        return uid

    def tool_call(
        self,
        tool: str,
        tool_input: dict,
        intro_text: str | None = None,
        thinking: str | None = None,
        usage: dict | None = None,
        sec: int = 5,
        model: str | None = None,
    ) -> tuple[str, str]:
        m = MODELS.get(model, model) if model else self.model_default
        content: list[dict] = []
        if thinking:
            content.append(
                {"type": "thinking", "thinking": thinking, "signature": "sig_" + gen_uuid()[:8]}
            )
        if intro_text:
            content.append({"type": "text", "text": intro_text})
        tool_use_id = "toolu_" + gen_uuid()[:16]
        content.append({"type": "tool_use", "id": tool_use_id, "name": tool, "input": tool_input})
        usage = usage or _default_usage(len(intro_text or "") + 100)
        uid = gen_uuid()
        rec = {
            "parentUuid": self.parent,
            "isSidechain": False,
            "message": self._asst_message(content, "tool_use", usage, m),
            "requestId": "req_" + gen_uuid()[:12],
            "type": "assistant",
            "uuid": uid,
            "timestamp": self._tick(sec),
            **self._common(),
        }
        self.lines.append(rec)
        self.parent = uid
        return uid, tool_use_id

    def tool_result(self, tool_use_id: str, output: str, sec: int = 2, is_error: bool = False) -> str:
        uid = gen_uuid()
        rec = {
            "parentUuid": self.parent,
            "isSidechain": False,
            "type": "user",
            "message": {
                "role": "user",
                "content": [
                    {
                        "type": "tool_result",
                        "tool_use_id": tool_use_id,
                        "content": [{"type": "text", "text": output}],
                        **({"is_error": True} if is_error else {}),
                    }
                ],
            },
            "uuid": uid,
            "timestamp": self._tick(sec),
            "isMeta": True,
            **self._common(),
        }
        self.lines.append(rec)
        self.parent = uid
        return uid

    def agent_sidechain(self, prompt: str, reply: str, model: str = "haiku", sec: int = 4) -> None:
        """Spawn an Agent tool call + the matching sidechain reply branch."""
        parent_main = self.parent
        ass_uuid, tool_use_id = self.tool_call(
            "Agent",
            {"description": "Sub-agent task", "prompt": prompt},
            intro_text="I'll spawn a sub-agent to handle this in parallel.",
            sec=sec,
        )
        side_user_uid = gen_uuid()
        side_user = {
            "parentUuid": ass_uuid,
            "isSidechain": True,
            "type": "user",
            "message": {"role": "user", "content": prompt},
            "uuid": side_user_uid,
            "timestamp": self._tick(2),
            "isMeta": False,
            "sourceToolAssistantUUID": ass_uuid,
            **self._common(),
        }
        self.lines.append(side_user)

        side_asst_uid = gen_uuid()
        side_asst = {
            "parentUuid": side_user_uid,
            "isSidechain": True,
            "type": "assistant",
            "message": self._asst_message(
                [{"type": "text", "text": reply}],
                "end_turn",
                _default_usage(len(reply)),
                MODELS[model],
            ),
            "requestId": "req_" + gen_uuid()[:12],
            "uuid": side_asst_uid,
            "timestamp": self._tick(sec * 4),
            "sourceToolAssistantUUID": ass_uuid,
            **self._common(),
        }
        self.lines.append(side_asst)

        # Restore main thread parent pointer for tool_result
        self.parent = ass_uuid
        self.tool_result(tool_use_id, reply, sec=1)
        # parent is now the tool_result; continue main thread from there

    def write(self) -> None:
        proj_dir = OUT_ROOT / self.proj["mangled"]
        proj_dir.mkdir(parents=True, exist_ok=True)
        path = proj_dir / f"{self.session_id}.jsonl"
        with path.open("w", encoding="utf-8") as f:
            for line in self.lines:
                f.write(json.dumps(line) + "\n")


def _default_usage(text_len: int) -> dict:
    base = max(40, text_len // 4)
    return {
        "input_tokens": rng.randint(150, 1500),
        "output_tokens": base + rng.randint(20, 200),
        "cache_creation_input_tokens": rng.choice([0, 0, 0, rng.randint(500, 4000)]),
        "cache_read_input_tokens": rng.choice([0, rng.randint(1000, 20000)]),
    }


# ---------------------------------------------------------------------------
# Scenarios
# ---------------------------------------------------------------------------


def s_quick_qa(project: str, start: datetime, title: str, question: str, answer: str, model: str = "sonnet") -> Session:
    s = Session(project, title, start, model=model)
    s.user(question)
    s.assistant(answer)
    return s


def s_read_explain(
    project: str,
    start: datetime,
    title: str,
    question: str,
    file_path: str,
    file_content: str,
    explanation: str,
    thinking: str | None = None,
    model: str = "sonnet",
) -> Session:
    s = Session(project, title, start, model=model)
    s.user(question)
    _, tu = s.tool_call(
        "Read",
        {"file_path": file_path},
        intro_text="Let me read that file.",
        thinking=thinking,
    )
    s.tool_result(tu, file_content)
    s.assistant(explanation)
    return s


def s_read_edit(
    project: str,
    start: datetime,
    title: str,
    question: str,
    file_path: str,
    file_content: str,
    old_string: str,
    new_string: str,
    summary: str,
    thinking: str | None = None,
    model: str = "sonnet",
) -> Session:
    s = Session(project, title, start, model=model)
    s.user(question)
    _, tu_read = s.tool_call(
        "Read",
        {"file_path": file_path},
        intro_text="Reading the file first.",
        thinking=thinking,
    )
    s.tool_result(tu_read, file_content)
    _, tu_edit = s.tool_call(
        "Edit",
        {"file_path": file_path, "old_string": old_string, "new_string": new_string},
        intro_text="Now applying the fix.",
    )
    s.tool_result(tu_edit, f"The file {file_path} has been updated.")
    s.assistant(summary)
    return s


def s_bash_then_explain(
    project: str,
    start: datetime,
    title: str,
    question: str,
    command: str,
    output: str,
    explanation: str,
    model: str = "sonnet",
) -> Session:
    s = Session(project, title, start, model=model)
    s.user(question)
    _, tu = s.tool_call(
        "Bash",
        {"command": command, "description": title},
        intro_text=f"Running `{command.split()[0]}` to check.",
    )
    s.tool_result(tu, output)
    s.assistant(explanation)
    return s


def s_grep_then_edit(
    project: str,
    start: datetime,
    title: str,
    question: str,
    pattern: str,
    grep_output: str,
    target_file: str,
    target_content: str,
    old: str,
    new: str,
    summary: str,
    model: str = "sonnet",
) -> Session:
    s = Session(project, title, start, model=model)
    s.user(question)
    _, tu = s.tool_call("Grep", {"pattern": pattern, "output_mode": "files_with_matches"}, intro_text="Let me search for that.")
    s.tool_result(tu, grep_output)
    _, tu2 = s.tool_call("Read", {"file_path": target_file}, intro_text=f"Opening {target_file}.")
    s.tool_result(tu2, target_content)
    _, tu3 = s.tool_call("Edit", {"file_path": target_file, "old_string": old, "new_string": new})
    s.tool_result(tu3, f"The file {target_file} has been updated.")
    s.assistant(summary)
    return s


def s_epic_refactor(project: str, start: datetime, title: str, turns: list[dict], model: str = "opus") -> Session:
    """Long, expensive session — multiple tool cycles, thinking blocks, large usage."""
    s = Session(project, title, start, model=model)
    for t in turns:
        kind = t["kind"]
        if kind == "user":
            s.user(t["text"], sec=t.get("sec", 30))
        elif kind == "assistant":
            usage = {
                "input_tokens": rng.randint(3000, 12000),
                "output_tokens": rng.randint(400, 1500),
                "cache_creation_input_tokens": rng.randint(2000, 8000),
                "cache_read_input_tokens": rng.randint(15000, 80000),
            }
            s.assistant(t["text"], usage=usage, thinking=t.get("thinking"), sec=t.get("sec", 12))
        elif kind == "tool":
            usage = {
                "input_tokens": rng.randint(2000, 8000),
                "output_tokens": rng.randint(150, 600),
                "cache_creation_input_tokens": rng.randint(1000, 5000),
                "cache_read_input_tokens": rng.randint(10000, 60000),
            }
            _, tu = s.tool_call(
                t["tool"],
                t["input"],
                intro_text=t.get("intro"),
                thinking=t.get("thinking"),
                usage=usage,
                sec=t.get("sec", 8),
            )
            s.tool_result(tu, t["result"], sec=t.get("result_sec", 3))
    return s


# ---------------------------------------------------------------------------
# Content bank
# ---------------------------------------------------------------------------


def build_sessions() -> list[Session]:
    sessions: list[Session] = []

    # --- nextjs-app ---
    sessions.append(s_read_edit(
        "nextjs-app",
        TODAY - timedelta(days=27, hours=4),
        "Fix hydration mismatch on /dashboard",
        "Getting a hydration mismatch warning when /dashboard loads. The server HTML and the client render disagree on the timestamp.",
        "/Users/alex/code/nextjs-app/src/app/dashboard/page.tsx",
        '"use client";\n\nexport default function Dashboard() {\n  return (\n    <div className="p-6">\n      <h1>Welcome back</h1>\n      <p>Last refreshed: {new Date().toLocaleString()}</p>\n    </div>\n  );\n}\n',
        "<p>Last refreshed: {new Date().toLocaleString()}</p>",
        '<p suppressHydrationWarning>Last refreshed: <ClientTime /></p>',
        "Hydration mismatches come from non-deterministic values rendered during SSR. `new Date().toLocaleString()` evaluates differently on the server (UTC, no locale) than in the browser. I extracted the timestamp into a `<ClientTime />` component that only renders after mount, and added `suppressHydrationWarning` to the wrapper.",
        thinking="Likely SSR/CSR divergence — Date.now/toLocaleString are classic offenders here.",
    ))

    sessions.append(s_read_explain(
        "nextjs-app",
        TODAY - timedelta(days=24, hours=6),
        "Why is this useEffect running twice?",
        "My useEffect is running twice in dev. I know about StrictMode but the fetch is idempotent — should I leave it or guard against it?",
        "/Users/alex/code/nextjs-app/src/components/UserPanel.tsx",
        '"use client";\nimport { useEffect, useState } from "react";\n\nexport function UserPanel({ userId }: { userId: string }) {\n  const [user, setUser] = useState<User | null>(null);\n  useEffect(() => {\n    fetch(`/api/users/${userId}`).then(r => r.json()).then(setUser);\n  }, [userId]);\n  return user ? <UserCard user={user} /> : <Spinner />;\n}\n',
        "Short answer: leave it. StrictMode intentionally double-invokes effects in dev to surface effects that aren't idempotent or that leak. Your fetch is safe to call twice — the request races but state updates are last-write-wins. If you want to silence the duplicate request, wrap the fetcher in SWR or React Query — they dedupe in-flight requests by key. Adding `useRef` guards is an anti-pattern and will hide real bugs in production.",
    ))

    sessions.append(s_bash_then_explain(
        "nextjs-app",
        TODAY - timedelta(days=18, hours=2),
        "Vite HMR not updating CSS",
        "Vite HMR works for JS but CSS changes aren't reflected without a hard refresh. Started yesterday.",
        "cat /Users/alex/code/nextjs-app/vite.config.ts",
        "import { defineConfig } from 'vite';\nimport react from '@vitejs/plugin-react';\n\nexport default defineConfig({\n  plugins: [react()],\n  server: {\n    watch: { usePolling: false },\n  },\n  css: {\n    devSourcemap: true,\n  },\n});\n",
        "Your config looks fine. CSS HMR via Vite requires the import graph to see your CSS — if you started using a CSS-in-JS lib or moved styles into a `?raw` import the HMR boundary breaks. Quick check: does the file you're editing get imported from somewhere reachable from `main.tsx`? Run `vite --debug hmr` and watch the logs while you save the CSS file; you'll see whether the update is being broadcast.",
    ))

    sessions.append(s_grep_then_edit(
        "nextjs-app",
        TODAY - timedelta(days=14, hours=1),
        "Add dark mode toggle to settings",
        "Need a dark mode toggle in the settings page that persists to localStorage and respects prefers-color-scheme on first load.",
        "useTheme|ThemeProvider",
        "src/lib/theme.ts\nsrc/components/SettingsForm.tsx\nsrc/app/layout.tsx",
        "/Users/alex/code/nextjs-app/src/components/SettingsForm.tsx",
        'import { useTheme } from "@/lib/theme";\n\nexport function SettingsForm() {\n  const { theme, setTheme } = useTheme();\n  return (\n    <form>\n      <fieldset>\n        <legend>Account</legend>\n        <input name="email" type="email" />\n      </fieldset>\n    </form>\n  );\n}\n',
        '      <fieldset>\n        <legend>Account</legend>\n        <input name="email" type="email" />\n      </fieldset>',
        '      <fieldset>\n        <legend>Account</legend>\n        <input name="email" type="email" />\n      </fieldset>\n      <fieldset>\n        <legend>Appearance</legend>\n        <label>\n          <input\n            type="checkbox"\n            checked={theme === "dark"}\n            onChange={(e) => setTheme(e.target.checked ? "dark" : "light")}\n          />\n          Dark mode\n        </label>\n      </fieldset>',
        "Added the toggle wired to your existing `useTheme` hook. The hook already reads localStorage on mount and falls back to `matchMedia('(prefers-color-scheme: dark)')` so first-load behavior is correct. I didn't touch `layout.tsx` — the `<html data-theme>` attribute is already being set by your provider.",
    ))

    sessions.append(s_quick_qa(
        "nextjs-app",
        TODAY - timedelta(days=9, hours=8),
        "TypeScript: property 'session' missing on Request",
        "I'm getting `Property 'session' does not exist on type 'NextRequest'` in middleware. Where do I extend the type?",
        "You augment the module declaration. Create `types/next.d.ts`:\n\n```ts\nimport 'next/server';\n\ndeclare module 'next/server' {\n  interface NextRequest {\n    session?: { userId: string; expiresAt: Date };\n  }\n}\n```\n\nThen make sure `tsconfig.json` has `\"include\": [\"types/**/*.d.ts\", ...]`. Restart the TS server in your editor — it caches declarations aggressively.",
    ))

    sessions.append(s_read_edit(
        "nextjs-app",
        TODAY - timedelta(days=6, hours=11),
        "Playwright tests flaking on CI only",
        "These Playwright tests pass locally every time but flake ~30% on GitHub Actions. Auth flow specifically.",
        "/Users/alex/code/nextjs-app/tests/e2e/auth.spec.ts",
        'import { test, expect } from "@playwright/test";\n\ntest("user can sign in and reach dashboard", async ({ page }) => {\n  await page.goto("/login");\n  await page.fill("input[name=email]", "demo@example.com");\n  await page.fill("input[name=password]", "hunter2");\n  await page.click("button[type=submit]");\n  await expect(page).toHaveURL("/dashboard");\n  await expect(page.locator("h1")).toHaveText("Welcome back");\n});\n',
        '  await page.click("button[type=submit]");\n  await expect(page).toHaveURL("/dashboard");',
        '  await page.click("button[type=submit]");\n  await page.waitForURL("/dashboard", { timeout: 15000 });\n  await expect(page).toHaveURL("/dashboard");',
        "The flake is almost certainly the navigation race: `toHaveURL` polls but starts immediately, and on cold CI runners the redirect can take 3-4s after the click. Switched to `waitForURL` with an explicit timeout — Playwright will wait for the actual navigation event rather than polling the URL string. Also worth checking that your test runs aren't sharing storage state between workers; each worker should get a fresh context.",
        thinking="CI is slower than dev. Either auth round-trip is slower, or there's a missing wait. Likely a 'click then assert URL' race.",
    ))

    sessions.append(s_quick_qa(
        "nextjs-app",
        TODAY - timedelta(days=2, hours=4),
        "Migrate fetch to React Query",
        "Should I migrate all my raw `fetch` calls to React Query, or just the ones that need caching?",
        "Just the ones that need caching, deduping, or refetch-on-focus. One-shot mutations and fire-and-forget side effects don't need it. The rule I use: if two components might want the same data, or if the data is reused on remount within a minute, it goes through React Query. Otherwise `fetch` in a Server Component or a one-off `useEffect` is fine.",
        model="haiku",
    ))

    sessions.append(s_read_explain(
        "nextjs-app",
        TODAY - timedelta(hours=18),
        "Investigate slow /api/search route",
        "The /api/search route is taking 1.5s p95. Can you see anything obvious?",
        "/Users/alex/code/nextjs-app/src/app/api/search/route.ts",
        'import { db } from "@/lib/db";\nimport { NextRequest } from "next/server";\n\nexport async function GET(req: NextRequest) {\n  const q = req.nextUrl.searchParams.get("q") ?? "";\n  const results = await db.query.documents.findMany({\n    where: (doc, { ilike }) => ilike(doc.title, `%${q}%`),\n  });\n  const enriched = await Promise.all(\n    results.map(async (r) => ({\n      ...r,\n      author: await db.query.users.findFirst({ where: (u, { eq }) => eq(u.id, r.authorId) }),\n    }))\n  );\n  return Response.json(enriched);\n}\n',
        "Classic N+1: you fetch all matching docs, then fire one `findFirst` per result to enrich the author. With 50 docs in a result page that's 51 round trips. Two fixes: (1) join in the original query — Drizzle: `with: { author: true }`; or (2) batch the author lookups with `inArray(users.id, authorIds)` and stitch in JS. The `ilike` with leading-wildcard is also non-indexable — if `documents.title` is large, add a `gin` index with `pg_trgm` and use `%>` (similarity) for true full-text-style matching.",
    ))

    # Awaiting-reply session (last message is assistant, very recent)
    s = Session("nextjs-app", "Should we keep the legacy /api/v1 routes?", TODAY - timedelta(hours=3))
    s.user("We have an /api/v1 namespace nobody documented. Should I just delete it or is there usage I can't see?")
    s.assistant(
        "Before deleting, check three things: (1) `grep -r '/api/v1' .` for internal callers; (2) nginx/Vercel logs for the last 30 days — anything non-zero means an external integration is calling it; (3) if you have a feature flag or analytics tag for legacy routes, look at hits there. If it's truly cold, I'd 410 Gone for two weeks before deleting — that surfaces forgotten callers without breaking them silently. Want me to start with the grep?",
    )
    sessions.append(s)

    # --- data-pipeline ---
    sessions.append(s_read_explain(
        "data-pipeline",
        TODAY - timedelta(days=26, hours=3),
        "ETL job OOMing in staging",
        "Our nightly ETL is OOMing on the staging cluster — 8GB. Local runs fine on the same shard. What gives?",
        "/Users/alex/code/data-pipeline/pipeline/etl.py",
        "import pandas as pd\n\ndef run_daily(date: str) -> None:\n    raw = pd.read_parquet(f's3://events/raw/{date}/')\n    enriched = raw.merge(pd.read_parquet('s3://dim/users/'), on='user_id', how='left')\n    enriched = enriched.merge(pd.read_parquet('s3://dim/products/'), on='product_id', how='left')\n    enriched['revenue_usd'] = enriched['amount'] * enriched['fx_rate']\n    enriched.to_parquet(f's3://events/enriched/{date}/', partition_cols=['country'])\n",
        "Two amplifiers: (1) `pd.read_parquet` on an S3 prefix without `columns=` materializes every column for every row group; (2) the chained `merge` builds the intermediate cartesian-ish wide frame in memory before you write. Locally the shard fits; staging happens to land on the day with the big product table. Switch to pyarrow streaming via `pyarrow.dataset.dataset(...)` with `.to_batches()`, push the merges down by joining on the dimension first, and write each batch out. If you can tolerate it, swap the whole thing to DuckDB — `SELECT * FROM read_parquet(...) JOIN read_parquet(...)` will streamspill to disk automatically.",
        thinking="Pandas + merge on S3 prefixes is the usual suspect. They almost never hit the prod ceiling with select_columns missing.",
        model="opus",
    ))

    sessions.append(s_bash_then_explain(
        "data-pipeline",
        TODAY - timedelta(days=22, hours=5),
        "DuckDB 50x faster than pandas — why?",
        "I ran the same group-by-and-aggregate in DuckDB and pandas. DuckDB: 2s. Pandas: 110s. Same data, same machine. Where's that gap coming from?",
        "duckdb /tmp/bench.duckdb -c 'EXPLAIN ANALYZE SELECT country, sum(revenue) FROM events GROUP BY country;'",
        "┌────────────────────────────────────────────────────────────┐\n│┌──────────────────────────────────────────────────────────┐│\n││            Total Time: 1.84s                              ││\n│└──────────────────────────────────────────────────────────┘│\n├──────────────────────────────────────────────────────────────┤\n│  HASH_GROUP_BY  (parallel, 8 threads, vectorized)             │\n│    Cardinality: 217                                           │\n│    Aggregates: sum(#0)                                        │\n│  SEQ_SCAN events                                              │\n│    Cardinality: 84,000,000                                    │\n│    Projection: country, revenue                                │\n└──────────────────────────────────────────────────────────────┘",
        "Three reasons for the gap: (1) DuckDB is vectorized — it processes batches of ~2048 values at a time so the inner loop stays in cache and the CPU's branch predictor stays happy; pandas runs object/numpy dispatch per chunk and pays Python overhead on every group key. (2) Parallelism — that EXPLAIN says 8 threads; pandas group-by is single-threaded unless you use `pandas.groupby(..., observed=True)` with categorical dtypes, and even then the parallel gains are modest. (3) Projection pushdown — DuckDB reads only `country` and `revenue` from the parquet; if your pandas code does `pd.read_parquet(file).groupby(...)` it pulls every column. For aggregation over large columnar data, DuckDB or Polars are roughly always going to beat pandas by an order of magnitude.",
    ))

    sessions.append(s_read_edit(
        "data-pipeline",
        TODAY - timedelta(days=17, hours=7),
        "Add backfill mode to daily aggregator",
        "Add a backfill mode to the daily aggregator — caller passes start_date + end_date and we loop. Idempotent reruns required.",
        "/Users/alex/code/data-pipeline/pipeline/aggregator.py",
        'from datetime import date, timedelta\nimport duckdb\n\ndef aggregate_day(day: date) -> None:\n    con = duckdb.connect("warehouse.duckdb")\n    con.execute("""\n        INSERT INTO daily_metrics\n        SELECT ?, country, sum(revenue) FROM events\n        WHERE event_date = ? GROUP BY country\n    """, [day, day])\n',
        'def aggregate_day(day: date) -> None:\n    con = duckdb.connect("warehouse.duckdb")\n    con.execute("""\n        INSERT INTO daily_metrics\n        SELECT ?, country, sum(revenue) FROM events\n        WHERE event_date = ? GROUP BY country\n    """, [day, day])',
        'def aggregate_day(day: date) -> None:\n    con = duckdb.connect("warehouse.duckdb")\n    con.execute("DELETE FROM daily_metrics WHERE day = ?", [day])\n    con.execute("""\n        INSERT INTO daily_metrics\n        SELECT ?, country, sum(revenue) FROM events\n        WHERE event_date = ? GROUP BY country\n    """, [day, day])\n\n\ndef aggregate_range(start: date, end: date) -> None:\n    cur = start\n    while cur <= end:\n        aggregate_day(cur)\n        cur += timedelta(days=1)',
        "Added a `DELETE FROM daily_metrics WHERE day = ?` before each insert so reruns are idempotent — the previous code would double-count if you ran twice. `aggregate_range` is a thin loop; if you need to parallelize, wrap it in `concurrent.futures.ThreadPoolExecutor` but cap concurrency to 1 per DuckDB file (the connection isn't safe across threads for writes).",
    ))

    sessions.append(s_quick_qa(
        "data-pipeline",
        TODAY - timedelta(days=12, hours=3),
        "pyarrow vs polars for streaming",
        "For a streaming ETL that needs to spill to disk, pyarrow.dataset or Polars lazy frames?",
        "Polars lazy. Pyarrow.dataset is great for the scan layer but its compute is more limited; you end up dropping back to numpy for non-trivial transforms. Polars's lazy engine pushes predicates and projections down into the parquet scan, parallelizes across row groups, and spills to disk if the working set exceeds memory. The only reason I'd still reach for pyarrow.dataset alone is if you need fine-grained row-group filtering and a downstream system (DuckDB, Arrow Flight) is doing the heavy lifting.",
        model="haiku",
    ))

    sessions.append(s_read_explain(
        "data-pipeline",
        TODAY - timedelta(days=8, hours=2),
        "dbt incremental model broken on backfill",
        "My dbt incremental model on the events table is silently dropping rows during a backfill. is_incremental() returns true so the where clause runs but I'm losing data.",
        "/Users/alex/code/data-pipeline/dbt/models/events_daily.sql",
        "{{ config(materialized='incremental', unique_key='event_id') }}\n\nSELECT\n  event_id,\n  event_date,\n  user_id,\n  revenue\nFROM {{ source('raw', 'events') }}\n\n{% if is_incremental() %}\nWHERE event_date > (SELECT max(event_date) FROM {{ this }})\n{% endif %}\n",
        "Backfills don't play well with `event_date > max(event_date)` — once you've inserted today's data, a backfill of yesterday's data is filtered out because `max(event_date)` is now today. Two clean fixes: (1) replace `>` with a sliding window — `WHERE event_date >= dateadd(day, -3, current_date)` if you only ever backfill within 3 days; or (2) switch the model to `incremental_strategy='merge'` (with `unique_key='event_id'` which you already have) and drop the `is_incremental` predicate entirely — let dbt's merge handle dedupe by key. Option 2 is more expensive but bulletproof.",
        model="opus",
    ))

    sessions.append(s_quick_qa(
        "data-pipeline",
        TODAY - timedelta(days=5, hours=1),
        "Why is parquet smaller than I expect?",
        "I wrote a 10M-row dataframe to parquet and got a 12MB file. Is that right? Csv would be ~3GB.",
        "Yes, that's normal and expected. Parquet stores columnar data with per-column dictionary encoding, RLE for runs of identical values, and either snappy or zstd compression on top. If your data has any structure (repeated categories, monotonic timestamps, integer ranges with small dictionaries) the compression ratio can hit 100-300×. A sanity check: run `pyarrow.parquet.ParquetFile(path).schema_arrow` and `.metadata` — you'll see per-column compressed and uncompressed sizes broken out by row group.",
    ))

    # --- infra ---
    sessions.append(s_read_explain(
        "infra",
        TODAY - timedelta(days=25, hours=4),
        "RDS migration failing in CI",
        "My terraform RDS migration is failing in CI — `aws_db_instance.main` keeps wanting to be replaced even though I haven't touched it.",
        "/Users/alex/code/infra/terraform/rds.tf",
        'resource "aws_db_instance" "main" {\n  identifier             = "prod-db"\n  engine                 = "postgres"\n  engine_version         = "16.2"\n  instance_class         = "db.t4g.medium"\n  allocated_storage      = 100\n  storage_encrypted      = true\n  db_subnet_group_name   = aws_db_subnet_group.main.name\n  vpc_security_group_ids = [aws_security_group.rds.id]\n  manage_master_user_password = true\n  skip_final_snapshot    = false\n  apply_immediately      = false\n\n  tags = local.common_tags\n}\n',
        "Two likely culprits. First, AWS occasionally rev's RDS `engine_version` patch numbers (16.2 → 16.3) and the provider sees that as a diff if your code pins 16.2 — pin to `16` and use `allow_major_version_upgrade = false` plus `auto_minor_version_upgrade = true` so Terraform stops fighting the platform. Second, `manage_master_user_password = true` means the Secrets Manager secret rotation can mutate the `master_user_secret` block, which the provider treats as drift. Add a `lifecycle { ignore_changes = [engine_version, master_user_secret] }` and the noise goes away.",
        thinking="Almost always either pinned patch versions or managed-secret rotation diffs. Pure replace usually means identifier changed or kms_key_id changed.",
        model="opus",
    ))

    sessions.append(s_bash_then_explain(
        "infra",
        TODAY - timedelta(days=21, hours=2),
        "ECS service deploying with 0 healthy targets",
        "Prod ECS service is rolling out tasks but the target group shows 0 healthy. Tasks themselves look fine in the ECS console.",
        "aws elbv2 describe-target-health --target-group-arn arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/prod-api/abcd",
        '{\n  "TargetHealthDescriptions": [\n    {\n      "Target": {"Id": "10.0.12.34", "Port": 8080},\n      "TargetHealth": {\n        "State": "unhealthy",\n        "Reason": "Target.FailedHealthChecks",\n        "Description": "Health checks failed with these codes: [301]"\n      }\n    }\n  ]\n}\n',
        "The target group is getting a `301 Moved Permanently` from your service. Your app is probably redirecting `http://` to `https://` (e.g. via Helmet or your framework's force-ssl middleware), and the ALB → task health check is hitting `http://`. Two fixes: (1) configure the target group health check matcher to accept `200-399` instead of just `200`; or (2) exempt `/health` from the HTTPS redirect in the app — usually cleaner. Confirm with `curl -I http://10.0.12.34:8080/health` from a bastion in the same VPC.",
    ))

    sessions.append(s_read_edit(
        "infra",
        TODAY - timedelta(days=15, hours=6),
        "Cost spike on NAT gateway",
        "NAT gateway data processing fees jumped 4× last week. Find the culprit before we get yelled at.",
        "/Users/alex/code/infra/terraform/vpc.tf",
        'resource "aws_vpc_endpoint" "s3" {\n  vpc_id            = aws_vpc.main.id\n  service_name      = "com.amazonaws.${var.region}.s3"\n  vpc_endpoint_type = "Gateway"\n  route_table_ids   = aws_route_table.private[*].id\n}\n\n# TODO: add ECR endpoint',
        '# TODO: add ECR endpoint',
        'resource "aws_vpc_endpoint" "ecr_api" {\n  vpc_id              = aws_vpc.main.id\n  service_name        = "com.amazonaws.${var.region}.ecr.api"\n  vpc_endpoint_type   = "Interface"\n  subnet_ids          = aws_subnet.private[*].id\n  private_dns_enabled = true\n  security_group_ids  = [aws_security_group.vpc_endpoints.id]\n}\n\nresource "aws_vpc_endpoint" "ecr_dkr" {\n  vpc_id              = aws_vpc.main.id\n  service_name        = "com.amazonaws.${var.region}.ecr.dkr"\n  vpc_endpoint_type   = "Interface"\n  subnet_ids          = aws_subnet.private[*].id\n  private_dns_enabled = true\n  security_group_ids  = [aws_security_group.vpc_endpoints.id]\n}\n\nresource "aws_vpc_endpoint" "logs" {\n  vpc_id              = aws_vpc.main.id\n  service_name        = "com.amazonaws.${var.region}.logs"\n  vpc_endpoint_type   = "Interface"\n  subnet_ids          = aws_subnet.private[*].id\n  private_dns_enabled = true\n  security_group_ids  = [aws_security_group.vpc_endpoints.id]\n}',
        "Found it: your ECS tasks pull from ECR through the NAT gateway because there's no ECR interface endpoint. Same for CloudWatch Logs. I added `ecr.api`, `ecr.dkr`, and `logs` interface endpoints. Expect NAT processing fees to drop by ~80%. Note interface endpoints have a flat hourly + per-GB charge (cheaper than NAT for ECR pulls); double-check that the math wins for your traffic profile — at small scale a single NAT can still be cheaper.",
        thinking="Almost always ECR image pulls or CloudWatch Logs traversing NAT. The fix is adding interface endpoints.",
    ))

    sessions.append(s_quick_qa(
        "infra",
        TODAY - timedelta(days=11, hours=3),
        "OIDC vs static AWS creds in GitHub Actions",
        "Is it really worth setting up OIDC for AWS in our GH Actions workflows, or are static creds fine for an internal repo?",
        "Worth it. Three reasons: (1) static keys live in GitHub Secrets indefinitely — anyone with repo admin can exfiltrate them, and you can't easily detect misuse. OIDC tokens are minted per-job, scoped to a specific role, and expire in an hour. (2) The trust policy ties the role to `repo:owner/repo:ref:refs/heads/main` — a fork or feature branch can't assume the role. (3) Auditing: CloudTrail shows `aws-actions/configure-aws-credentials` per run with the workflow context, which is much better than a long-lived IAM user that shows up in every audit. The setup is ~30 minutes and a one-time cost; the operational savings compound forever.",
        model="haiku",
    ))

    # Big "epic" session: huge refactor with sidechain
    epic_turns = [
        {"kind": "user", "text": "I want to rip out the old aws-cli-based deploy script and replace it with a Terraform-driven setup using CodeDeploy + ECS. Walk me through it.", "sec": 60},
        {"kind": "assistant", "thinking": "Big refactor — they need an end-to-end view, not just code. I'll outline the steps, list what changes, and then start touching files. Worth being explicit that this is a multi-PR change.", "text": "Here's the plan. (1) Introduce a CodeDeploy application + deployment group as Terraform resources. (2) Switch the ECS service to `deployment_controller { type = \"CODE_DEPLOY\" }`. (3) Replace `scripts/deploy.sh` with a GitHub Action that pushes the image and registers a new task definition; CodeDeploy handles the rollout. (4) Add an appspec.yaml + lifecycle hook Lambdas (optional, can skip initially). I'll start with the Terraform changes and we can iterate. Heads up — this is going to be a 3-PR refactor minimum.", "sec": 18},
        {"kind": "tool", "tool": "Read", "input": {"file_path": "/Users/alex/code/infra/terraform/ecs.tf"}, "intro": "Reading current ECS config first.", "result": 'resource "aws_ecs_service" "api" {\n  name            = "prod-api"\n  cluster         = aws_ecs_cluster.main.id\n  task_definition = aws_ecs_task_definition.api.arn\n  desired_count   = 4\n  launch_type     = "FARGATE"\n  network_configuration {\n    subnets = aws_subnet.private[*].id\n  }\n  load_balancer {\n    target_group_arn = aws_lb_target_group.api_blue.arn\n    container_name   = "api"\n    container_port   = 8080\n  }\n}'},
        {"kind": "tool", "tool": "Read", "input": {"file_path": "/Users/alex/code/infra/scripts/deploy.sh"}, "intro": "And the current deploy script.", "result": '#!/bin/bash\nset -euo pipefail\n\nIMAGE_TAG=${1:?image tag required}\n\naws ecs register-task-definition --cli-input-json file://task-def.json\naws ecs update-service --cluster prod --service prod-api --force-new-deployment\naws ecs wait services-stable --cluster prod --services prod-api\n'},
        {"kind": "assistant", "thinking": "The current service uses a single target group — for blue/green I need two and a listener.", "text": "Two things stand out: (1) you only have one target group (`api_blue`) — CodeDeploy needs blue+green target groups it can swap behind the listener. (2) The deploy script does `--force-new-deployment` which is the old rolling-update style; CodeDeploy will replace that. Let me wire it up.", "sec": 14},
        {"kind": "tool", "tool": "Write", "input": {"file_path": "/Users/alex/code/infra/terraform/codedeploy.tf"}, "intro": "Adding the CodeDeploy app + deployment group.", "result": "Created file /Users/alex/code/infra/terraform/codedeploy.tf"},
        {"kind": "tool", "tool": "Edit", "input": {"file_path": "/Users/alex/code/infra/terraform/ecs.tf", "old_string": "  desired_count   = 4\n  launch_type     = \"FARGATE\"", "new_string": "  desired_count   = 4\n  launch_type     = \"FARGATE\"\n  deployment_controller { type = \"CODE_DEPLOY\" }"}, "intro": "Switching the service to CodeDeploy control.", "result": "The file /Users/alex/code/infra/terraform/ecs.tf has been updated."},
        {"kind": "tool", "tool": "Write", "input": {"file_path": "/Users/alex/code/infra/terraform/alb.tf"}, "intro": "Adding the green target group + listener rule.", "result": "Created file /Users/alex/code/infra/terraform/alb.tf"},
        {"kind": "user", "text": "Before we touch the GitHub Action — what's the IAM blast radius for the CodeDeploy service role?", "sec": 50},
        {"kind": "assistant", "thinking": "Good instinct. The AWS managed policy is broad — I should call that out and offer a scoped alternative.", "text": "The AWS-managed policy `AWSCodeDeployRoleForECS` is broad: it grants ECS pass-role, ELB target-group rewrites, and CodeDeploy lifecycle hook invocation across any role/target group in the account. For prod I'd scope a custom policy to the specific cluster ARN, both target group ARNs, and the specific task-execution role. Want me to write that out?", "sec": 11},
        {"kind": "user", "text": "Yes. And also — I want to run a sub-agent to grep for any other place we call `aws ecs update-service` because I have a bad feeling there are other scripts.", "sec": 35},
    ]
    epic_session = s_epic_refactor("infra", TODAY - timedelta(days=7, hours=4), "Refactor: aws-cli deploy → CodeDeploy blue/green", epic_turns)
    epic_session.agent_sidechain(
        prompt="Grep the infra repo for any shell script, CI workflow, or Python helper that calls 'aws ecs update-service'. Return the file paths and the lines.",
        reply="Found 3 callers:\n- scripts/deploy.sh:7 — primary deploy script (the one being replaced)\n- scripts/rollback.sh:12 — calls update-service with --task-definition <previous-arn>\n- .github/workflows/hotfix.yml:34 — hotfix path bypasses CodeDeploy by design\n\nThe rollback script will need to be rewritten for CodeDeploy (use create-deployment with a previous revision). The hotfix workflow is intentional — leave it.",
    )
    epic_session.assistant("Sub-agent found three callers. The rollback script needs a rewrite (CodeDeploy uses `create-deployment` with a revision id, not `update-service`); the hotfix workflow is intentionally untouched. I'll open a follow-up PR for the rollback path so this PR stays scoped. Anything else you want me to fold in here?")
    sessions.append(epic_session)

    sessions.append(s_quick_qa(
        "infra",
        TODAY - timedelta(days=4, hours=2),
        "Rotate Slack webhook secret",
        "What's the cleanest way to rotate the Slack webhook URL stored in Vault — I don't want to bounce anything that's currently using it.",
        "Use Vault's KV-v2 versioning: write the new URL as the next version of the same secret path, then update the consumers to read the latest version (they're already pinned to `latest` if you didn't override). For services that cache the secret in process memory (most of them), trigger a SIGHUP / restart on a rolling basis — `kubectl rollout restart` if you're on k8s, ECS service redeploy otherwise. Vault keeps the previous version available so anything still holding the old URL keeps working until the slow restart catches up. Audit log will show the version-change event.",
        model="haiku",
    ))

    # awaiting-reply, recent
    s = Session("infra", "Cost: should we move staging to spot?", TODAY - timedelta(hours=5))
    s.user("Staging is costing us $1.8k/mo on on-demand ECS Fargate. Worth moving to Fargate Spot?")
    s.assistant(
        "Probably yes, with one caveat. Fargate Spot is ~70% off on-demand and interruptions are rare in staging-friendly capacity pools — but you do get 2-minute drain notices, so any test run longer than that needs to be re-runnable. If your CI builds the image and your staging deploys are short-lived, you'll save ~$1200/mo with essentially no friction. The risk is long-running staging soak tests being interrupted mid-run; if you have any, route them to a small on-demand sub-cluster. Want me to draft the Terraform change?",
    )
    sessions.append(s)

    # --- dotfiles ---
    sessions.append(s_read_edit(
        "dotfiles",
        TODAY - timedelta(days=23, hours=8),
        "Make zsh prompt show conda env",
        "I want my zsh prompt to show `(env-name)` on the left when a conda env is active, in dim grey, before the directory.",
        "/Users/alex/dotfiles/zsh/.zshrc",
        '# prompt\nsetopt PROMPT_SUBST\nPROMPT="%F{cyan}%~%f %F{green}❯%f "\n',
        '# prompt\nsetopt PROMPT_SUBST\nPROMPT="%F{cyan}%~%f %F{green}❯%f "',
        '# prompt\nsetopt PROMPT_SUBST\n\nconda_prompt() {\n  [[ -n "$CONDA_DEFAULT_ENV" ]] && print -n "%F{240}(${CONDA_DEFAULT_ENV})%f "\n}\n\nPROMPT=\'$(conda_prompt)%F{cyan}%~%f %F{green}❯%f \'',
        "Switched the PROMPT to single-quoted so the function is evaluated on each redraw. `%F{240}` is the 256-color grey you wanted. Note: if you ever switch from conda to mamba, the env var is the same, so this keeps working.",
    ))

    sessions.append(s_bash_then_explain(
        "dotfiles",
        TODAY - timedelta(days=19, hours=2),
        "zsh-autosuggestions slow in tmux",
        "zsh-autosuggestions feels noticeably laggy inside tmux but fine outside it. Why does the multiplexer change anything?",
        "echo $TERM && tmux display-message -p '#{client-termfeatures}'",
        "screen-256color\n*256\\:RGB",
        "Two things conspire: (1) `screen-256color` doesn't advertise the BCE (background-color-erase) capability, so the plugin's redraw path can't optimize partial line clears and ends up rewriting the whole prompt. (2) tmux's input event loop adds a small RTT to every keystroke when the suggestion redraw triggers. Fixes: set `TERM=tmux-256color` (you'll need `infocmp tmux-256color` to confirm it's available on your system) and add `set -as terminal-features ',xterm*:RGB'` in your tmux.conf. Plugin lag drops below the perceptible threshold for me.",
    ))

    sessions.append(s_quick_qa(
        "dotfiles",
        TODAY - timedelta(days=13, hours=4),
        "Lazygit keybinding in nvim",
        "Map `<leader>gg` to open lazygit in a floating terminal in neovim. I'm using lazy.nvim.",
        "Add this to your plugin spec:\n\n```lua\n{\n  \"kdheepak/lazygit.nvim\",\n  cmd = \"LazyGit\",\n  keys = { { \"<leader>gg\", \"<cmd>LazyGit<cr>\", desc = \"LazyGit\" } },\n  dependencies = { \"nvim-lua/plenary.nvim\" },\n}\n```\n\nNo extra config needed; the plugin's defaults already open a floating terminal sized to the editor. If you'd rather use neovim's built-in terminal without the plugin: `vim.keymap.set('n', '<leader>gg', function() vim.cmd('terminal lazygit') end)` works too, but you lose the floating UI.",
        model="haiku",
    ))

    sessions.append(s_grep_then_edit(
        "dotfiles",
        TODAY - timedelta(days=6, hours=20),
        "Sync 1Password session across tmux panes",
        "When I `op signin` in one tmux pane the others don't see the session. Want a one-line helper that broadcasts the session env var.",
        "OP_SESSION",
        "zsh/functions/op-helpers.zsh\nzsh/.zshrc",
        "/Users/alex/dotfiles/zsh/functions/op-helpers.zsh",
        '# 1Password helpers\nop-signin() {\n  eval "$(op signin)"\n}\n',
        '# 1Password helpers\nop-signin() {\n  eval "$(op signin)"\n}',
        '# 1Password helpers\nop-signin() {\n  eval "$(op signin)"\n  # Broadcast to other tmux panes\n  if [[ -n "$TMUX" ]]; then\n    local var\n    for var in ${(k)parameters[(I)OP_SESSION_*]}; do\n      tmux setenv -g "$var" "${(P)var}"\n    done\n    print "broadcast $var to tmux global env"\n  fi\n}\n\nop-sync() {\n  # Pull OP_SESSION_* from tmux global env into the current shell\n  [[ -z "$TMUX" ]] && { print "not in tmux"; return 1 }\n  while read -r line; do\n    [[ "$line" == OP_SESSION_* ]] && eval "export $line"\n  done < <(tmux show-environment -g | grep "^OP_SESSION_")\n}',
        "Two functions: `op-signin` now broadcasts every `OP_SESSION_*` var into tmux's global env after a successful signin. In any other pane, run `op-sync` and your session is pulled in. Note: tmux's global env is process-local to the tmux server — if you have multiple tmux servers, this still won't bridge them; for that you'd need a shared file under a known path.",
    ))

    sessions.append(s_quick_qa(
        "dotfiles",
        TODAY - timedelta(hours=10),
        "Why does my zsh start so slow?",
        "My zsh takes ~2 seconds to open a new shell. Where do I even start looking?",
        "Profile it. Add `zmodload zsh/zprof` as the very first line of `.zshrc` and `zprof` as the very last line. Open a new shell — you'll get a sorted table of where time was spent. Common culprits in order of frequency: (1) NVM's `nvm.sh` (lazy-load it); (2) compinit running without `-C` (cache the completions: `compinit -C`); (3) p10k / starship doing synchronous git status in a deep repo (use the async variants); (4) `conda init` shell hook running on every shell instead of activated on demand. Fix one at a time and recheck — usually one offender accounts for >60% of the time.",
        model="haiku",
    ))

    return sessions


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------


def main() -> None:
    if OUT_ROOT.exists():
        shutil.rmtree(OUT_ROOT)
    OUT_ROOT.mkdir(parents=True, exist_ok=True)

    sessions = build_sessions()
    for s in sessions:
        s.write()

    by_proj: dict[str, int] = {}
    for s in sessions:
        by_proj[s.project_key] = by_proj.get(s.project_key, 0) + 1

    print(f"Wrote {len(sessions)} sessions to {OUT_ROOT}")
    for k, v in sorted(by_proj.items()):
        print(f"  {k}: {v}")


if __name__ == "__main__":
    main()
