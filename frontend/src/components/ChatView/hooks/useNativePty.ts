import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../../../api/client";
import type { PtyNativeSnapshot } from "../../../api/types";
import { on } from "../../../utils/events";

function decodeBase64Bytes(dataB64: string): Uint8Array {
  const raw = atob(dataB64);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) {
    bytes[i] = raw.charCodeAt(i);
  }
  return bytes;
}

function isMissingPtyChannelError(message: string): boolean {
  return message.includes("404") || /no (live )?PTY channel/i.test(message);
}

interface UseNativePtyOptions {
  initialSize?: { rows: number; cols: number } | null;
  onOutputChunk?: (chunk: Uint8Array) => void;
}

export function useNativePty(
  sessionId: string,
  options: UseNativePtyOptions = {},
) {
  const [snapshot, setSnapshot] = useState<PtyNativeSnapshot | null>(null);
  const [alive, setAlive] = useState<boolean | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const onOutputChunkRef = useRef(options.onOutputChunk);

  useEffect(() => {
    onOutputChunkRef.current = options.onOutputChunk;
  }, [options.onOutputChunk]);

  useEffect(() => {
    let cancelled = false;
    setSnapshot(null);
    setAlive(null);
    setStarting(false);
    setError(null);
    if (!options.initialSize) {
      return () => {
        cancelled = true;
      };
    }

    const initialSize = options.initialSize;

    const applySnapshot = (next: PtyNativeSnapshot) => {
      setSnapshot(next);
      setAlive(next.alive);
    };

    const resizeToInitialSize = () => api.ptyResize(sessionId, initialSize.rows, initialSize.cols);

    const hydrateExisting = async () => {
      const next = await api.ptyNativeSnapshot(sessionId);
      if (!cancelled) {
        applySnapshot(next);
      }
      await resizeToInitialSize();
    };

    const hydrateStarted = async () => {
      await resizeToInitialSize();
      const next = await api.ptyNativeSnapshot(sessionId);
      if (!cancelled) applySnapshot(next);
    };

    hydrateExisting()
      .catch(async (err: unknown) => {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        const missingChannel = isMissingPtyChannelError(message);
        if (!missingChannel) {
          setError(err instanceof Error ? err.message : "Native PTY unavailable");
          return;
        }
        // No live PTY yet — start one so the native view can display it (native
        // view has no composer, so this mount-spawn is the only way it gets a
        // PTY). Waste from many lingering PTYs is bounded by killing non-viewed
        // PTYs quickly (blur kill), NOT by refusing to spawn.
        setStarting(true);
        setError(null);
        try {
          await api.ptyFocus(sessionId);
          await hydrateStarted();
        } catch (focusErr: unknown) {
          if (!cancelled) {
            setError(
              focusErr instanceof Error
                ? focusErr.message
                : "Native PTY unavailable"
            );
          }
        } finally {
          if (!cancelled) setStarting(false);
        }
      })
      .then(() => {
        if (!cancelled) {
          setStarting(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [options.initialSize, sessionId]);

  useEffect(() => {
    return on("pty-output-chunk", (event) => {
      if (event.session_id !== sessionId) return;
      onOutputChunkRef.current?.(decodeBase64Bytes(event.data_b64));
    });
  }, [sessionId]);

  // Shorten the backend's idle-kill window when this view leaves a session,
  // so blurred PTYs die quickly and don't keep broadcasting to the SSE bus.
  useEffect(() => {
    return () => {
      void api.ptyBlur(sessionId).catch(() => {});
    };
  }, [sessionId]);

  useEffect(() => {
    return on("pty-native-state", (event) => {
      if (event.session_id !== sessionId) return;
      setAlive(event.state !== "dead");
    });
  }, [sessionId]);

  const writeInput = useCallback(
    (data: string) => api.ptyInput(sessionId, data),
    [sessionId],
  );

  const resize = useCallback(
    (rows: number, cols: number) => api.ptyResize(sessionId, rows, cols),
    [sessionId],
  );

  return {
    snapshot,
    alive,
    starting,
    error,
    snapshotBytes: snapshot ? decodeBase64Bytes(snapshot.ring_b64) : null,
    writeInput,
    resize,
  };
}
