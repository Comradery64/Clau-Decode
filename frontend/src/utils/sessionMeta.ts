/**
 * Server-backed session flags — replaces the localStorage-only
 * LS.ARCHIVED / LS.STARRED / LS.VIEWED_AT (2026-05-28 bug fix).
 *
 * Single module-level cache shared across all hook instances:
 *   - One fetch of /api/sessions on first subscribe.
 *   - Mutations PUT to the server and optimistically update the cache.
 *   - SSE ``session-meta`` events keep the cache in sync across tabs +
 *     browsers (the bug the old localStorage approach couldn't solve).
 *
 * Hooks export the same {ids, has, toggle, add, remove} shape as the
 * old useLsSet so the 6 call sites swap in cleanly. The previously-Map
 * VIEWED_AT becomes useViewedAt() with a get/set/clear shape.
 */

import { useSyncExternalStore } from "react";
import { api } from "../api/client";

// ---------------------------------------------------------------------------
// Cache state
// ---------------------------------------------------------------------------

let _archived: Set<string> = new Set();
let _starred: Set<string> = new Set();
let _viewed: Map<string, string> = new Map();

let _bootstrapStatus: "idle" | "in-flight" | "ready" = "idle";
const _listeners = new Set<() => void>();

function _notify(): void {
  for (const cb of _listeners) cb();
}

async function _bootstrap(): Promise<void> {
  if (_bootstrapStatus !== "idle") return;
  _bootstrapStatus = "in-flight";
  try {
    const sessions = await api.getAllSessions();
    const arch = new Set<string>();
    const star = new Set<string>();
    const view = new Map<string, string>();
    for (const s of sessions) {
      if (s.archived_at) arch.add(s.id);
      if (s.starred_at) star.add(s.id);
      if (s.viewed_at) view.set(s.id, s.viewed_at);
    }
    _archived = arch;
    _starred = star;
    _viewed = view;
    _bootstrapStatus = "ready";
    _notify();
  } catch (err) {
    // Stay in idle so the next hook mount retries — don't lock callers
    // out of the cache if the first fetch fails (e.g., during startup).
    _bootstrapStatus = "idle";
    console.warn("sessionMeta bootstrap failed", err);
  }
}

function _subscribe(cb: () => void): () => void {
  _listeners.add(cb);
  // Lazy-bootstrap on first subscribe so the test environment + the
  // initial app render don't both fire a fetch eagerly at module import.
  if (_bootstrapStatus === "idle") void _bootstrap();
  return () => {
    _listeners.delete(cb);
  };
}

// ---------------------------------------------------------------------------
// SSE event handler (wired in App.tsx)
// ---------------------------------------------------------------------------

/**
 * Apply a ``session-meta`` SSE event payload to the shared cache.
 * Payload carries only the fields that changed; missing fields are NOT
 * treated as null (preserves existing state). Idempotent.
 */
export function applySessionMetaEvent(evt: {
  id: string;
  archived_at?: string | null;
  starred_at?: string | null;
  viewed_at?: string | null;
}): void {
  let changed = false;
  if ("archived_at" in evt) {
    const isArch = _archived.has(evt.id);
    if (evt.archived_at == null && isArch) {
      _archived = new Set(_archived);
      _archived.delete(evt.id);
      changed = true;
    } else if (evt.archived_at != null && !isArch) {
      _archived = new Set(_archived);
      _archived.add(evt.id);
      changed = true;
    }
  }
  if ("starred_at" in evt) {
    const isStar = _starred.has(evt.id);
    if (evt.starred_at == null && isStar) {
      _starred = new Set(_starred);
      _starred.delete(evt.id);
      changed = true;
    } else if (evt.starred_at != null && !isStar) {
      _starred = new Set(_starred);
      _starred.add(evt.id);
      changed = true;
    }
  }
  if ("viewed_at" in evt) {
    const current = _viewed.get(evt.id) ?? null;
    if (current !== evt.viewed_at) {
      _viewed = new Map(_viewed);
      if (evt.viewed_at == null) _viewed.delete(evt.id);
      else _viewed.set(evt.id, evt.viewed_at);
      changed = true;
    }
  }
  if (changed) _notify();
}

/** Force a full re-fetch (e.g. after the migration endpoint completes). */
export async function refetchSessionMeta(): Promise<void> {
  _bootstrapStatus = "idle";
  await _bootstrap();
}

// ---------------------------------------------------------------------------
// Hook API — mirrors the old useLsSet shape so callsites change minimally
// ---------------------------------------------------------------------------

