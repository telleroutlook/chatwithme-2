import { useCallback } from "react";
import { nanoid } from "nanoid";
import type { UIMessage } from "ai";
import {
  isDeleteMessageResult,
  isEditMessageResult,
  isRegenerateMessageResult,
  isFixChartResult
} from "../services/apiContracts";
import {
  loadSessions,
  updateSessionMeta
} from "../services/sessionMeta";
import { getMessageText } from "../../../utils/message-text";
import { trackChatEvent } from "../services/trackChatEvent";
import type { SessionSyncReason } from "../services/sessionSync";
import type { UiMessageKey } from "../../../i18n/ui";
import type { TranslateParams } from "../../../hooks/useI18n";
import type { LiveProgressEntry } from "../services/progress";

export interface ChartFixContext {
  engine: string;
  chartType: string;
  brokenSpec: string;
  errorMessage?: string;
}

interface UseMessageActionsParams {
  userId: string;
  currentSessionId: string;
  permissions: { canEdit: boolean; readonly: boolean };
  chatTransport: {
    deleteMessage: (messageId: string) => Promise<unknown>;
    editMessage: (messageId: string, content: string) => Promise<unknown>;
    regenerateMessage: (messageId: string) => Promise<unknown>;
    fixChart: (messageId: string, engine: string, chartType: string, brokenSpec: string, errorMessage?: string) => Promise<unknown>;
    getHistory: () => Promise<Array<{ id?: string; role?: string; content?: string }>>;
  };
  chatMessages: UIMessage[];
  setChatMessages: (messages: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => void;
  addToast: (message: string, type: "success" | "error" | "info") => void;
  t: (key: UiMessageKey, params?: TranslateParams) => string;
  enqueueSessionSync: (type: SessionSyncReason) => void;
  setAwaitingFirstAssistant: (value: boolean) => void;
  setAwaitingAssistantFromIndex: (value: number | null) => void;
  setLiveProgress: React.Dispatch<React.SetStateAction<LiveProgressEntry[]>>;
  setSessions: (sessions: ReturnType<typeof loadSessions>) => void;
}

export interface UseMessageActionsResult {
  handleDeleteMessage: (messageId: UIMessage["id"]) => Promise<void>;
  handleEditMessage: (messageId: UIMessage["id"], content: string) => Promise<void>;
  handleRegenerateMessage: (messageId: UIMessage["id"]) => Promise<void>;
  handleFixChart: (messageId: UIMessage["id"], ctx: ChartFixContext) => Promise<void>;
}

export function useMessageActions(
  params: UseMessageActionsParams
): UseMessageActionsResult {
  const {
    userId,
    currentSessionId,
    permissions,
    chatTransport,
    chatMessages,
    setChatMessages,
    addToast,
    t,
    enqueueSessionSync,
    setAwaitingFirstAssistant,
    setAwaitingAssistantFromIndex,
    setLiveProgress,
    setSessions
  } = params;

  const handleDeleteMessage = useCallback(
    async (messageId: UIMessage["id"]) => {
      if (!permissions.canEdit) {
        addToast(t("readonly_action_blocked"), "info");
        return;
      }
      try {
        const result = await chatTransport.deleteMessage(String(messageId));
        if (!isDeleteMessageResult(result)) {
          throw new Error("Invalid deleteMessage response");
        }

        if (!result.success) {
          addToast(
            t("message_delete_failed", {
              reason: result.error || "Unknown error"
            }),
            "error"
          );
          return;
        }

        const nextMessages = chatMessages.filter((msg) => msg.id !== messageId);
        setChatMessages(nextMessages);

        const lastMsg = nextMessages[nextMessages.length - 1];
        const lastText = lastMsg ? getMessageText(lastMsg) : "";
        updateSessionMeta(userId, currentSessionId, {
          lastMessage: lastText.slice(0, 50) + (lastText.length > 50 ? "..." : ""),
          timestamp: new Date().toISOString(),
          messageCount: nextMessages.length
        });
        setSessions(loadSessions(userId));
        enqueueSessionSync("delete_message");

        addToast(
          result.deleted ? t("message_delete_success") : t("message_already_deleted"),
          "success"
        );
      } catch (error) {
        console.error("Failed to delete message:", error);
        addToast(
          t("message_delete_failed", {
            reason: error instanceof Error ? error.message : "Unknown error"
          }),
          "error"
        );
      }
    },
    [
      addToast,
      chatMessages,
      chatTransport,
      currentSessionId,
      permissions.canEdit,
      enqueueSessionSync,
      setChatMessages,
      t,
      userId,
      setSessions
    ]
  );

  const handleEditMessage = useCallback(
    async (messageId: UIMessage["id"], content: string) => {
      if (!permissions.canEdit) {
        addToast(t("readonly_action_blocked"), "info");
        return;
      }
      try {
        const resolved = await chatTransport.editMessage(String(messageId), content);
        if (!isEditMessageResult(resolved)) {
          throw new Error("Invalid editUserMessage response");
        }
        if (!resolved.success) {
          throw new Error(resolved.error || "Edit message failed");
        }
        if (!resolved.updated) {
          addToast(t("message_edit_noop"), "info");
          return;
        }

        const nextMessages = chatMessages.map((message) => {
          if (message.id !== messageId || message.role !== "user" || !Array.isArray(message.parts)) {
            return message;
          }
          const nextParts = message.parts.map((part) => {
            if (part.type !== "text") return part;
            return { ...part, text: content };
          });
          return { ...message, parts: nextParts };
        });

        setChatMessages(nextMessages);
        addToast(t("message_edit_success"), "success");
      } catch (error) {
        console.error("Failed to edit message:", error);
        addToast(
          t("message_edit_failed", {
            reason: error instanceof Error ? error.message : "Unknown error"
          }),
          "error"
        );
      }
    },
    [addToast, chatMessages, chatTransport, permissions.canEdit, setChatMessages, t]
  );

  const handleRegenerateMessage = useCallback(
    async (messageId: UIMessage["id"]) => {
      if (!permissions.canEdit) {
        addToast(t("readonly_action_blocked"), "info");
        return;
      }
      trackChatEvent("message_regenerate", { messageId: String(messageId) });
      setAwaitingFirstAssistant(true);
      setAwaitingAssistantFromIndex(chatMessages.length);
      setLiveProgress([
        {
          id: nanoid(10),
          timestamp: new Date().toISOString(),
          phase: "context",
          message: t("message_actions_regenerate"),
          status: "start",
          severity: "low",
          groupKey: "context"
        }
      ]);
      try {
        const previousCount = chatMessages.length;
        const result = await chatTransport.regenerateMessage(String(messageId));
        if (!isRegenerateMessageResult(result)) {
          throw new Error("Invalid regenerateFrom response");
        }
        if (!result.success) {
          throw new Error(result.error || "Regenerate failed");
        }

        const history = await chatTransport.getHistory();
        let hydrated = false;
        if (Array.isArray(history)) {
          const mapped = history.map((item, index) => ({
            id: item.id ?? `history-${index}-${Date.now()}`,
            role:
              item.role === "user" || item.role === "assistant" || item.role === "system"
                ? item.role
                : "assistant",
            parts: [{ type: "text", text: item.content ?? "" }]
          })) as UIMessage[];
          setChatMessages(mapped);
          hydrated = mapped.length > previousCount;
        }
        if (!hydrated && typeof result.response === "string" && result.response.trim().length > 0) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: nanoid(),
              role: "assistant",
              parts: [{ type: "text", text: result.response }]
            } as UIMessage
          ]);
        }

