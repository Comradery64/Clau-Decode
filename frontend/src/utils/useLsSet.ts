import { useCallback, useEffect, useState } from "react";
import { lsGetSet, lsPutSet } from "./localStorage";
import { emit, on } from "./events";

type SyncEvent = "star" | "archive";

export interface LsSetHandle {
  ids: Set<string>;
  has(id: string): boolean;
  toggle(id: string): void;
  remove(id: string): void;
  add(id: string): void;
}

/**
 * Hook to manage a Set<string> persisted to localStorage that stays in sync
 * across components via an emitted event. On mount, reads the set; subscribes
 * to the event so updates from other components are reflected here. Mutations
 * write back to localStorage and emit the event.
 */
export function useLsSet(key: string, syncEvent: SyncEvent): LsSetHandle {
  const [ids, setIds] = useState<Set<string>>(() => lsGetSet(key));

  useEffect(() => {
    return on(syncEvent, () => setIds(lsGetSet(key)));
  }, [key, syncEvent]);

  const emitChange = useCallback(
    (id: string) => {
      emit(syncEvent, id);
    },
    [syncEvent],
  );

  const toggle = useCallback(
    (id: string) => {
      const s = lsGetSet(key);
      if (s.has(id)) s.delete(id);
      else s.add(id);
      lsPutSet(key, s);
      setIds(new Set(s));
      emitChange(id);
    },
    [key, emitChange],
  );

  const add = useCallback(
    (id: string) => {
      const s = lsGetSet(key);
      if (s.has(id)) return;
      s.add(id);
      lsPutSet(key, s);
      setIds(new Set(s));
      emitChange(id);
    },
    [key, emitChange],
  );

  const remove = useCallback(
    (id: string) => {
      const s = lsGetSet(key);
      if (!s.has(id)) return;
      s.delete(id);
      lsPutSet(key, s);
      setIds(new Set(s));
      emitChange(id);
    },
    [key, emitChange],
  );

  const has = useCallback((id: string) => ids.has(id), [ids]);

  return { ids, has, toggle, remove, add };
}
