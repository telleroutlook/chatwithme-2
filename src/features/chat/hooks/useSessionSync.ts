import { useCallback, useEffect, useRef } from "react";
import { loadSessions, saveSessions, type SessionMeta } from "../services/sessionMeta";
import { trackChatEvent } from "../services/trackChatEvent";
import {
  markSessionsStaleFallback,
  mergeSessionsWithServer,
  type SessionSyncReason
} from "../services/sessionSync";
import type { ChatTransport } from "../services/chatTransport";

interface UseSessionSyncParams {
  userId: string;
  chatTransport: Pick<ChatTransport, "getSessions">;
  setSessions: (sessions: SessionMeta[]) => void;
  minIntervalMs?: number;
  defaultDelayMs?: number;
}

interface UseSessionSyncResult {
  enqueueSessionSync: (reason: SessionSyncReason, delayMs?: number) => void;
  syncSessionsNow: (reason?: SessionSyncReason) => Promise<void>;
}

export function useSessionSync({
  userId,
  chatTransport,
  setSessions,
  minIntervalMs = 5000,
  defaultDelayMs = 1500
}: UseSessionSyncParams): UseSessionSyncResult {
  const syncSessionsInFlightRef = useRef<Promise<void> | null>(null);
  const syncDebounceTimerRef = useRef<number | null>(null);
  const syncLastStartRef = useRef(0);

  const syncSessionsNow = useCallback(
    async (reason: SessionSyncReason = "manual") => {
      if (syncSessionsInFlightRef.current) {
        trackChatEvent("history_fetch_deduped", { reason });
        return await syncSessionsInFlightRef.current;
      }

      const run = async () => {
        const currentLocal = loadSessions(userId);
        if (currentLocal.length === 0) {
          setSessions([]);
          return;
        }

        const ids = Array.from(new Set(currentLocal.map((session) => session.id)));
        try {
          const remote = await chatTransport.getSessions(ids);
          const nowIso = new Date().toISOString();
          const merged = mergeSessionsWithServer(currentLocal, remote, nowIso);
          saveSessions(userId, merged);
          setSessions(merged);
          trackChatEvent("sessions_sync", { reason, count: merged.length, source: "server" });
        } catch (error) {
          const nowIso = new Date().toISOString();
          const stale = markSessionsStaleFallback(currentLocal, nowIso);
          saveSessions(userId, stale);
          setSessions(stale);
          trackChatEvent("sessions_sync", {
            reason,
            count: stale.length,
            source: "local-fallback",
            error: error instanceof Error ? error.message : String(error)
          });
        }
      };

      syncSessionsInFlightRef.current = run();
      try {
        await syncSessionsInFlightRef.current;
      } finally {
        syncSessionsInFlightRef.current = null;
      }
    },
    [userId, chatTransport, setSessions]
  );

  const enqueueSessionSync = useCallback(
    (reason: SessionSyncReason, delayMs = defaultDelayMs) => {
      const now = Date.now();
      if (syncSessionsInFlightRef.current) {
        return;
      }
      const elapsed = now - syncLastStartRef.current;
      const appliedDelay = elapsed < minIntervalMs ? Math.max(delayMs, minIntervalMs - elapsed) : delayMs;
      if (syncDebounceTimerRef.current !== null) {
        window.clearTimeout(syncDebounceTimerRef.current);
      }
      syncDebounceTimerRef.current = window.setTimeout(() => {
        syncDebounceTimerRef.current = null;
        syncLastStartRef.current = Date.now();
        void syncSessionsNow(reason);
      }, appliedDelay);
    },
    [defaultDelayMs, minIntervalMs, syncSessionsNow]
  );

  useEffect(() => {
    return () => {
      if (syncDebounceTimerRef.current !== null) {
        window.clearTimeout(syncDebounceTimerRef.current);
      }
    };
  }, []);

  return {
    enqueueSessionSync,
    syncSessionsNow
  };
}
