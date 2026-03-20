import type { SessionMeta } from "./sessionMeta";
import type { ChatSessionSummary } from "./chatTransport";

export type SessionSyncReason =
  | "startup"
  | "session_switch"
  | "interval"
  | "visibility"
  | "assistant_message"
  | "delete_session"
  | "delete_message"
  | "reconnect"
  | "manual";

export function mergeSessionsWithServer(
  localSessions: SessionMeta[],
  serverSessions: ChatSessionSummary[],
  nowIso: string
): SessionMeta[] {
  const serverById = new Map(serverSessions.map((item) => [item.sessionId, item]));
  const merged: SessionMeta[] = [];

  for (const local of localSessions) {
    const remote = serverById.get(local.id);
    if (!remote) {
      const nextMismatch = (local.mismatchCount ?? 0) + 1;
      // Auto-prune: drop sessions that have been missing on server for 3+ syncs
      if (nextMismatch >= 3) {
        continue;
      }
      merged.push({
        ...local,
        health: "stale",
        mismatchCount: nextMismatch,
        lastSyncedAt: nowIso,
        source: "local-fallback"
      });
      continue;
    }

    if (remote.messageCount === 0 && (local.messageCount > 0 || local.lastMessage.trim().length > 0)) {
      const nextMismatch = (local.mismatchCount ?? 0) + 1;
      if (nextMismatch >= 3) {
        continue;
      }
      merged.push({
        ...local,
        health: "stale",
        mismatchCount: nextMismatch,
        lastSyncedAt: nowIso,
        source: "server"
      });
      continue;
    }

    merged.push({
      ...local,
      title: remote.title || local.title,
      lastMessage: remote.lastMessage || local.lastMessage,
      timestamp: remote.updatedAt || local.timestamp,
      messageCount: remote.messageCount,
      health: remote.health,
      mismatchCount: 0,
      lastSyncedAt: nowIso,
      source: "server"
    });
  }

  return merged;
}

export function markSessionsStaleFallback(
  currentLocal: SessionMeta[],
  nowIso: string
): SessionMeta[] {
  return currentLocal.map((session) => ({
    ...session,
    health: "stale" as const,
    mismatchCount: (session.mismatchCount ?? 0) + 1,
    lastSyncedAt: nowIso,
    source: "local-fallback" as const
  }));
}
