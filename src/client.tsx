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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  saveSessions,
  updateSessionMeta,
  deleteSessionMeta,
  remapSessionMeta,
  type SessionMeta
} from "./features/chat/services/sessionMeta";
import { callApi } from "./features/chat/services/apiClient";
import {
  appendLiveProgressEntry,
  parseLiveProgressPart,
  type LiveProgressEntry,
  type ProgressPhase
} from "./features/chat/services/progress";
import {
  isDeleteSessionResult,
  isDeleteMessageResult,
  isEditMessageResult,
  isForkSessionResult,
  isRegenerateMessageResult,
  isToggleServerResult
} from "./features/chat/services/apiContracts";
import { getNextSessionAfterDelete } from "./features/chat/services/sessionSelection";
import { buildCommandSuggestions } from "./features/chat/services/commandSuggestions";
import { useChatTelemetry } from "./features/chat/hooks/useChatTelemetry";
import { useEventLog } from "./features/chat/hooks/useEventLog";
import { buildObservabilitySnapshot } from "./features/chat/services/observability";
import {
  createChatTransport,
  type ChatHistoryItem,
  type ConnectionPermissions,
  type PreconfiguredServer
} from "./features/chat/services/chatTransport";
import "./styles.css";

// ============ Main App ============

type Tab = "chat" | "mcp";

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

function readPendingApprovalsFromState(state: unknown): RuntimeApprovalItem[] | null {
  if (!state || typeof state !== "object") return null;
  const candidate = state as {
    runtime?: {
      approvals?: Array<{
        id?: unknown;
        toolName?: unknown;
        argsSnippet?: unknown;
        status?: unknown;
        createdAt?: unknown;
      }>;
    };
  };
  const approvals = candidate.runtime?.approvals;
  if (!Array.isArray(approvals)) return null;

  return approvals
    .filter((item): item is RuntimeApprovalItem => {
      return (
        typeof item.id === "string" &&
        typeof item.toolName === "string" &&
        typeof item.argsSnippet === "string" &&
        (item.status === "pending" || item.status === "approved" || item.status === "rejected") &&
        typeof item.createdAt === "string"
      );
    })
    .filter((item) => item.status === "pending");
}

function isReadonlyModeQueryEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("mode") === "view";
}

function buildHistorySignature(history: ChatHistoryItem[]): string {
  return history
    .map((item) => `${item.id ?? ""}|${item.role}|${item.content ?? ""}`)
    .join("\u001f");
}

interface RuntimeApprovalItem {
  id: string;
  toolName: string;
  argsSnippet: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
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
  const [pendingApprovals, setPendingApprovals] = useState<RuntimeApprovalItem[]>([]);
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
  const hasReconciledSessionsRef = useRef(false);
  const loadHistoryRef = useRef<() => Promise<ChatHistoryItem[]>>(async () => []);
  const hydrateCooldownRef = useRef<{ sessionId: string; at: number } | null>(null);
  const lastHydratedSignatureRef = useRef<{ sessionId: string; signature: string } | null>(null);

  // Save current session ID when changed
  useEffect(() => {
    saveCurrentSessionId(currentSessionId);
  }, [currentSessionId]);

