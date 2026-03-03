import { useCallback } from "react";
import { nanoid } from "nanoid";
import { trackChatEvent } from "../services/trackChatEvent";
import { isToggleServerResult } from "../services/apiContracts";
import type { SessionMeta } from "../services/sessionMeta";
import type { EventLogEntry } from "../hooks/useEventLog";
import type { UiMessageKey } from "../../../i18n/ui";
import type { TranslateParams } from "../../../hooks/useI18n";
import type { LiveProgressEntry, ProgressPhase } from "../services/progress";

interface UseChatActionsParams {
  currentSessionId: string;
  permissions: { canEdit: boolean; readonly: boolean };
  chatTransport: {
    toggleServer: (name: string) => Promise<unknown>;
  };
  addEventLog: (event: Omit<EventLogEntry, "id" | "timestamp"> & { timestamp?: string }) => void;
  addToast: (message: string, type: "success" | "error" | "info") => void;
  t: (key: UiMessageKey, params?: TranslateParams) => string;
  input: string;
  setInput: (input: string) => void;
  isStreaming: boolean;
  sessions: SessionMeta[];
  chatMessagesLength: number;
  sendMessage: (message: { role: "user"; parts: [{ type: "text"; text: string }] }) => void;
  stop: () => void;
  handleNewSession: () => void;
  handleSelectSession: (sessionId: string) => void;
  setAwaitingFirstAssistant: (value: boolean) => void;
  setAwaitingAssistantFromIndex: (value: number | null) => void;
  setLiveProgress: React.Dispatch<React.SetStateAction<LiveProgressEntry[]>>;
}

export interface UseChatActionsResult {
  handleToggleServer: (name: string) => Promise<void>;
  handleSend: () => void;
  handleStop: () => void;
  getPhaseLabels: (t: (key: UiMessageKey, params?: TranslateParams) => string) => Record<ProgressPhase, string>;
}

export function useChatActions(
  params: UseChatActionsParams
): UseChatActionsResult {
  const {
    currentSessionId,
    permissions,
    chatTransport,
    addEventLog,
    addToast,
    t,
    input,
    setInput,
    isStreaming,
    sessions,
    chatMessagesLength,
    sendMessage,
    stop,
    handleNewSession,
    handleSelectSession,
    setAwaitingFirstAssistant,
    setAwaitingAssistantFromIndex,
    setLiveProgress
  } = params;

  const handleToggleServer = useCallback(
    async (name: string) => {
      if (!permissions.canEdit) {
        addToast(t("readonly_action_blocked"), "info");
        return;
      }
      trackChatEvent("mcp_toggle", { name });
      try {
        const result = await chatTransport.toggleServer(name);
        if (!isToggleServerResult(result)) {
          throw new Error("Invalid toggleServer response");
        }
        if (result.success) {
          addEventLog({
            level: "success",
            source: "client",
            type: "mcp_toggle_success",
            message: `Server ${name} toggled to ${result.active ? "active" : "inactive"}.`
          });
          addToast(
            t("server_toggle_success", {
              name,
              state: result.active ? t("server_toggle_active") : t("server_toggle_inactive")
            }),
            "success"
          );
        } else {
          addEventLog({
            level: "error",
            source: "client",
            type: "mcp_toggle_failed",
            message: result.error || "Toggle failed"
          });
          addToast(
            t("server_toggle_failed", {
              reason: result.error || "Unknown error"
            }),
            "error"
          );
        }
      } catch (error) {
        console.error("Failed to toggle server:", error);
        addEventLog({
          level: "error",
          source: "client",
          type: "mcp_toggle_failed",
          message: error instanceof Error ? error.message : "Unknown error"
        });
        addToast(
          t("server_toggle_failed", {
            reason: error instanceof Error ? error.message : "Unknown error"
          }),
          "error"
        );
      }
    },
    [addEventLog, addToast, chatTransport, permissions.canEdit, t]
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;
    if (!permissions.canEdit) {
      addToast(t("readonly_action_blocked"), "info");
      return;
    }
    trackChatEvent("composer_send", { sessionId: currentSessionId, length: text.length });

    if (text.includes("!new")) {
      handleNewSession();
      setInput("");
      addToast(t("session_new"), "success");
      return;
    }

    if (text.includes("!stop")) {
      stop();
      setInput("");
      setAwaitingFirstAssistant(false);
      setAwaitingAssistantFromIndex(null);
      addToast(t("chat_input_action_stop"), "success");
      return;
    }

    const sessionToken = text.match(/#([a-zA-Z0-9_-]{6,})/);
    if (sessionToken) {
      const targetSession = sessions.find((session) => session.id === sessionToken[1]);
      if (targetSession) {
        handleSelectSession(targetSession.id);
        setInput("");
        return;
      }
    }

    const slashCommand = text.match(/^\/(\w+)(?:\s+(.*))?$/);
    if (slashCommand) {
      const command = slashCommand[1].toLowerCase();

      switch (command) {
        case "help":
          addToast("Available commands: /help, /clear, /export, /new, /stop", "info");
          setInput("");
          return;
        case "clear":
          if (permissions.canEdit) {
            handleNewSession();
            setInput("");
            addToast("Chat cleared", "success");
          } else {
            addToast(t("readonly_action_blocked"), "info");
          }
          return;
        case "export":
          addToast("Export feature - use the download toolbar", "info");
          setInput("");
          return;
        case "new":
          handleNewSession();
          setInput("");
          addToast(t("session_new"), "success");
          return;
        case "stop":
          stop();
          setInput("");
          setAwaitingFirstAssistant(false);
          setAwaitingAssistantFromIndex(null);
          addToast(t("chat_input_action_stop"), "success");
          return;
        default:
          break;
      }
    }

    setInput("");
    setAwaitingFirstAssistant(true);
    setAwaitingAssistantFromIndex(chatMessagesLength);
    addEventLog({
      level: "info",
      source: "client",
      type: "chat_send",
      message: "User message sent.",
      data: {
        sessionId: currentSessionId,
        length: text.length
      }
    });
    setLiveProgress([
      {
        id: nanoid(10),
        timestamp: new Date().toISOString(),
        phase: "context",
        message: t("live_feed_sent"),
        status: "start",
        severity: "low",
        groupKey: "context"
      }
    ]);
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
  }, [
    addEventLog,
    addToast,
    handleNewSession,
    handleSelectSession,
    input,
    isStreaming,
    currentSessionId,
    sendMessage,
    sessions,
    chatMessagesLength,
    stop,
    permissions.canEdit,
    t,
    setInput,
    setAwaitingFirstAssistant,
    setAwaitingAssistantFromIndex,
    setLiveProgress
  ]);

  const handleStop = useCallback(() => {
    stop();
    setAwaitingFirstAssistant(false);
    setAwaitingAssistantFromIndex(null);
    trackChatEvent("composer_stop", { sessionId: currentSessionId });
  }, [currentSessionId, stop, setAwaitingFirstAssistant, setAwaitingAssistantFromIndex]);

  const getPhaseLabels = useCallback(
    (tFn: (key: UiMessageKey, params?: TranslateParams) => string): Record<ProgressPhase, string> => ({
      context: tFn("live_feed_phase_context"),
      model: tFn("live_feed_phase_model"),
      thinking: tFn("live_feed_phase_thinking"),
      tool: tFn("live_feed_phase_tool"),
      heartbeat: tFn("live_feed_phase_heartbeat"),
      result: tFn("live_feed_phase_result"),
      error: tFn("live_feed_phase_error")
    }),
    []
  );

  return {
    handleToggleServer,
    handleSend,
    handleStop,
    getPhaseLabels
  };
}