        setAwaitingFirstAssistant(false);
        setAwaitingAssistantFromIndex(null);
        setLiveProgress([]);
        addToast(t("message_regenerate_success"), "success");
      } catch (error) {
        console.error("Failed to regenerate message:", error);
        setAwaitingFirstAssistant(false);
        setAwaitingAssistantFromIndex(null);
        addToast(
          t("message_regenerate_failed", {
            reason: error instanceof Error ? error.message : "Unknown error"
          }),
          "error"
        );
      }
    },
    [
      addToast,
      chatTransport,
      chatMessages.length,
      permissions.canEdit,
      setChatMessages,
      t,
      setAwaitingFirstAssistant,
      setAwaitingAssistantFromIndex,
      setLiveProgress
    ]
  );

  const handleFixChart = useCallback(
    async (messageId: UIMessage["id"], ctx: ChartFixContext) => {
      if (!permissions.canEdit) {
        addToast(t("readonly_action_blocked"), "info");
        return;
      }
      trackChatEvent("chart_fix_attempt", { engine: ctx.engine, chartType: ctx.chartType });
      try {
        const result = await chatTransport.fixChart(
          String(messageId),
          ctx.engine,
          ctx.chartType,
          ctx.brokenSpec,
          ctx.errorMessage
        );
        if (!isFixChartResult(result)) {
          throw new Error("Invalid fixChart response");
        }
        if (!result.success || !result.fixedSpec) {
          throw new Error(result.error || "Fix chart failed");
        }
        // Replace the broken spec inside the message text and update local state
        setChatMessages((prev) =>
          prev.map((msg) => {
            if (msg.id !== messageId || !Array.isArray(msg.parts)) return msg;
            const nextParts = msg.parts.map((part) => {
              if (part.type !== "text") return part;
              const fencedFixed = "```" + ctx.engine + "\n" + result.fixedSpec + "\n```";
              const escapedSpec = ctx.brokenSpec.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
              const pattern = new RegExp("```" + ctx.engine + "\\s*\\n" + escapedSpec + "\\n?```", "s");
              const replaced = (part.text as string).replace(pattern, fencedFixed);
              const newText = replaced !== part.text ? replaced : `${part.text}\n\n${fencedFixed}`;
              return { ...part, text: newText };
            });
            return { ...msg, parts: nextParts };
          })
        );
        addToast("图表已修复", "success");
      } catch (error) {
        console.error("Failed to fix chart:", error);
        addToast(
          `图表修复失败：${error instanceof Error ? error.message : "未知错误"}`,
          "error"
        );
      }
    },
    [addToast, chatTransport, permissions.canEdit, setChatMessages, t]
  );

  return {
    handleDeleteMessage,
    handleEditMessage,
    handleRegenerateMessage,
    handleFixChart
  };
}
