export interface SessionMeta {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
  health?: "healthy" | "stale" | "orphaned";
  mismatchCount?: number;
  lastSyncedAt?: string;
  source?: "server" | "local-fallback";
}

const SESSION_STORAGE_VERSION_KEY = "chatwithme_session_storage_version";
const SESSION_STORAGE_VERSION = "v4"; // Bumped for user-scoped storage

/**
 * Get user-scoped storage key for sessions.
 * Format: "chatwithme_sessions_{userId}"
 */
function getSessionsKey(userId: string): string {
  return `chatwithme_sessions_${userId}`;
}

/**
 * Get user-scoped storage key for current session.
 * Format: "chatwithme_current_session_{userId}"
 */
function getCurrentSessionKey(userId: string): string {
  return `chatwithme_current_session_${userId}`;
}

function migrateSessionStorageIfNeeded(_userId: string): void {
  const current = localStorage.getItem(SESSION_STORAGE_VERSION_KEY);
  if (current === SESSION_STORAGE_VERSION) {
    return;
  }

  // Clear old format data on version upgrade
  localStorage.removeItem("chatwithme_sessions");
  localStorage.removeItem("currentSessionId");
  localStorage.setItem(SESSION_STORAGE_VERSION_KEY, SESSION_STORAGE_VERSION);
}

export function loadCurrentSessionId(userId: string): string | null {
  migrateSessionStorageIfNeeded(userId);
  return localStorage.getItem(getCurrentSessionKey(userId));
}

export function saveCurrentSessionId(userId: string, sessionId: string): void {
  migrateSessionStorageIfNeeded(userId);
  localStorage.setItem(getCurrentSessionKey(userId), sessionId);
}

export function loadSessions(userId: string): SessionMeta[] {
  migrateSessionStorageIfNeeded(userId);
  try {
    const data = localStorage.getItem(getSessionsKey(userId));
    if (!data) return [];
    const raw = JSON.parse(data) as SessionMeta[];
    return Array.isArray(raw)
      ? raw.map((session) => ({
          ...session,
          health: session.health ?? "healthy",
          mismatchCount: Number.isFinite(session.mismatchCount) ? session.mismatchCount : 0,
          source: session.source ?? "local-fallback"
        }))
      : [];
  } catch (error) {
    console.warn("[session_meta_load_failed]", {
      error: error instanceof Error ? error.message : String(error)
    });
    return [];
  }
}

export function saveSessions(userId: string, sessions: SessionMeta[]): void {
  localStorage.setItem(getSessionsKey(userId), JSON.stringify(sessions));
}

export function updateSessionMeta(userId: string, sessionId: string, updates: Partial<SessionMeta>): void {
  const sessions = loadSessions(userId);
  const index = sessions.findIndex((session) => session.id === sessionId);

  if (index >= 0) {
    sessions[index] = { ...sessions[index], ...updates };
    const session = sessions.splice(index, 1)[0];
    sessions.unshift(session);
  } else {
    sessions.unshift({
      id: sessionId,
      title: "New Chat",
      lastMessage: "",
      timestamp: new Date().toISOString(),
      messageCount: 0,
      health: "healthy",
      mismatchCount: 0,
      source: "local-fallback",
      ...updates
    });
  }

  saveSessions(userId, sessions);
}

export function deleteSessionMeta(userId: string, sessionId: string): void {
  const sessions = loadSessions(userId).filter((session) => session.id !== sessionId);
  saveSessions(userId, sessions);
}

interface SessionMigrationResult {
  mergedCount: number;
  currentSessionId: string | null;
}

function parseTimestamp(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function mergeSessionLists(primary: SessionMeta[], incoming: SessionMeta[]): SessionMeta[] {
  const byId = new Map<string, SessionMeta>();
  for (const session of [...primary, ...incoming]) {
    const current = byId.get(session.id);
    if (!current || parseTimestamp(session.timestamp) >= parseTimestamp(current.timestamp)) {
      byId.set(session.id, session);
    }
  }
  return Array.from(byId.values()).sort((a, b) => parseTimestamp(b.timestamp) - parseTimestamp(a.timestamp));
}

export function migrateSessionsBetweenUsers(fromUserId: string, toUserId: string): SessionMigrationResult {
  const from = fromUserId.trim();
  const to = toUserId.trim();
  if (!from || !to || from === to) {
    return {
      mergedCount: 0,
      currentSessionId: loadCurrentSessionId(to) ?? null
    };
  }

  const sourceSessions = loadSessions(from);
  const targetSessions = loadSessions(to);
  if (sourceSessions.length === 0) {
    return {
      mergedCount: targetSessions.length,
      currentSessionId: loadCurrentSessionId(to) ?? null
    };
  }

  const mergedSessions = mergeSessionLists(targetSessions, sourceSessions);
  saveSessions(to, mergedSessions);

  const sourceCurrent = loadCurrentSessionId(from);
  const targetCurrent = loadCurrentSessionId(to);
  const mergedCurrent = sourceCurrent ?? targetCurrent ?? mergedSessions[0]?.id ?? null;
  if (mergedCurrent) {
    saveCurrentSessionId(to, mergedCurrent);
  }

  return {
    mergedCount: mergedSessions.length,
    currentSessionId: mergedCurrent
  };
}
