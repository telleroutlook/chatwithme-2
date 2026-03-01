import type { SessionMeta } from "./sessionMeta";

export type DeleteSelectionResult =
  | { action: "keep-current" }
  | { action: "switch"; sessionId: string }
  | { action: "create-new" };

export function getNextSessionAfterDelete(
  sessions: SessionMeta[],
  targetSessionId: string,
  currentSessionId: string
): DeleteSelectionResult {
  if (targetSessionId !== currentSessionId) {
    return { action: "keep-current" };
  }

  const fallback = sessions.find((session) => session.id !== targetSessionId);
  if (fallback) {
    return { action: "switch", sessionId: fallback.id };
  }

  return { action: "create-new" };
}
