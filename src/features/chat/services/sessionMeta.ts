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

function migrateSessionStorageIfNeeded(userId: string): void {
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

export function remapSessionMeta(userId: string, oldSessionId: string, newSessionId: string): void {
  const from = oldSessionId.trim();
  const to = newSessionId.trim();
  if (!from || !to || from === to) return;

  const sessions = loadSessions(userId);
  const fromIndex = sessions.findIndex((session) => session.id === from);
  if (fromIndex < 0) return;

  const toIndex = sessions.findIndex((session) => session.id === to);
  if (toIndex >= 0) {
    sessions.splice(fromIndex, 1);
    saveSessions(userId, sessions);
    return;
  }

  sessions[fromIndex] = { ...sessions[fromIndex], id: to };
  saveSessions(userId, sessions);
}
