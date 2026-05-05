import { useState, useEffect } from "react";
import type { Session } from "../../api/types";
import { api } from "../../api/client";
import { useAppStore } from "../../store";
import { toggleBlocksExpanded } from "../../store/blocksState";
import { lsGetMap } from "../../utils/localStorage";
import { EmptyState } from "./EmptyState";
import { ConversationHeader } from "./ConversationHeader";
import { MessageList } from "./MessageListLoader";

const LS_RENAMED = "clau-decode:renamed";

export default function ChatView() {
  const selectedSessionId = useAppStore((s) => s.selectedSessionId);
  const [session, setSession] = useState<Session | null>(null);

  useEffect(() => {
    if (!selectedSessionId) { setSession(null); return; }
    let cancelled = false;
    api
      .getSession(selectedSessionId)
      .then((detail) => {
        if (!cancelled) {
          const renamed = lsGetMap(LS_RENAMED)[selectedSessionId];
          setSession(renamed ? { ...detail, title: renamed } : detail);
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [selectedSessionId]);

  useEffect(() => {
    const onRename = (e: Event) => {
      const { id, title } = (e as CustomEvent<{ id: string; title: string }>).detail;
      if (id === selectedSessionId) {
        setSession((prev) => prev ? { ...prev, title } : prev);
      }
    };
    window.addEventListener("clau-decode:rename", onRename);
    return () => window.removeEventListener("clau-decode:rename", onRename);
  }, [selectedSessionId]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "o") {
        e.preventDefault();
        const container = document.getElementById("message-list-container");

        // Snapshot an anchor element at the top of the visible area so we
        // can restore its position after the expansion changes layout.
        const anchor = (() => {
          if (!container) return null;
          const r = container.getBoundingClientRect();
          return document.elementFromPoint(r.left + r.width / 2, r.top + 4);
        })();

        // Desired distance of anchor from the container's top edge (viewport-relative).
        // We restore this after expand/collapse regardless of snap-to-bottom interference.
        const anchorTargetOffset = (() => {
          if (!anchor || !container) return 0;
          return anchor.getBoundingClientRect().top - container.getBoundingClientRect().top;
        })();

        // Correct scroll after React's async render commits. We compute
        // anchorContentOffset (invariant to scrollTop) inside the callback so
        // the result is correct even if MessageList's snap-to-bottom ResizeObserver
        // already ran and changed scrollTop before ours fires.
        const inner = container?.firstElementChild;
        if (inner && anchor && container) {
          const ro = new ResizeObserver(() => {
            ro.disconnect();
            const anchorContentOffset =
              anchor.getBoundingClientRect().top -
              container.getBoundingClientRect().top +
              container.scrollTop;
            container.scrollTop = anchorContentOffset - anchorTargetOffset;
          });
          ro.observe(inner);
        }

        toggleBlocksExpanded();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  if (!selectedSessionId) {
    return (
      <div
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          height: "100vh",
          overflow: "hidden",
          background: "var(--bg-base)",
        }}
      >
        <EmptyState />
      </div>
    );
  }

  return (
    <div
      style={{
        flex: 1,
        display: "flex",
        flexDirection: "column",
        height: "100vh",
        overflow: "hidden",
        background: "var(--bg-base)",
      }}
    >
      <ConversationHeader session={session} />
      <div
        id="message-list-container"
        style={{ flex: 1, overflowY: "auto", overflowX: "hidden" }}
      >
        <MessageList sessionId={selectedSessionId} />
      </div>
    </div>
  );
}
