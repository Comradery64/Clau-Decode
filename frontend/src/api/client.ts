/**
 * Typed API client — all fetch calls go through here.
 * Base URL is always relative (same origin), so no env config needed.
 */

import type {
  AppConfig,
  ContentBlock,
  DailyBucket,
  DashboardData,
  DirListing,
  ExportFormat,
  FileContent,
  HostInfo,
  FileTouchEntry,
  ModelUsageEntry,
  MutationResult,
  PermissionMode,
  PricingTableResponse,
  ProfilesResponse,
  Profile,
  Project,
  PromptCostEntry,
  PromptStatsResponse,
  Recap,
  RunnerStatus,
  SearchHit,
  Session,
  SessionCostResponse,
  SessionDetail,
  StatsResponse,
  TipEntry,
  TokenBreakdown,
  ToolUsageEntry,
} from "./types";

// In-memory cache for AppConfig — shared between App's boot-time theme
// fetch and SettingsModal's first open so Settings paints instantly. Kept
// fresh by updateConfig and getConfigCached below.
let _cachedConfig: AppConfig | null = null;
let _configInflight: Promise<AppConfig> | null = null;

export function getCachedConfig(): AppConfig | null {
  return _cachedConfig;
}

export function getConfigCached(): Promise<AppConfig> {
  if (_configInflight) return _configInflight;
  _configInflight = fetch("/api/config")
    .then((r) => {
      if (!r.ok) throw new Error(`GET /api/config → ${r.status}`);
      return r.json() as Promise<AppConfig>;
    })
    .then((cfg) => { _cachedConfig = cfg; return cfg; })
    .finally(() => { _configInflight = null; });
  return _configInflight;
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path);
  if (!res.ok) throw new Error(`GET ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function put<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

async function post<T>(path: string, body?: unknown): Promise<T> {
  const opts: RequestInit = { method: "POST" };
  if (body !== undefined) {
    opts.headers = { "Content-Type": "application/json" };
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

function del<T>(path: string): Promise<T> {
  return fetch(path, { method: "DELETE" }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json() as Promise<T>;
  });
}

function patch<T>(path: string, body: unknown): Promise<T> {
  return fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }).then((r) => {
    if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
    return r.json() as Promise<T>;
  });
}

export const api = {
  getProjects: () => get<Project[]>("/api/projects"),
  getProjectSessions: (projectId: string) =>
    get<Session[]>(`/api/projects/${encodeURIComponent(projectId)}/sessions`),
  getAllSessions: () => get<Session[]>("/api/sessions"),
  getSession: (sessionId: string) =>
    get<SessionDetail>(`/api/sessions/${encodeURIComponent(sessionId)}`),
  search: (q: string, projectId?: string, limit = 50) => {
    const params = new URLSearchParams({ q, limit: String(limit) });
    if (projectId) params.set("project", projectId);
    return get<SearchHit[]>(`/api/search?${params}`);
  },
  getStats: () => get<StatsResponse>("/api/stats"),
  getDashboard: () => get<DashboardData>("/api/dashboard"),
  getHostInfo: () => get<HostInfo>("/api/host-info"),
  getConfig: () => get<AppConfig>("/api/config"),
  updateConfig: (config: AppConfig) => {
    _cachedConfig = config;
    return put<AppConfig>("/api/config", config);
  },
  refresh: () => post<{ ok: boolean }>("/api/refresh"),
  revealSession: (sessionId: string) =>
    post<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(sessionId)}/reveal`),
  openTerminal: (sessionId: string) =>
    post<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(sessionId)}/open-terminal`),
  getSessionTokens: (sessionId: string) =>
    get<TokenBreakdown>(`/api/analytics/sessions/${encodeURIComponent(sessionId)}/tokens`),
  getSessionPrompts: (sessionId: string) =>
    get<PromptCostEntry[]>(`/api/analytics/sessions/${encodeURIComponent(sessionId)}/prompts`),
  getDailyAnalytics: () => get<DailyBucket[]>("/api/analytics/daily"),
  getSessionCost: (sessionId: string) =>
    get<SessionCostResponse>(
      `/api/analytics/sessions/${encodeURIComponent(sessionId)}/cost`
    ),
  getPricingTable: () => get<PricingTableResponse>("/api/pricing"),
  getPromptStats: (): Promise<PromptStatsResponse> =>
    get("/api/analytics/stats"),
  getModelUsage: (): Promise<ModelUsageEntry[]> =>
    get("/api/analytics/models"),
  getToolUsage: (): Promise<ToolUsageEntry[]> =>
    get("/api/analytics/tools"),
  getFileTouches: (): Promise<FileTouchEntry[]> =>
    get("/api/analytics/files"),
  getTips: (): Promise<TipEntry[]> =>
    get("/api/analytics/tips"),
  deleteMessage: (messageId: string): Promise<MutationResult> =>
    del(`/api/messages/${messageId}`),
  patchMessage: (messageId: string, content_blocks: ContentBlock[]): Promise<MutationResult> =>
    patch(`/api/messages/${messageId}`, { content_blocks }),

  // Profiles
  getProfiles: () => get<ProfilesResponse>("/api/profiles"),
  createProfile: (name: string, data_paths?: string[], color?: string) =>
    post<Profile>("/api/profiles", { name, data_paths: data_paths || ["~/.claude"], color: color || "#b8956a" }),
  updateProfile: (id: string, updates: Partial<Pick<Profile, "name" | "data_paths" | "color">>) =>
    put<Profile>(`/api/profiles/${encodeURIComponent(id)}`, updates),
  deleteProfile: (id: string) =>
    del<MutationResult>(`/api/profiles/${encodeURIComponent(id)}`),
  setActiveProfile: (active_profile_id: string | null) =>
    put<{ active_profile_id: string | null }>("/api/profiles/active", { active_profile_id }),

  // File system browser
  listDir: (path: string, showHidden = false) => {
    const params = new URLSearchParams({ path });
    if (showHidden) params.set("show_hidden", "true");
    return get<DirListing>(`/api/fs/list?${params}`);
  },
  readFile: (path: string) =>
    get<FileContent>(`/api/fs/read?${new URLSearchParams({ path })}`),
  writeFile: (path: string, content: string) =>
    put<{ ok: boolean; path: string; size: number }>("/api/fs/write", { path, content }),

  // Export (Phase 7)
  exportSession: (sessionId: string, format: ExportFormat) =>
    fetch(
      `/api/sessions/${encodeURIComponent(sessionId)}/export?format=${format}`
    ).then((r) => {
      if (!r.ok) throw new Error(`Export failed: ${r.status}`);
      const disposition = r.headers.get("content-disposition") || "";
      const match = disposition.match(/filename="([^"]+)"/);
      const filename = match ? match[1] : `session.${format}`;
      return r.blob().then((blob) => ({ blob, filename }));
    }),

  // Claude Code runner — send/stop/status (Phase 9 Rev 2)
  sendMessage: (sessionId: string, message: string, permissionMode?: PermissionMode) =>
    post<{
      ok: boolean;
      permission_mode: PermissionMode;
      // Present only for slash commands. Synchronous response text (e.g.
      // "/foo isn't available in this environment.") that isn't written to
      // the JSONL and therefore wouldn't appear via SSE.
      result_text?: string | null;
      is_error?: boolean;
    }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/send-message`,
      { message, permission_mode: permissionMode },
    ),
  stopMessage: (sessionId: string) =>
    post<{ ok: boolean; stopped: boolean }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/stop`,
      {},
    ),
  getRunnerStatus: (sessionId: string) =>
    get<RunnerStatus>(`/api/sessions/${encodeURIComponent(sessionId)}/runner-status`),

  // Recaps
  generateRecap: (sessionId: string) =>
    post<Recap>(`/api/sessions/${encodeURIComponent(sessionId)}/recap`),
  listRecaps: (sessionId: string, opts?: { includeDismissed?: boolean }) => {
    const params = new URLSearchParams();
    if (opts?.includeDismissed) params.set("include_dismissed", "true");
    const qs = params.toString();
    return get<Recap[]>(
      `/api/sessions/${encodeURIComponent(sessionId)}/recaps${qs ? `?${qs}` : ""}`,
    );
  },
  dismissRecap: (sessionId: string, recapId: number) =>
    post<{ ok: boolean; dismissed: boolean }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/recaps/${recapId}/dismiss`,
    ),

  // Session rename (issue #11). Pass null to clear the override.
  setSessionTitle: (sessionId: string, title: string | null) =>
    put<{ ok: boolean; id: string; custom_title: string | null }>(
      `/api/sessions/${encodeURIComponent(sessionId)}/title`,
      { title },
    ),

  // Mint metadata for a brand-new Claude Code session (issue #9 — "New Task").
  // The backend returns a fresh uuid + cwd + permission_mode but does NOT spawn
  // the CLI. The session materialises on disk only when the user submits their
  // first message via sendMessage; the watcher → SSE pipeline indexes it as
  // soon as the JSONL appears. Caller navigates to /chat/<session_id>.
  newSession: (opts?: { cwd?: string; permission_mode?: PermissionMode }) =>
    post<{ session_id: string; cwd: string; permission_mode: PermissionMode }>(
      "/api/sessions/new",
      opts ?? {},
    ),
};

