export interface SessionMeta {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
}

const SESSIONS_KEY = "chatwithme_sessions";
const CURRENT_SESSION_KEY = "currentSessionId";
const SESSION_STORAGE_VERSION_KEY = "chatwithme_session_storage_version";
const SESSION_STORAGE_VERSION = "v2";

function migrateSessionStorageIfNeeded(): void {
  const current = localStorage.getItem(SESSION_STORAGE_VERSION_KEY);
  if (current === SESSION_STORAGE_VERSION) {
    return;
  }

  localStorage.removeItem(SESSIONS_KEY);
  localStorage.removeItem(CURRENT_SESSION_KEY);
  localStorage.setItem(SESSION_STORAGE_VERSION_KEY, SESSION_STORAGE_VERSION);
}

export function loadCurrentSessionId(): string | null {
  migrateSessionStorageIfNeeded();
  return localStorage.getItem(CURRENT_SESSION_KEY);
}

export function saveCurrentSessionId(sessionId: string): void {
  migrateSessionStorageIfNeeded();
  localStorage.setItem(CURRENT_SESSION_KEY, sessionId);
}

export function loadSessions(): SessionMeta[] {
  migrateSessionStorageIfNeeded();
  try {
    const data = localStorage.getItem(SESSIONS_KEY);
    return data ? (JSON.parse(data) as SessionMeta[]) : [];
  } catch {
    return [];
  }
}

export function saveSessions(sessions: SessionMeta[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

export function updateSessionMeta(sessionId: string, updates: Partial<SessionMeta>): void {
  const sessions = loadSessions();
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
      ...updates
    });
  }

  saveSessions(sessions);
}

export function deleteSessionMeta(sessionId: string): void {
  const sessions = loadSessions().filter((session) => session.id !== sessionId);
  saveSessions(sessions);
}
