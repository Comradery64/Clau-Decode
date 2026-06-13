import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../api/client";
import type { PtyOwnership } from "../../../api/types";

const POLL_MS = 5000;

// Phase-0 ownership poller (pty-ownership-plan.md).
//
// Polls /api/pty/ownership/{sid} on a coarse interval — 5 s is enough
// to flip the badge within human-perceptible latency when a terminal
// claude attaches, without spamming the BE's pgrep+lsof check. Pauses
// while the document is hidden so background tabs cost nothing.
//
// The hook also exposes a refetch() callback so callers can re-poll
// immediately after an explicit action (e.g. after pressing Take over,
// to confirm status flipped to "ours" or back to "idle").
//
// Why a separate hook (not folded into useSessionDetail): the session
// detail hook is event-driven (refresh / session-mutated), not a
// poller. Conflating the two would push polling cadence onto code
// paths that don't need it (every chat input keystroke triggers a
// session-detail revalidation).
export function useSessionOwnership(sessionId: string | null) {
  const [ownership, setOwnership] = useState<PtyOwnership | null>(null);
  const cancelledRef = useRef(false);

  const fetchOnce = useCallback(async () => {
    if (!sessionId) return;
    try {
      const data = await api.ptyOwnership(sessionId);
      if (!cancelledRef.current) setOwnership(data);
    } catch {
      // Network errors / 5xx: drop to null so callers fall back to the
      // permissive "no info → treat as idle" behavior rather than
      // ghosting a stale verdict.
      if (!cancelledRef.current) setOwnership(null);
    }
  }, [sessionId]);

  useEffect(() => {
    cancelledRef.current = false;
    if (!sessionId) {
      setOwnership(null);
      return;
    }
    void fetchOnce();
    const tick = () => {
      if (document.hidden) return;
      void fetchOnce();
    };
    const interval = window.setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (!document.hidden) void fetchOnce();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelledRef.current = true;
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [sessionId, fetchOnce]);

  return { ownership, refetch: fetchOnce };
}