/** Handlers for the SSE event types we know about (issue #11). */
export interface EventSourceHandlers {
  onRefresh: () => void;
  // Fired when another client renames a session on the server (or our own
  // PUT echoes back). `title` is the server-authoritative custom_title;
  // null means the override was cleared.
  onSessionMeta?: (payload: { id: string; title: string | null }) => void;
}

/** SSE event source — dispatches events by their `type` field. */
export function createEventSource(
  handlersOrRefresh: EventSourceHandlers | (() => void),
): EventSource {
  // Back-compat: callers passing just `onRefresh` still work — preserves the
  // existing App.tsx call site contract and the older test fixtures.
  const handlers: EventSourceHandlers =
    typeof handlersOrRefresh === "function"
      ? { onRefresh: handlersOrRefresh }
      : handlersOrRefresh;

  const es = new EventSource("/api/events");
  es.addEventListener("message", (e) => {
    try {
      const data = JSON.parse(e.data) as { type: string };
      if (data.type === "refresh") {
        handlers.onRefresh();
      } else if (data.type === "session-meta") {
        const meta = data as { type: "session-meta"; id: string; title: string | null };
        handlers.onSessionMeta?.({ id: meta.id, title: meta.title });
      }
    } catch {
      // ignore malformed events
    }
  });
  return es;
}
