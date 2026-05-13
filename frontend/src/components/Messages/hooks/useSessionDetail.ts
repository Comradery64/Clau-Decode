import { useEffect, useState } from "react";
import type { SessionDetail } from "../../../api/types";
import { api } from "../../../api/client";
import { getCached, setCached, invalidateCached, fetchSession } from "../../../api/sessionCache";
import { groupMessages, type Turn } from "../groupMessages";
import { on } from "../../../utils/events";
import { SSE } from "../../../config/ui";

const XML_TAG_RE = /<[a-z][a-z0-9-]*>[\s\S]*?<\/[a-z][a-z0-9-]*>/g;

function hasPlainText(blocks: import("../../../api/types").ContentBlock[]): boolean {
  return blocks.some((b) => {
    if (b.type !== "text") return false;
    const stripped = (b as { type: "text"; text: string }).text
      .replace(XML_TAG_RE, "")
      .trim();
    return stripped.length > 0;
  });
}

// The assistant is still working if the last visible user turn has actual user text
// (not just stdout/stderr output), or if the last assistant turn ended with no
// text blocks (mid-tool-loop). Command turns (/exit etc.) are never active.
function isSessionActive(turns: Turn[]): boolean {
  if (turns.length === 0) return false;
  const last = turns[turns.length - 1];
  if (last.kind === "command") return false;
  if (last.kind === "user") return hasPlainText(last.message.content_blocks);
  const lastMsg = last.messages[last.messages.length - 1];
  return !lastMsg.content_blocks.some((b) => b.type === "text");
}

export function useSessionDetail(sessionId: string) {
  const cached = getCached(sessionId);
  const [detail, setDetail] = useState<SessionDetail | null>(cached ?? null);
  const [loading, setLoading] = useState(!cached);

  // Fetch session when sessionId changes
  useEffect(() => {
    const hit = getCached(sessionId);
    if (!hit) {
      setLoading(true);
      setDetail(null);
    } else {
      setDetail(hit);
      setLoading(false);
    }
    fetchSession(sessionId, api.getSession)
      .then((d) => { setDetail(d); setLoading(false); })
      .catch(console.error);
  }, [sessionId]);

  // Listen for live-reload refresh events
  useEffect(() => {
    return on("refresh", () => {
      invalidateCached(sessionId);
      api.getSession(sessionId).then((d) => {
        setCached(sessionId, d);
        setDetail((prev) =>
          prev?.id === d.id && prev.messages.length === d.messages.length ? prev : d
        );
      }).catch(console.error);
    });
  }, [sessionId]);

  // Listen for explicit mutations (edit/delete)
  useEffect(() => {
    return on("session-mutated", (mutatedId) => {
      if (mutatedId !== sessionId) return;
      invalidateCached(sessionId);
      api.getSession(sessionId).then((d) => {
        setCached(sessionId, d);
        setDetail(d);
      }).catch(console.error);
    });
  }, [sessionId]);

  // Streaming indicator timeout
  const [sseTimedOut, setSseTimedOut] = useState(false);
  useEffect(() => {
    if (!detail) { setSseTimedOut(false); return; }
    const active = isSessionActive(groupMessages(detail.messages));
    if (!active) { setSseTimedOut(false); return; }
    const updatedMs = detail.updated_at ? Date.parse(detail.updated_at) : 0;
    if (Date.now() - updatedMs > SSE.DEAD_SESSION_MS) {
      setSseTimedOut(true);
      return;
    }
    setSseTimedOut(false);
    const id = setTimeout(() => setSseTimedOut(true), SSE.WATCHDOG_MS);
    return () => clearTimeout(id);
  }, [detail]);

  return { detail, loading, sseTimedOut };
}

export { isSessionActive };