  // Agent connection
  const agent = useAgent({
    agent: "chat-agent-v2",
    name: currentSessionId,
    query: readonlyMode ? { mode: "view" } : undefined,
    onIdentity: useCallback(
      (resolvedSessionId: string) => {
        const normalized = resolvedSessionId.trim();
        if (!normalized || normalized === currentSessionId) return;

        remapSessionMeta(currentSessionId, normalized);
        setSessions(loadSessions());
        setCurrentSessionId(normalized);
        saveCurrentSessionId(normalized);
        setConnectionStatus("connecting");
        setPermissions({ canEdit: !readonlyMode, readonly: readonlyMode });
        setIsLoading(true);
        setPendingApprovals([]);
        setAwaitingFirstAssistant(false);
        setAwaitingAssistantFromIndex(null);
        setLiveProgress([]);
        addEventLog({
          level: "info",
          source: "system",
          type: "session_identity_remap",
          message: `Session identity remapped from ${currentSessionId} to ${normalized}.`,
          data: {
            previousSessionId: currentSessionId,
            resolvedSessionId: normalized
          }
        });
      },
      [addEventLog, currentSessionId, readonlyMode]
    ),
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
      if (servers) {
        setPreconfiguredServers(servers);
        setIsLoading(false);
      }
      const approvals = readPendingApprovalsFromState(nextState);
      if (approvals) {
        setPendingApprovals(approvals);
      }
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

  const chatTransport = useMemo(
    () =>
      createChatTransport({
        agent,
        sessionId: currentSessionId,
        readonlyMode
      }),
    [agent, currentSessionId, readonlyMode]
  );

  const loadPermissions = useCallback(async () => {
    try {
      const next = await chatTransport.getPermissions();
      setPermissions({
        canEdit: Boolean(next.canEdit),
        readonly: Boolean(next.readonly)
      });
    } catch (error) {
      console.error("Failed to load connection permissions:", error);
      setPermissions({ canEdit: !readonlyMode, readonly: readonlyMode });
    }
  }, [chatTransport, readonlyMode]);

  const loadHistory = useCallback(async (): Promise<ChatHistoryItem[]> => {
    return await chatTransport.getHistory();
  }, [chatTransport]);

  useEffect(() => {
    loadHistoryRef.current = loadHistory;
  }, [loadHistory]);

  // Reconcile local session metadata with server history on startup.
  useEffect(() => {
    if (hasReconciledSessionsRef.current) return;
    hasReconciledSessionsRef.current = true;

    let cancelled = false;

    const fetchHistoryForSession = async (sessionId: string): Promise<ChatHistoryItem[]> => {
      const response = await callApi<{ history: ChatHistoryItem[] }>(
        `/api/chat/history?sessionId=${encodeURIComponent(sessionId)}`
      );
      return Array.isArray(response.history) ? response.history : [];
    };

    const reconcileSessions = async () => {
      const stored = loadSessions();
      setSessions(stored);
      if (stored.length === 0) return;

      const validSessionIds = new Set<string>();
      const workers = Array.from({ length: 3 }, async (_, workerIndex) => {
        for (let i = workerIndex; i < stored.length; i += 3) {
          const session = stored[i];
          try {
            const history = await fetchHistoryForSession(session.id);
            const hasLocalSnapshot =
              session.messageCount > 0 || session.lastMessage.trim().length > 0;
            const invalid = hasLocalSnapshot && history.length === 0;
            if (!invalid) {
              validSessionIds.add(session.id);
            }
          } catch {
            // Keep session when verification fails to avoid destructive false positives.
            validSessionIds.add(session.id);
          }
        }
      });

      await Promise.all(workers);
      if (cancelled) return;

      const filtered = stored.filter((session) => validSessionIds.has(session.id));
      if (filtered.length === stored.length) return;

      saveSessions(filtered);
      setSessions(filtered);

      const currentStillValid = filtered.some((session) => session.id === currentSessionId);
      if (currentStillValid) return;

      if (filtered.length > 0) {
        stop();
        setChatMessages([]);
        setCurrentSessionId(filtered[0].id);
        setConnectionStatus("connecting");
        setPermissions({ canEdit: !readonlyMode, readonly: readonlyMode });
        setIsLoading(true);
        setPreconfiguredServers({});
        setPendingApprovals([]);
        setAwaitingFirstAssistant(false);
        setAwaitingAssistantFromIndex(null);
        setLiveProgress([]);
        return;
      }

      const newId = nanoid(8);
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
      setIsLoading(true);
      setPreconfiguredServers({});
      setPendingApprovals([]);
      setAwaitingFirstAssistant(false);
      setAwaitingAssistantFromIndex(null);
      setLiveProgress([]);
    };

    void reconcileSessions();

    return () => {
      cancelled = true;
    };
  }, [currentSessionId, readonlyMode, setChatMessages, stop, t]);

  // Hydrate session history on session switch even when websocket reconnect is unstable.
  useEffect(() => {
    let cancelled = false;

    const hydrateHistory = async () => {
      const now = Date.now();
      const cooldown = hydrateCooldownRef.current;
      if (cooldown && cooldown.sessionId === currentSessionId && now - cooldown.at < 1200) {
        return;
      }
      hydrateCooldownRef.current = { sessionId: currentSessionId, at: now };

      try {
        const history = await loadHistoryRef.current();
        if (cancelled) return;
        const normalizedHistory = Array.isArray(history) ? history : [];
        const signature = buildHistorySignature(normalizedHistory);
        const last = lastHydratedSignatureRef.current;
        if (last && last.sessionId === currentSessionId && last.signature === signature) {
          return;
        }

        const hydrated = normalizedHistory.map((item, index) => ({
          id: item.id ?? `history-${currentSessionId}-${index}`,
          role:
            item.role === "user" || item.role === "assistant" || item.role === "system"
              ? item.role
              : "assistant",
          parts: [{ type: "text", text: item.content ?? "" }]
        }));
        setChatMessages(hydrated as UIMessage[]);
        lastHydratedSignatureRef.current = { sessionId: currentSessionId, signature };
      } catch (error) {
        if (cancelled) return;
        console.error("Failed to hydrate chat history:", error);
      }
    };

    void hydrateHistory();

    return () => {
      cancelled = true;
    };
  }, [currentSessionId, setChatMessages]);

  useEffect(() => {
    if (connectionStatus !== "connected") return;
    void loadPermissions();
  }, [connectionStatus, loadPermissions]);

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
    setIsLoading(true);
    setPreconfiguredServers({});
    setPendingApprovals([]);
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
      setIsLoading(true);
      setPreconfiguredServers({});
      setPendingApprovals([]);
      setAwaitingFirstAssistant(false);
      setAwaitingAssistantFromIndex(null);
      setLiveProgress([]);
    },
    [currentSessionId, readonlyMode, setChatMessages, stop]
  );

