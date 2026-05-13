export const LS = {
  STARRED: "clau-decode:starred",
  RENAMED: "clau-decode:renamed",
  ARCHIVED: "clau-decode:archived",
  VIEWED_AT: "clau-decode:viewed-at",
  FILE_VIEWER_WIDTH: "clau-decode:file-viewer-width",
  SESSION_LAST_ACTIVE_PREFIX: "clau-decode:session-last-active:",
  READ_SESSIONS_LEGACY: "clau-decode:read-sessions",
} as const;

export function lsGetSet(key: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(key) ?? "[]")); }
  catch { return new Set(); }
}

export function lsPutSet(key: string, s: Set<string>): void {
  localStorage.setItem(key, JSON.stringify([...s]));
}

export function lsGetMap(key: string): Record<string, string> {
  try { return JSON.parse(localStorage.getItem(key) ?? "{}"); }
  catch { return {}; }
}

export function lsPutMap(key: string, m: Record<string, string>): void {
  localStorage.setItem(key, JSON.stringify(m));
}

export function lsGetRaw(key: string): string | null {
  return localStorage.getItem(key);
}

export function lsSetRaw(key: string, value: string): void {
  localStorage.setItem(key, value);
}
