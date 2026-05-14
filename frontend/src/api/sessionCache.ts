import type { SessionDetail } from "./types";

const _cache = new Map<string, SessionDetail>();
const _inflight = new Map<string, Promise<SessionDetail>>();
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
  _inflight.delete(id);
}

/**
 * Fetch a session, deduping concurrent callers. If a request for the same id
 * is already in flight (e.g. from a hover prefetch), return the same promise
 * instead of firing a second one.
 */
export function fetchSession(
  id: string,
  fetcher: (id: string) => Promise<SessionDetail>,
): Promise<SessionDetail> {
  const existing = _inflight.get(id);
  if (existing) return existing;
  const p = fetcher(id)
    .then((d) => { setCached(id, d); return d; })
    .finally(() => { _inflight.delete(id); });
  _inflight.set(id, p);
  return p;
}

export function prefetch(id: string, fetcher: (id: string) => Promise<SessionDetail>): void {
  if (_cache.has(id) || _inflight.has(id)) return;
  fetchSession(id, fetcher).catch(() => {});
}
