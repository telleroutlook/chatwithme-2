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
  const initializedForUserRef = useRef<string | null>(null);

  useEffect(() => {
    if (initializedForUserRef.current === userId) return;
    initializedForUserRef.current = userId;
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

  useEffect(() => {
    const onAuthLogin = () => {
      const stored = loadSessions(userId);
      setSessions(stored);
      enqueueSessionSync("startup", 0);
    };

    const onAuthLogout = () => {
      const stored = loadSessions(userId);
      setSessions(stored);
    };

    window.addEventListener("auth:login", onAuthLogin);
    window.addEventListener("auth:logout", onAuthLogout);
    return () => {
      window.removeEventListener("auth:login", onAuthLogin);
      window.removeEventListener("auth:logout", onAuthLogout);
    };
  }, [enqueueSessionSync, setSessions, userId]);

  const triggerReconnectSync = useCallback(() => {
    enqueueSessionSync("reconnect", 0);
  }, [enqueueSessionSync]);

  return { triggerReconnectSync };
}
