import { Toaster } from "./components/Toaster";
import { ModalHost } from "./components/modal";
import {
  ChatPane,
  InspectorPane,
  McpPane,
  MobileTabBar,
  TopBar,
  WorkspaceSidebar,
  type WorkspaceSection
} from "./components/layout";
import { PoweredByAgents, ThemeProvider, type ConnectionStatus } from "./components/AgentsUiCompat";
import { ToastProvider, useToast } from "./hooks/useToast";
import { I18nProvider, useI18n } from "./hooks/useI18n";
import { useResponsive } from "./hooks/useResponsive";
import { Tabs } from "./components/ui";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import { Badge } from "@cloudflare/kumo";
import { PlugIcon, ChatCircleIcon } from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import type { MCPServersState } from "agents";
import type { CommandSuggestionItem } from "./types/command";
import { extractMessageSources } from "./types/message-sources";
import { getMessageText } from "./utils/message-text";
import { nanoid } from "nanoid";
import { trackChatEvent } from "./features/chat/services/trackChatEvent";
import {
  loadCurrentSessionId,
  loadSessions,
  saveCurrentSessionId,
  updateSessionMeta,
  deleteSessionMeta,
  type SessionMeta
} from "./features/chat/services/sessionMeta";
import {
  appendLiveProgressEntry,
  parseLiveProgressPart,
  type LiveProgressEntry,
  type ProgressPhase
} from "./features/chat/services/progress";
import {
  isDeleteMessageResult,
  isEditMessageResult,
  isForkSessionResult,
  isRegenerateMessageResult,
  isToggleServerResult,
  type DeleteMessageResult,
  type EditMessageResult,
  type ForkSessionResult,
  type RegenerateMessageResult,
  type ToggleServerResult
} from "./features/chat/services/apiContracts";
import { buildCommandSuggestions } from "./features/chat/services/commandSuggestions";
import { useChatTelemetry } from "./features/chat/hooks/useChatTelemetry";
import { useEventLog } from "./features/chat/hooks/useEventLog";
import { buildObservabilitySnapshot } from "./features/chat/services/observability";
import { callApi } from "./features/chat/services/apiClient";
import "./styles.css";

// ============ Main App ============

type Tab = "chat" | "mcp";

interface PreconfiguredServer {
  config: {
    name: string;
    url: string;
    description: string;
  };
  serverId?: string;
  connected: boolean;
  error?: string;
}

interface ConnectionPermissions {
  canEdit: boolean;
  readonly: boolean;
}

interface ChatHistoryItem {
  role: string;
  content: string;
  id?: string;
}

function readPreconfiguredServersFromState(
  state: unknown
): Record<string, PreconfiguredServer> | null {
  if (!state || typeof state !== "object") return null;
  const candidate = state as {
    mcp?: { preconfiguredServers?: Record<string, PreconfiguredServer> };
  };
  const servers = candidate.mcp?.preconfiguredServers;
  if (!servers || typeof servers !== "object") return null;
  return servers;
}

function isReadonlyModeQueryEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("mode") === "view";
}

