/**
 * Typed API client — all fetch calls go through here.
 * Base URL is always relative (same origin), so no env config needed.
 */

import type {
  AppConfig,
  DailyBucket,
  FileTouchEntry,
  ModelUsageEntry,
  PricingTableResponse,
  Project,
  PromptCostEntry,
  PromptStatsResponse,
  SearchHit,
  Session,
  SessionCostResponse,
  SessionDetail,
  StatsResponse,
  TipEntry,
  TokenBreakdown,
  ToolUsageEntry,
} from "./types";

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

async function post<T>(path: string): Promise<T> {
  const res = await fetch(path, { method: "POST" });
  if (!res.ok) throw new Error(`POST ${path} → ${res.status}`);
  return res.json() as Promise<T>;
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
  getConfig: () => get<AppConfig>("/api/config"),
  updateConfig: (config: AppConfig) => put<AppConfig>("/api/config", config),
  refresh: () => post<{ ok: boolean }>("/api/refresh"),
  revealSession: (sessionId: string) =>
    post<{ ok: boolean }>(`/api/sessions/${encodeURIComponent(sessionId)}/reveal`),
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
};

/** SSE event source — call onRefresh when a JSONL file changes. */
export function createEventSource(onRefresh: () => void): EventSource {
  const es = new EventSource("/api/events");
  es.addEventListener("message", (e) => {
    try {
      const data = JSON.parse(e.data) as { type: string };
      if (data.type === "refresh") onRefresh();
    } catch {
      // ignore malformed events
    }
  });
  return es;
}