  // Delete session
  const handleDeleteSession = useCallback(
    async (sessionId: string) => {
      if (!permissions.canEdit) {
        addToast(t("readonly_action_blocked"), "info");
        return;
      }

      try {
        const deleteResult = await chatTransport.deleteSession(sessionId);
        if (!isDeleteSessionResult(deleteResult) || !deleteResult.success) {
          throw new Error(deleteResult?.error || "Invalid delete session response");
        }

        const nextSelection = getNextSessionAfterDelete(sessions, sessionId, currentSessionId);
        deleteSessionMeta(sessionId);
        setSessions(loadSessions());

        if (nextSelection.action === "switch") {
          handleSelectSession(nextSelection.sessionId);
        } else if (nextSelection.action === "create-new") {
          handleNewSession();
        }

        if (deleteResult.pendingDestroy) {
          addToast(t("session_delete_pending_destroy"), "info");
        }
        addToast(t("session_deleted"), "success");
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
      sessions,
      t
    ]
  );

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
    [addToast, chatMessages, chatTransport, currentSessionId, permissions.canEdit, setChatMessages, t]
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
      trackChatEvent("message_regenerate", { messageId });
      try {
        const result = await chatTransport.regenerateMessage(String(messageId));
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
      chatTransport,
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
        const result = await chatTransport.forkSession(String(messageId));
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
        setIsLoading(true);
        setPreconfiguredServers({});
        setPendingApprovals([]);
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
    [addToast, chatTransport, permissions.canEdit, readonlyMode, t]
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
      } finally {
        setTogglingServer(null);
      }
    },
    [addEventLog, addToast, chatTransport, permissions.canEdit, t]
  );

  const handleApproveToolCall = useCallback(
    async (approvalId: string) => {
      try {
        const success = await chatTransport.decideApproval(approvalId, "approve");
        if (!success) {
          addToast(t("server_toggle_failed", { reason: "Approval failed" }), "error");
          return;
        }
        setPendingApprovals((prev) => prev.filter((item) => item.id !== approvalId));
        addToast(t("inspector_approvals_approve"), "success");
      } catch (error) {
        addToast(
          t("server_toggle_failed", {
            reason: error instanceof Error ? error.message : "Unknown error"
          }),
          "error"
        );
      }
    },
    [addToast, chatTransport, t]
  );

  const handleRejectToolCall = useCallback(
    async (approvalId: string) => {
      try {
        const success = await chatTransport.decideApproval(approvalId, "reject", "Rejected in inspector");
        if (!success) {
          addToast(t("server_toggle_failed", { reason: "Rejection failed" }), "error");
          return;
        }
        setPendingApprovals((prev) => prev.filter((item) => item.id !== approvalId));
        addToast(t("inspector_approvals_reject"), "success");
      } catch (error) {
        addToast(
          t("server_toggle_failed", {
            reason: error instanceof Error ? error.message : "Unknown error"
          }),
          "error"
        );
      }
    },
    [addToast, chatTransport, t]
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
                  setIsLoading(true);
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
            pendingApprovals={pendingApprovals}
            onApproveToolCall={handleApproveToolCall}
            onRejectToolCall={handleRejectToolCall}
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