function App() {
  const { addToast } = useToast();
  const { t, lang, setLang } = useI18n();

  // Session state
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    const saved = loadCurrentSessionId();
    if (saved) return saved;
    const id = nanoid(8);
    saveCurrentSessionId(id);
    return id;
  });

  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>("chats");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
  const readonlyMode = useMemo(() => isReadonlyModeQueryEnabled(), []);
  const [permissions, setPermissions] = useState<ConnectionPermissions>({
    canEdit: !readonlyMode,
    readonly: readonlyMode
  });
  const [mcpState, setMcpState] = useState<MCPServersState>({
    prompts: [],
    resources: [],
    servers: {},
    tools: []
  });
  const [isLoading, setIsLoading] = useState(true);
  const [togglingServer, setTogglingServer] = useState<string | null>(null);
  const [preconfiguredServers, setPreconfiguredServers] = useState<
    Record<string, PreconfiguredServer>
  >({});
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { events: eventLogs, addEvent: addEventLog, clear: clearEventLogs } = useEventLog();

  // Responsive hook for mobile detection
  const { mobile } = useResponsive();

  // On mobile, sidebar starts closed
  useEffect(() => {
    if (mobile) {
      setSidebarOpen(false);
    }
  }, [mobile]);

  useEffect(() => {
    if (!mobile) {
      document.body.style.overflow = "";
      return;
    }
    document.body.style.overflow = sidebarOpen ? "hidden" : "";
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobile, sidebarOpen]);

  // Chat input
  const [input, setInput] = useState("");
  const [liveProgress, setLiveProgress] = useState<LiveProgressEntry[]>([]);
  const [awaitingFirstAssistant, setAwaitingFirstAssistant] = useState(false);
  const [awaitingAssistantFromIndex, setAwaitingAssistantFromIndex] = useState<number | null>(null);

  // Load sessions on mount
  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  // Save current session ID when changed
  useEffect(() => {
    saveCurrentSessionId(currentSessionId);
  }, [currentSessionId]);

  // Agent connection
  const agent = useAgent({
    agent: "chat-agent-v2",
    name: currentSessionId,
    query: readonlyMode ? { mode: "view" } : undefined,
    onClose: useCallback(() => {
      setConnectionStatus("disconnected");
      addEventLog({
        level: "error",
        source: "system",
        type: "connection_closed",
        message: "Agent connection closed."
      });
    }, [addEventLog]),
    onMcpUpdate: useCallback((mcpServers: MCPServersState) => {
      setMcpState(mcpServers);
    }, []),
    onStateUpdate: useCallback((nextState: unknown) => {
      const servers = readPreconfiguredServersFromState(nextState);
      if (!servers) return;
      setPreconfiguredServers(servers);
      setIsLoading(false);
    }, []),
    onOpen: useCallback(() => {
      setConnectionStatus("connected");
      addEventLog({
        level: "success",
        source: "system",
        type: "connection_open",
        message: "Agent connection established."
      });
    }, [addEventLog])
  });

  // useAgentChat hook for AIChatAgent integration
  const { messages, sendMessage, status, stop, setMessages } = useAgentChat({
    agent,
    resume: true,
    onToolCall: async ({ toolCall }) => {
      // Handle client-side tools if needed
      console.log("Tool call:", toolCall);
    },
    onData: (part) => {
      const progress = parseLiveProgressPart(part);
      if (!progress) return;
      setLiveProgress((prev) => appendLiveProgressEntry(prev, progress, 2));
      addEventLog({
        level: progress.status === "error" ? "error" : progress.status === "success" ? "success" : "info",
        source: "agent",
        type: `progress_${progress.phase}`,
        message: progress.message,
        data: progress.snippet ? { snippet: progress.snippet } : undefined,
        timestamp: progress.timestamp
      });
    }
  });

  const isStreaming = status === "streaming";
  const isConnected = connectionStatus === "connected";
  const chatMessages = messages;
  const setChatMessages = useCallback(
    (next: UIMessage[] | ((prev: UIMessage[]) => UIMessage[])) => {
      setMessages((prev) => (typeof next === "function" ? next(prev) : next));
    },
    [setMessages]
  );

  const callApiWithAgentFallback = useCallback(
    async <T,>(apiCall: () => Promise<T>, agentCall: () => Promise<T>): Promise<T> => {
      try {
        return await apiCall();
      } catch (apiError) {
        console.warn("API call failed, fallback to agent.call:", apiError);
        return await agentCall();
      }
    },
    []
  );

  const loadPermissions = useCallback(async () => {
    try {
      const next = await callApiWithAgentFallback(
        async () => {
          const response = await callApi<{
            canEdit: boolean;
            readonly: boolean;
          }>(
            `/api/chat/permissions?sessionId=${encodeURIComponent(currentSessionId)}${
              readonlyMode ? "&mode=view" : ""
            }`
          );
          return {
            canEdit: response.canEdit,
            readonly: response.readonly
          };
        },
        async () => {
          return (await agent.call("getPermissions", [])) as ConnectionPermissions;
        }
      );
      setPermissions({
        canEdit: Boolean(next.canEdit),
        readonly: Boolean(next.readonly)
      });
    } catch (error) {
      console.error("Failed to load connection permissions:", error);
      setPermissions({ canEdit: !readonlyMode, readonly: readonlyMode });
    }
  }, [agent, callApiWithAgentFallback, currentSessionId, readonlyMode]);

  const loadHistory = useCallback(async (): Promise<ChatHistoryItem[]> => {
    return await callApiWithAgentFallback(
      async () => {
        const response = await callApi<{ history: ChatHistoryItem[] }>(
          `/api/chat/history?sessionId=${encodeURIComponent(currentSessionId)}`
        );
        return Array.isArray(response.history) ? response.history : [];
      },
      async () => (await agent.call("getHistory", [])) as ChatHistoryItem[]
    );
  }, [agent, callApiWithAgentFallback, currentSessionId]);

  const loadPreconfiguredServers = useCallback(
    async (attempt = 0) => {
      try {
        const servers = await callApiWithAgentFallback(
          async () => {
            const response = await callApi<{
              servers: Record<string, PreconfiguredServer>;
            }>(`/api/mcp/servers?sessionId=${encodeURIComponent(currentSessionId)}`);
            return response.servers;
          },
          async () =>
            (await agent.call("getPreconfiguredServers", [])) as Record<string, PreconfiguredServer>
        );
        setPreconfiguredServers(servers);
        setIsLoading(false);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const isConnectionIssue = /connection closed/i.test(message);
        if (isConnectionIssue && attempt < 3) {
          const delay = 300 * (attempt + 1);
          setTimeout(() => {
            void loadPreconfiguredServers(attempt + 1);
          }, delay);
          return;
        }
        console.error("Failed to load pre-configured servers:", error);
        setIsLoading(false);
      }
    },
    [agent, callApiWithAgentFallback, currentSessionId]
  );

  // Load preconfigured servers only after confirmed connected state.
  useEffect(() => {
    if (connectionStatus !== "connected") return;
    void loadPermissions();
  }, [connectionStatus, loadPermissions]);

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    if (Object.keys(preconfiguredServers).length > 0) {
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void loadPreconfiguredServers();
  }, [connectionStatus, loadPreconfiguredServers, preconfiguredServers]);

  // Hide live progress panel once assistant content starts arriving.
  useEffect(() => {
    if (!awaitingFirstAssistant) return;
    if (awaitingAssistantFromIndex === null) return;
    const hasAssistantContent = chatMessages.some(
      (msg, index) =>
        index >= awaitingAssistantFromIndex &&
        msg.role === "assistant" &&
        getMessageText(msg)
          // Ignore invisible keepalive/control characters.
          .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
          .trim().length > 0
    );
    // Keep live feed visible while the current reply is still streaming,
    // then close it after stream completion.
    if (hasAssistantContent && status !== "streaming") {
      setAwaitingFirstAssistant(false);
      setAwaitingAssistantFromIndex(null);
      setLiveProgress([]);
    }
  }, [chatMessages, awaitingFirstAssistant, awaitingAssistantFromIndex, status]);

  // Update session meta when messages change
  useEffect(() => {
    if (chatMessages.length > 0) {
      const lastMsg = chatMessages[chatMessages.length - 1];
      const text = getMessageText(lastMsg);

      // Only update on assistant messages
      if (lastMsg.role === "assistant" && text) {
        const firstUserMsg = chatMessages.find((m) => m.role === "user");
        const title = firstUserMsg
          ? getMessageText(firstUserMsg).slice(0, 30) +
            (getMessageText(firstUserMsg).length > 30 ? "..." : "")
          : "New Chat";

        updateSessionMeta(currentSessionId, {
          title,
          lastMessage: text.slice(0, 50) + (text.length > 50 ? "..." : ""),
          timestamp: new Date().toISOString(),
          messageCount: chatMessages.length
        });
        setSessions(loadSessions());
      }
    }
  }, [chatMessages, currentSessionId]);

  // Create new session
  const handleNewSession = useCallback(() => {
    const newId = nanoid(8);
    stop();
    setChatMessages([]);
    updateSessionMeta(newId, {
      title: t("session_new"),
      lastMessage: "",
      timestamp: new Date().toISOString(),
      messageCount: 0
    });
    setSessions(loadSessions());
    setCurrentSessionId(newId);
    setConnectionStatus("connecting");
    setPermissions({ canEdit: !readonlyMode, readonly: readonlyMode });
    setAwaitingFirstAssistant(false);
    setAwaitingAssistantFromIndex(null);
    setLiveProgress([]);
  }, [readonlyMode, setChatMessages, stop, t]);

  // Switch session
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId === currentSessionId) return;
      stop();
      setChatMessages([]);
      setCurrentSessionId(sessionId);
      setConnectionStatus("connecting");
      setPermissions({ canEdit: !readonlyMode, readonly: readonlyMode });
      setAwaitingFirstAssistant(false);
      setAwaitingAssistantFromIndex(null);
      setLiveProgress([]);
    },
    [currentSessionId, readonlyMode, setChatMessages, stop]
  );

  // Delete session
  const handleDeleteSession = useCallback(
    (sessionId: string) => {
      deleteSessionMeta(sessionId);
      setSessions(loadSessions());

      if (sessionId === currentSessionId) {
        handleNewSession();
      }

      addToast(t("session_deleted"), "success");
    },
    [currentSessionId, handleNewSession, addToast, t]
  );

  const handleDeleteMessage = useCallback(
    async (messageId: UIMessage["id"]) => {
      if (!permissions.canEdit) {
        addToast(t("readonly_action_blocked"), "info");
        return;
      }
      try {
        const result = await callApiWithAgentFallback(
          async () => {
            const response = await callApi<DeleteMessageResult>(
              `/api/chat/message?sessionId=${encodeURIComponent(currentSessionId)}&messageId=${encodeURIComponent(
                String(messageId)
              )}`,
              {
                method: "DELETE"
              }
            );
            return {
              success: response.success,
              deleted: response.deleted,
              error: response.error
            } as DeleteMessageResult;
          },
          async () => (await agent.call("deleteMessage", [messageId])) as DeleteMessageResult
        );
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
        updateSessionMeta(currentSessionId, {
          lastMessage: lastText.slice(0, 50) + (lastText.length > 50 ? "..." : ""),
          timestamp: new Date().toISOString(),
          messageCount: nextMessages.length
        });
        setSessions(loadSessions());

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
    [agent, addToast, callApiWithAgentFallback, chatMessages, currentSessionId, permissions.canEdit, setChatMessages, t]
  );

  const handleEditMessage = useCallback(
    async (messageId: UIMessage["id"], content: string) => {
      if (!permissions.canEdit) {
        addToast(t("readonly_action_blocked"), "info");
        return;
      }
      try {
        const resolved = await callApiWithAgentFallback(
          async () => {
            const response = await callApi<EditMessageResult>("/api/chat/edit", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sessionId: currentSessionId,
                messageId,
                content
              })
            });
            return {
              success: response.success,
              updated: response.updated,
              error: response.error
            } as EditMessageResult;
          },
          async () =>
            (await agent.call("editUserMessage", [messageId, content])) as EditMessageResult
        );
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
    [agent, addToast, callApiWithAgentFallback, chatMessages, currentSessionId, permissions.canEdit, setChatMessages, t]
  );

  const handleRegenerateMessage = useCallback(
    async (messageId: UIMessage["id"]) => {
      if (!permissions.canEdit) {
        addToast(t("readonly_action_blocked"), "info");
        return;
      }
      trackChatEvent("message_regenerate", { messageId });
      try {
        const result = await callApiWithAgentFallback(
          async () => {
            const response = await callApi<RegenerateMessageResult>("/api/chat/regenerate", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sessionId: currentSessionId,
                messageId
              })
            });
            return {
              success: response.success,
              response: response.response,
              error: response.error
            } as RegenerateMessageResult;
          },
          async () => (await agent.call("regenerateFrom", [messageId])) as RegenerateMessageResult
        );
        if (!isRegenerateMessageResult(result)) {
          throw new Error("Invalid regenerateFrom response");
        }
        if (!result.success) {
          throw new Error(result.error || "Regenerate failed");
        }

        const history = await loadHistory();
        if (Array.isArray(history)) {
          setChatMessages(
            history.map((item, index) => ({
              id: item.id ?? `history-${index}-${Date.now()}`,
              role:
                item.role === "user" || item.role === "assistant" || item.role === "system"
                  ? item.role
                  : "assistant",
              parts: [{ type: "text", text: item.content ?? "" }]
            })) as UIMessage[]
          );
        } else if (result.response !== undefined) {
          setChatMessages((prev) => [
            ...prev,
            {
              id: nanoid(),
              role: "assistant",
              parts: [{ type: "text", text: result.response }]
            } as UIMessage
          ]);
        }

        addToast(t("message_regenerate_success"), "success");
      } catch (error) {
        console.error("Failed to regenerate message:", error);
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
      agent,
      callApiWithAgentFallback,
      currentSessionId,
      loadHistory,
      permissions.canEdit,
      setChatMessages,
      t
    ]
  );

  const handleForkSession = useCallback(
    async (messageId: UIMessage["id"]) => {
      if (!permissions.canEdit) {
        addToast(t("readonly_action_blocked"), "info");
        return;
      }
      try {
        const result = await callApiWithAgentFallback(
          async () => {
            const response = await callApi<ForkSessionResult>("/api/chat/fork", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sessionId: currentSessionId,
                messageId
              })
            });
            return {
              success: response.success,
              newSessionId: response.newSessionId,
              error: response.error
            } as ForkSessionResult;
          },
          async () => (await agent.call("forkSession", [messageId])) as ForkSessionResult
        );
        if (!isForkSessionResult(result)) {
          throw new Error("Invalid forkSession response");
        }
        if (!result.success || !result.newSessionId) {
          throw new Error(result.error || "Fork session failed");
        }

        updateSessionMeta(result.newSessionId, {
          title: t("session_fork_title"),
          lastMessage: "",
          timestamp: new Date().toISOString(),
          messageCount: 0
        });
        setSessions(loadSessions());
        setCurrentSessionId(result.newSessionId);
        setConnectionStatus("connecting");
        setPermissions({ canEdit: !readonlyMode, readonly: readonlyMode });
        addToast(t("message_fork_success"), "success");
      } catch (error) {
        console.error("Failed to fork session:", error);
        addToast(
          t("message_fork_failed", {
            reason: error instanceof Error ? error.message : "Unknown error"
          }),
          "error"
        );
      }
    },
    [agent, addToast, callApiWithAgentFallback, currentSessionId, permissions.canEdit, readonlyMode, t]
  );

  const handleToggleServer = useCallback(
    async (name: string) => {
      if (!permissions.canEdit) {
        addToast(t("readonly_action_blocked"), "info");
        return;
      }
      setTogglingServer(name);
      trackChatEvent("mcp_toggle", { name });
      try {
        const result = await callApiWithAgentFallback(
          async () => {
            const response = await callApi<ToggleServerResult>("/api/mcp/toggle", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                sessionId: currentSessionId,
                name
              })
            });
            return {
              success: response.success,
              active: response.active,
              error: response.error,
              stateVersion: response.stateVersion
            } as ToggleServerResult;
          },
          async () => (await agent.call("toggleServer", [name])) as ToggleServerResult
        );
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
          await loadPreconfiguredServers();
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
      } finally {
        setTogglingServer(null);
      }
    },
    [agent, addEventLog, addToast, callApiWithAgentFallback, currentSessionId, loadPreconfiguredServers, permissions.canEdit, t]
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

    setInput("");
    setAwaitingFirstAssistant(true);
    setAwaitingAssistantFromIndex(chatMessages.length);
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
    chatMessages.length,
    stop,
    permissions.canEdit,
    t
  ]);

  const handleStop = useCallback(() => {
    stop();
    setAwaitingFirstAssistant(false);
    setAwaitingAssistantFromIndex(null);
    trackChatEvent("composer_stop", { sessionId: currentSessionId });
  }, [currentSessionId, stop]);

  const serverEntries = useMemo(() => Object.entries(mcpState.servers), [mcpState.servers]);
  const connectedServerCount = useMemo(
    () => Object.values(preconfiguredServers).filter((server) => server.connected).length,
    [preconfiguredServers]
  );
  const totalServerCount = useMemo(
    () => Object.keys(preconfiguredServers).length,
    [preconfiguredServers]
  );
  const telemetry = useChatTelemetry();
  const telemetrySummary = useMemo(() => buildObservabilitySnapshot(telemetry), [telemetry]);

  const preconfiguredServerList = useMemo(
    () => Object.entries(preconfiguredServers),
    [preconfiguredServers]
  );

  const activeToolsCount = mcpState.tools.length;
  const commandSuggestions = useMemo<CommandSuggestionItem[]>(
    () =>
      buildCommandSuggestions({
        tools: mcpState.tools,
        sessions,
        t
      }),
    [mcpState.tools, sessions, t]
  );

  const phaseLabels: Record<ProgressPhase, string> = {
    context: t("live_feed_phase_context"),
    model: t("live_feed_phase_model"),
    thinking: t("live_feed_phase_thinking"),
    tool: t("live_feed_phase_tool"),
    heartbeat: t("live_feed_phase_heartbeat"),
    result: t("live_feed_phase_result"),
    error: t("live_feed_phase_error")
  };

  const sourceGroupsCount = useMemo(
    () =>
      chatMessages.reduce((sum, message) => {
        return sum + extractMessageSources(message.parts).length;
      }, 0),
    [chatMessages]
  );

  // Format relative time
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return "now";
    if (minutes < 60) return `${minutes}m`;
    if (hours < 24) return `${hours}h`;
    if (days < 7) return `${days}d`;
    return date.toLocaleDateString();
  };

  return (
    <div className="flex h-full bg-kumo-base/70 text-kumo-default">
      {mobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "var(--app-overlay)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <WorkspaceSidebar
        mobile={mobile}
        sidebarOpen={sidebarOpen}
        sessions={sessions}
        currentSessionId={currentSessionId}
        section={workspaceSection}
        onSectionChange={setWorkspaceSection}
        onClose={() => setSidebarOpen(false)}
        onNewSession={() => {
          handleNewSession();
          if (mobile) {
            setSidebarOpen(false);
          }
        }}
        onSelectSession={(sessionId) => {
          handleSelectSession(sessionId);
          if (mobile) {
            setSidebarOpen(false);
          }
        }}
        onDeleteSession={handleDeleteSession}
        formatTime={formatTime}
        toolsCount={mcpState.tools.length}
        resourcesCount={mcpState.resources.length}
        observability={{
          toolsCount: mcpState.tools.length,
          sourcesCount: sourceGroupsCount,
          liveProgress,
          telemetry,
          telemetrySummary
        }}
        lang={lang}
        setLang={setLang}
        t={t}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar
          mobile={mobile}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          onNewSession={handleNewSession}
          connectionStatus={connectionStatus}
          t={t}
        />

        {!mobile && (
          <div className="app-glass border-b border-kumo-line/80 bg-kumo-base/55 px-3 sm:px-5">
            <Tabs
              value={activeTab}
              onChange={setActiveTab}
              ariaLabel={t("tabs_label")}
              items={[
                {
                  value: "chat",
                  icon: <ChatCircleIcon size={18} weight="bold" />,
                  label: t("tabs_chat"),
                  badge:
                    activeToolsCount > 0 ? (
                      <Badge variant="primary">
                        {t("tabs_tools_count", { count: String(activeToolsCount) })}
                      </Badge>
                    ) : undefined
                },
                {
                  value: "mcp",
                  icon: <PlugIcon size={18} weight="bold" />,
                  label: t("tabs_mcp"),
                  badge:
                    serverEntries.length > 0 ? (
                      <Badge variant="secondary">{serverEntries.length}</Badge>
                    ) : undefined
                }
              ]}
            />
          </div>
        )}

        <div className="flex min-h-0 flex-1">
          <main className="min-h-0 min-w-0 flex-1">
            {activeTab === "chat" ? (
              <ChatPane
                messages={chatMessages}
                isStreaming={isStreaming}
                isConnected={isConnected}
                canEdit={permissions.canEdit}
                isReadonly={permissions.readonly}
                activeToolsCount={activeToolsCount}
                mcpConnectedServers={connectedServerCount}
                mcpTotalServers={totalServerCount}
                awaitingFirstAssistant={awaitingFirstAssistant}
                liveProgress={liveProgress}
                phaseLabels={phaseLabels}
                input={input}
                setInput={setInput}
                commandSuggestions={commandSuggestions}
                onSend={handleSend}
                onStop={handleStop}
                onRetryConnection={() => {
                  setConnectionStatus("connecting");
                  void loadPreconfiguredServers();
                }}
                onDeleteMessage={handleDeleteMessage}
                onEditMessage={handleEditMessage}
                onRegenerateMessage={handleRegenerateMessage}
                onForkMessage={handleForkSession}
                t={t}
                getMessageText={getMessageText}
              />
            ) : (
              <McpPane
                isLoading={isLoading}
                preconfiguredServerList={preconfiguredServerList}
                togglingServer={togglingServer}
                onToggleServer={handleToggleServer}
                canEdit={permissions.canEdit}
                mcpTools={mcpState.tools}
                t={t}
              />
            )}
          </main>
          <InspectorPane
            toolsCount={activeToolsCount}
            sourcesCount={sourceGroupsCount}
            liveProgress={liveProgress}
            telemetry={telemetry}
            telemetrySummary={telemetrySummary}
            eventLogs={eventLogs}
            onClearEventLogs={clearEventLogs}
            t={t}
          />
        </div>

        <footer className={`app-glass shrink-0 border-t border-kumo-line/80 bg-kumo-base/55 py-3 ${mobile ? "pb-16" : ""}`}>
          <div className="flex justify-center">
            <PoweredByAgents label={t("app_powered_by")} />
          </div>
        </footer>
      </div>

      {mobile && (
        <MobileTabBar
          value={activeTab}
          onChange={setActiveTab}
          labels={{ chat: t("tabs_chat"), mcp: t("tabs_mcp") }}
        />
      )}
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <I18nProvider>
      <ToastProvider>
        <App />
        <Toaster />
        <ModalHost />
      </ToastProvider>
    </I18nProvider>
  </ThemeProvider>
);
