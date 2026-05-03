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