export interface MetaSetHandle {
  ids: Set<string>;
  has(id: string): boolean;
  toggle(id: string): void;
  add(id: string): void;
  remove(id: string): void;
}

function _makeFlagHook(
  getCache: () => Set<string>,
  setCache: (next: Set<string>) => void,
  setFlag: (id: string, value: boolean) => Promise<unknown>,
): MetaSetHandle {
  const ids = useSyncExternalStore(_subscribe, getCache, getCache);

  const optimistic = (id: string, willHave: boolean): void => {
    const next = new Set(getCache());
    if (willHave) next.add(id);
    else next.delete(id);
    setCache(next);
    _notify();
  };

  const rollback = (id: string, prevHas: boolean): void => {
    const next = new Set(getCache());
    if (prevHas) next.add(id);
    else next.delete(id);
    setCache(next);
    _notify();
  };

  return {
    ids,
    has: (id: string) => ids.has(id),
    toggle: (id: string) => {
      const prev = getCache().has(id);
      const willHave = !prev;
      optimistic(id, willHave);
      // Fire-and-forget; the SSE echo will reconcile if our payload
      // disagrees with the server. On failure, roll back.
      setFlag(id, willHave).catch((err) => {
        console.warn("sessionMeta toggle failed; rolling back", err);
        rollback(id, prev);
      });
    },
    add: (id: string) => {
      if (getCache().has(id)) return;
      optimistic(id, true);
      setFlag(id, true).catch((err) => {
        console.warn("sessionMeta add failed; rolling back", err);
        rollback(id, false);
      });
    },
    remove: (id: string) => {
      if (!getCache().has(id)) return;
      optimistic(id, false);
      setFlag(id, false).catch((err) => {
        console.warn("sessionMeta remove failed; rolling back", err);
        rollback(id, true);
      });
    },
  };
}

export function useArchivedSet(): MetaSetHandle {
  return _makeFlagHook(
    () => _archived,
    (next) => { _archived = next; },
    (id, value) => api.setArchived(id, value),
  );
}

export function useStarredSet(): MetaSetHandle {
  return _makeFlagHook(
    () => _starred,
    (next) => { _starred = next; },
    (id, value) => api.setStarred(id, value),
  );
}

// VIEWED_AT keeps its Map shape — exposed separately because get returns
// a timestamp (not just bool) and set takes an explicit timestamp.
export interface ViewedAtHandle {
  map: Map<string, string>;
  get(id: string): string | null;
  set(id: string, viewedAt: string): void;
  clear(id: string): void;
}

export function useViewedAt(): ViewedAtHandle {
  const map = useSyncExternalStore(_subscribe, () => _viewed, () => _viewed);
  return {
    map,
    get: (id: string) => map.get(id) ?? null,
    set: (id: string, ts: string) => {
      const prev = _viewed.get(id) ?? null;
      const next = new Map(_viewed);
      next.set(id, ts);
      _viewed = next;
      _notify();
      api.setViewedAt(id, ts).catch((err) => {
        console.warn("sessionMeta setViewed failed; rolling back", err);
        const back = new Map(_viewed);
        if (prev == null) back.delete(id);
        else back.set(id, prev);
        _viewed = back;
        _notify();
      });
    },
    clear: (id: string) => {
      if (!_viewed.has(id)) return;
      const prev = _viewed.get(id) ?? null;
      const next = new Map(_viewed);
      next.delete(id);
      _viewed = next;
      _notify();
      api.setViewedAt(id, null).catch((err) => {
        console.warn("sessionMeta clearViewed failed; rolling back", err);
        const back = new Map(_viewed);
        if (prev != null) back.set(id, prev);
        _viewed = back;
        _notify();
      });
    },
  };
}

// ---------------------------------------------------------------------------
// Test helpers — exposed for vitest to seed and reset cache state.
// ---------------------------------------------------------------------------

export const __test = {
  reset(): void {
    _archived = new Set();
    _starred = new Set();
    _viewed = new Map();
    _bootstrapStatus = "ready";  // skip the bootstrap fetch in tests
    _notify();
  },
  seed(opts: { archived?: string[]; starred?: string[]; viewed?: Record<string, string> }): void {
    if (opts.archived) _archived = new Set(opts.archived);
    if (opts.starred) _starred = new Set(opts.starred);
    if (opts.viewed) _viewed = new Map(Object.entries(opts.viewed));
    _bootstrapStatus = "ready";
    _notify();
  },
  snapshot(): { archived: Set<string>; starred: Set<string>; viewed: Map<string, string> } {
    return { archived: _archived, starred: _starred, viewed: _viewed };
  },
};
