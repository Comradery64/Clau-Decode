import { useMemo } from "react";
import type { ChatSendShortcut, PermissionMode, Session } from "../../api/types";
import { api } from "../../api/client";
import { ChatInput, type SubmitMeta } from "./ChatInput";
import { useSessionDetail, isSessionActive } from "../Messages/hooks/useSessionDetail";
import { groupMessages } from "../Messages/groupMessages";

// Thin shell around <ChatInput> that derives the streaming/active state from
// the session detail SSE feed and wires Stop to the API.
//
// effectiveActive logic:
//   - forceInactive (Stop-click override from parent) always wins false
//   - optimisticActive (user's own submit click) bypasses sseTimedOut, which
//     is computed off stale pre-submit JSONL and would otherwise suppress the
//     Stop button on the very turn we just started
//   - otherwise: serverActive && !sseTimedOut (JSONL-derived)
export function ChatInputBar({
  sessionId,
  session,
  defaultPermissionMode,
  chatSendShortcut,
  onSubmitStart,
  onSubmitFailed,
  onStopFired,
  forceInactive = false,
  optimisticActive = false,
  btwCaptureActive = false,
  disableInput = false,
  focusRequestKey = 0,
  flushTop = false,
}: {
  sessionId: string;
  session: Session | null;
  defaultPermissionMode: PermissionMode;
  chatSendShortcut: ChatSendShortcut;
  onSubmitStart?: (meta?: SubmitMeta) => void;
  onSubmitFailed?: (meta?: SubmitMeta) => void;
  onStopFired?: () => void;
  forceInactive?: boolean;
  optimisticActive?: boolean;
  btwCaptureActive?: boolean;
  // Phase-0 take-over: when a foreign claude owns the session, disable
  // submit so the user must press Take over before sending. Mirrors
  // the existing is_fork disable semantics.
  disableInput?: boolean;
  focusRequestKey?: number;
  flushTop?: boolean;
}) {
  const { detail } = useSessionDetail(sessionId);
  const turns = useMemo(() => (detail ? groupMessages(detail.messages) : []), [detail]);
  const serverActive = isSessionActive(turns);
  // W1-D removed `sseTimedOut` from the hook return; the optimistic flag
  // upstream is now the authoritative "turn-in-flight" indicator, with
  // serverActive as a fallback for the page-reload-mid-turn case.
  const effectiveActive = !forceInactive && (optimisticActive || serverActive);
  // The session is undeliverable when its cwd directory is gone (cwd_exists
  // is False in the DB-derived session detail). Surface this to ChatInput
  // so handleSend can short-circuit with a clear error instead of letting
  // the PTY spawn fail downstream with no UI feedback. Default to true if
  // detail hasn't loaded yet — we err on the side of allowing the click.
  const cwdMissing = detail !== null && detail.cwd_exists === false;

  return (
    <ChatInput
      sessionId={sessionId}
      isStreaming={effectiveActive}
      disabled={!!session?.is_fork || disableInput}
      disabledPlaceholder={
        session?.is_fork
          ? undefined
          : disableInput
            ? "This session is open in another claude — take over above to send here."
            : undefined
      }
      cwdMissing={cwdMissing}
      onStop={() => {
        void api.ptyKill(sessionId).catch(() => {});
        // Tell the parent so the UI override fires immediately (the kill
        // leaves JSONL mid-turn, so isActive won't naturally flip off).
        onStopFired?.();
      }}
      onSubmitStart={onSubmitStart}
      onSubmitFailed={onSubmitFailed}
      btwCaptureActive={btwCaptureActive}
      defaultPermissionMode={defaultPermissionMode}
      chatSendShortcut={chatSendShortcut}
      focusRequestKey={focusRequestKey}
      flushTop={flushTop}
    />
  );
}
