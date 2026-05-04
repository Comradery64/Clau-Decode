import type { SessionDetail } from "./types";

const _cache = new Map<string, SessionDetail>();
const MAX_SIZE = 10;

export function getCached(id: string): SessionDetail | undefined {
  const v = _cache.get(id);
  if (v !== undefined) {
    _cache.delete(id);
    _cache.set(id, v);
  }
  return v;
}

export function setCached(id: string, detail: SessionDetail): void {
  _cache.delete(id);
  _cache.set(id, detail);
  if (_cache.size > MAX_SIZE) {
    _cache.delete(_cache.keys().next().value!);
  }
}

export function invalidateCached(id: string): void {
  _cache.delete(id);
}

export function prefetch(id: string, fetcher: (id: string) => Promise<SessionDetail>): void {
  if (_cache.has(id)) return;
  fetcher(id).then((d) => setCached(id, d)).catch(() => {});
}
