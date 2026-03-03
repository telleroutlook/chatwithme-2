import { useCallback } from "react";
import { nanoid } from "nanoid";
import type { UIMessage } from "ai";
import {
  loadSessions,
  updateSessionMeta,
  deleteSessionMeta,
  type SessionMeta
} from "../services/sessionMeta";
import { getNextSessionAfterDelete } from "../services/sessionSelection";
import { buildSessionViewResetState } from "../services/sessionLifecycle";
import type { SessionSyncReason } from "../services/sessionSync";
import type { UiMessageKey } from "../../../i18n/ui";
import type { TranslateParams } from "../../../hooks/useI18n";

interface UseChatSessionControllerParams {
  userId: string;
  currentSessionId: string;
  setCurrentSessionId: (id: string) => void;
  sessions: SessionMeta[];
  setSessions: (sessions: SessionMeta[]) => void;
  permissions: { canEdit: boolean; readonly: boolean };
  chatTransport: {
    deleteSession: (sessionId: string) => Promise<unknown>;
  };
  addToast: (message: string, type: "success" | "error" | "info") => void;
  t: (key: UiMessageKey, params?: TranslateParams) => string;
  stop: () => void;
  setChatMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
  enqueueSessionSync: (type: SessionSyncReason) => void;
  readonlyMode: boolean;
}

interface RuntimeApprovalItem {
  id: string;
  toolName: string;
  argsSnippet: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface LiveProgressEntry {
  id: string;
  timestamp: string;
  phase: string;
  message: string;
  status: string;
  severity: string;
  groupKey: string;
}

export interface UseChatSessionControllerResult {
  handleNewSession: () => void;
  handleSelectSession: (sessionId: string) => void;
  handleDeleteSession: (sessionId: string) => Promise<void>;
}

export function useChatSessionController(
  params: UseChatSessionControllerParams
): UseChatSessionControllerResult {
  const {
    userId,
    currentSessionId,
    setCurrentSessionId,
    sessions,
    setSessions,
    permissions,
    chatTransport,
    addToast,
    t,
    stop,
    setChatMessages,
    enqueueSessionSync,
    readonlyMode
  } = params;

  const handleNewSession = useCallback(() => {
    const newId = nanoid(8);
    stop();
    setChatMessages([]);
    updateSessionMeta(userId, newId, {
      title: t("session_new"),
      lastMessage: "",
      timestamp: new Date().toISOString(),
      messageCount: 0
    });
    setSessions(loadSessions(userId));
    setCurrentSessionId(newId);
  }, [setChatMessages, stop, t, userId, setSessions, setCurrentSessionId]);

  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId === currentSessionId) return;
      stop();
      setChatMessages([]);
      setCurrentSessionId(sessionId);
    },
    [currentSessionId, setChatMessages, stop, setCurrentSessionId]
  );

  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!permissions.canEdit) {
        addToast(t("readonly_action_blocked"), "info");
        return;
      }

      try {
        const deleteResult = await chatTransport.deleteSession(sessionId);
        const isValidResult = (
          result: unknown
        ): result is { success: boolean; error?: string; pendingDestroy?: boolean } => {
          return (
            typeof result === "object" &&
            result !== null &&
            "success" in result &&
            typeof (result as { success: unknown }).success === "boolean"
          );
        };

        if (!isValidResult(deleteResult) || !deleteResult.success) {
          const errorMsg = (deleteResult as { error?: string })?.error;
          throw new Error(errorMsg || "Invalid delete session response");
        }

        const nextSelection = getNextSessionAfterDelete(sessions, sessionId, currentSessionId);
        deleteSessionMeta(userId, sessionId);
        setSessions(loadSessions(userId));

        if (nextSelection.action === "switch") {
          handleSelectSession(nextSelection.sessionId);
        } else if (nextSelection.action === "create-new") {
          handleNewSession();
        }

        if ((deleteResult as { pendingDestroy?: boolean }).pendingDestroy) {
          addToast(t("session_delete_pending_destroy"), "info");
        }
        addToast(t("session_deleted"), "success");
        enqueueSessionSync("delete_session");
      } catch (error) {
        console.error("Failed to delete session:", error);
        addToast(
          t("session_delete_failed", {
            reason: error instanceof Error ? error.message : "Unknown error"
          }),
          "error"
        );
      }
    },
    [
      addToast,
      chatTransport,
      currentSessionId,
      handleNewSession,
      handleSelectSession,
      permissions.canEdit,
      enqueueSessionSync,
      sessions,
      t,
      userId,
      setSessions
    ]
  );

  return {
    handleNewSession,
    handleSelectSession,
    handleDeleteSession
  };
}
