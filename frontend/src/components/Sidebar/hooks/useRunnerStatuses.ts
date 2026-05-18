import { useEffect, useRef, useState } from "react";
import { api } from "../../../api/client";
import type { RunnerStatus } from "../../../api/types";

/**
 * Polls /api/sessions/{id}/runner-status for the given session ids on a
 * single shared timer and exposes a Map of latest snapshots.
 *
 * Issue #12 — client-side polling as the "smallest first step" toward a
 * sidebar busy indicator. We deliberately do NOT use SSE here; server-push
 * fan-out is tracked separately (#11).
 *
 * Design notes:
 * - One shared interval, not one per visible item. Each tick fans out N
 *   parallel GETs (the endpoint is per-id; there is no batch route). This
 *   keeps the worst case at O(visible) requests per tick instead of
 *   O(visible) timers.
 * - Pauses while the tab is hidden via `document.visibilityState` — there
 *   is no value spending requests on a backgrounded window.
 * - `fetcher` is injectable so the hook can be exercised in tests without
 *   mocking fetch.
 */
export interface UseRunnerStatusesOptions {
  /** Poll cadence in ms. Defaults to 4000 — fast enough to feel live,
   * slow enough that 50 visible items don't hammer the server. */
  intervalMs?: number;
  /** Override the network call (used by tests). */
  fetcher?: (sessionId: string) => Promise<RunnerStatus>;
}

const DEFAULT_INTERVAL_MS = 4000;

export function useRunnerStatuses(
  sessionIds: ReadonlyArray<string>,
  options: UseRunnerStatusesOptions = {},
): Map<string, RunnerStatus> {
  const { intervalMs = DEFAULT_INTERVAL_MS, fetcher = api.getRunnerStatus } = options;

  const [statuses, setStatuses] = useState<Map<string, RunnerStatus>>(
    () => new Map(),
  );

  // Stable string key so the effect doesn't churn when callers pass a new
  // array reference with the same contents (e.g. memo-less parents).
  const idsKey = sessionIds.join("␟");
  const idsRef = useRef<ReadonlyArray<string>>(sessionIds);
  idsRef.current = sessionIds;

  // Latest fetcher in a ref so the effect can stay scoped to id/interval
  // changes; otherwise a fresh inline fetcher would tear down the timer.
  const fetcherRef = useRef(fetcher);
  fetcherRef.current = fetcher;

  // Drop entries for ids that are no longer visible — keeps the Map from
  // growing unboundedly as the user scrolls / filters the sidebar.
  useEffect(() => {
    setStatuses((prev) => {
      const next = new Map<string, RunnerStatus>();
      for (const id of sessionIds) {
        const existing = prev.get(id);
        if (existing) next.set(id, existing);
      }
      return prev.size === next.size && [...prev.keys()].every((k) => next.has(k))
        ? prev
        : next;
    });
  }, [idsKey]);

  useEffect(() => {
    if (sessionIds.length === 0) return;

    let cancelled = false;

    const tick = async () => {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      const ids = idsRef.current;
      const results = await Promise.allSettled(
        ids.map((id) => fetcherRef.current(id).then((s) => [id, s] as const)),
      );
      if (cancelled) return;
      setStatuses((prev) => {
        const next = new Map(prev);
        let changed = false;
        for (const r of results) {
          if (r.status !== "fulfilled") continue;
          const [id, snapshot] = r.value;
          // Only keep ids still visible in case the set shrank mid-flight.
          if (!idsRef.current.includes(id)) continue;
          const existing = next.get(id);
          if (
            !existing ||
            existing.busy !== snapshot.busy ||
            existing.quiet_warning !== snapshot.quiet_warning ||
            existing.quiet_age_seconds !== snapshot.quiet_age_seconds ||
            existing.last_error !== snapshot.last_error ||
            existing.permission_mode !== snapshot.permission_mode
          ) {
            next.set(id, snapshot);
            changed = true;
          }
        }
        return changed ? next : prev;
      });
    };

    tick();
    const handle = setInterval(tick, intervalMs);

    const onVisibility = () => {
      if (document.visibilityState === "visible") tick();
    };
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", onVisibility);
    }

    return () => {
      cancelled = true;
      clearInterval(handle);
      if (typeof document !== "undefined") {
        document.removeEventListener("visibilitychange", onVisibility);
      }
    };
  }, [idsKey, intervalMs]);

  return statuses;
}
