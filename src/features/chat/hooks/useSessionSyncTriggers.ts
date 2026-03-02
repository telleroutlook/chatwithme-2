import { useCallback, useEffect, useRef } from "react";
import { loadSessions, type SessionMeta } from "../services/sessionMeta";
import type { SessionSyncReason } from "../services/sessionSync";

interface UseSessionSyncTriggersParams {
  userId: string;
  currentSessionId: string;
  enqueueSessionSync: (reason: SessionSyncReason, delayMs?: number) => void;
  setSessions: (sessions: SessionMeta[]) => void;
  intervalMs?: number;
}

interface UseSessionSyncTriggersResult {
  triggerReconnectSync: () => void;
}

export function useSessionSyncTriggers({
  userId,
  currentSessionId,
  enqueueSessionSync,
  setSessions,
  intervalMs = 45000
}: UseSessionSyncTriggersParams): UseSessionSyncTriggersResult {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    const stored = loadSessions(userId);
    setSessions(stored);
    if (stored.length === 0) return;
    enqueueSessionSync("startup", 0);
  }, [userId, enqueueSessionSync, setSessions]);

  useEffect(() => {
    enqueueSessionSync("session_switch");
  }, [currentSessionId, enqueueSessionSync]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      enqueueSessionSync("interval", 0);
    }, intervalMs);

    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      enqueueSessionSync("visibility", 0);
    };

    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enqueueSessionSync, intervalMs]);

  const triggerReconnectSync = useCallback(() => {
    enqueueSessionSync("reconnect", 0);
  }, [enqueueSessionSync]);

  return { triggerReconnectSync };
}
