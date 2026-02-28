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
import {
  PlugIcon,
  ChatCircleIcon,
  ListIcon
} from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import type { MCPServersState } from "agents";
import type { CommandSuggestionItem } from "./types/command";
import { extractMessageSources } from "./types/message-sources";
import { getMessageText } from "./utils/message-text";
import { nanoid } from "nanoid";
import "./styles.css";

// ============ Session Management ============

interface SessionMeta {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
}

const SESSIONS_KEY = "chatwithme_sessions";

function loadSessions(): SessionMeta[] {
  try {
    const data = localStorage.getItem(SESSIONS_KEY);
    return data ? JSON.parse(data) : [];
  } catch {
    return [];
  }
}

function saveSessions(sessions: SessionMeta[]): void {
  localStorage.setItem(SESSIONS_KEY, JSON.stringify(sessions));
}

function updateSessionMeta(sessionId: string, updates: Partial<SessionMeta>): void {
  const sessions = loadSessions();
  const index = sessions.findIndex((s) => s.id === sessionId);

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

function deleteSessionMeta(sessionId: string): void {
  const sessions = loadSessions().filter((s) => s.id !== sessionId);
  saveSessions(sessions);
}

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

interface ToggleServerResult {
  success: boolean;
  active?: boolean;
  error?: string;
}

interface DeleteMessageResult {
  success: boolean;
  deleted: boolean;
  error?: string;
}

interface EditMessageResult {
  success: boolean;
  updated: boolean;
  error?: string;
}

interface RegenerateMessageResult {
  success: boolean;
  response?: string;
  error?: string;
}

interface ForkSessionResult {
  success: boolean;
  newSessionId?: string;
  error?: string;
}

type ProgressPhase = "context" | "model" | "thinking" | "tool" | "heartbeat" | "result" | "error";

type ProgressStatus = "start" | "success" | "error" | "info";

interface LiveProgressEntry {
  id: string;
  timestamp: string;
  phase: ProgressPhase;
  message: string;
  status: ProgressStatus;
  toolName?: string;
  snippet?: string;
}

function isProgressStatus(value: unknown): value is ProgressStatus {
  return value === "start" || value === "success" || value === "error" || value === "info";
}

function isProgressPhase(value: unknown): value is ProgressPhase {
  return (
    value === "context" ||
    value === "model" ||
    value === "thinking" ||
    value === "tool" ||
    value === "heartbeat" ||
    value === "result" ||
    value === "error"
  );
}

function parseLiveProgressPart(part: unknown): LiveProgressEntry | null {
  if (!part || typeof part !== "object") {
    return null;
  }
  const candidate = part as { type?: unknown; data?: unknown };
  if (candidate.type !== "data-progress") {
    return null;
  }
  if (!candidate.data || typeof candidate.data !== "object") {
    return null;
  }

  const data = candidate.data as {
    id?: unknown;
    timestamp?: unknown;
    phase?: unknown;
    message?: unknown;
    status?: unknown;
    toolName?: unknown;
    snippet?: unknown;
  };

  if (!isProgressPhase(data.phase) || typeof data.message !== "string") {
    return null;
  }

  return {
    id: typeof data.id === "string" ? data.id : nanoid(10),
    timestamp: typeof data.timestamp === "string" ? data.timestamp : new Date().toISOString(),
    phase: data.phase,
    message: data.message,
    status: isProgressStatus(data.status) ? data.status : "info",
    toolName: typeof data.toolName === "string" ? data.toolName : undefined,
    snippet: typeof data.snippet === "string" ? data.snippet : undefined
  };
}

function isToggleServerResult(value: unknown): value is ToggleServerResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as {
    success?: unknown;
    active?: unknown;
    error?: unknown;
  };
  return (
    typeof candidate.success === "boolean" &&
    (candidate.active === undefined || typeof candidate.active === "boolean") &&
    (candidate.error === undefined || typeof candidate.error === "string")
  );
}

function isDeleteMessageResult(value: unknown): value is DeleteMessageResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as {
    success?: unknown;
    deleted?: unknown;
    error?: unknown;
  };
  return (
    typeof candidate.success === "boolean" &&
    typeof candidate.deleted === "boolean" &&
    (candidate.error === undefined || typeof candidate.error === "string")
  );
}

function isEditMessageResult(value: unknown): value is EditMessageResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { success?: unknown; updated?: unknown; error?: unknown };
  return (
    typeof candidate.success === "boolean" &&
    typeof candidate.updated === "boolean" &&
    (candidate.error === undefined || typeof candidate.error === "string")
  );
}

function isRegenerateMessageResult(value: unknown): value is RegenerateMessageResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { success?: unknown; response?: unknown; error?: unknown };
  return (
    typeof candidate.success === "boolean" &&
    (candidate.response === undefined || typeof candidate.response === "string") &&
    (candidate.error === undefined || typeof candidate.error === "string")
  );
}

function isForkSessionResult(value: unknown): value is ForkSessionResult {
  if (!value || typeof value !== "object") {
    return false;
  }
  const candidate = value as { success?: unknown; newSessionId?: unknown; error?: unknown };
  return (
    typeof candidate.success === "boolean" &&
    (candidate.newSessionId === undefined || typeof candidate.newSessionId === "string") &&
    (candidate.error === undefined || typeof candidate.error === "string")
  );
}

function App() {
  const { addToast } = useToast();
  const { t, lang, setLang } = useI18n();

  // Session state
  const [sessions, setSessions] = useState<SessionMeta[]>([]);
  const [currentSessionId, setCurrentSessionId] = useState<string>(() => {
    const saved = localStorage.getItem("currentSessionId");
    if (saved) return saved;
    const id = nanoid(8);
    localStorage.setItem("currentSessionId", id);
    return id;
  });

  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [workspaceSection, setWorkspaceSection] = useState<WorkspaceSection>("chats");
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>("connecting");
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
  const historyLoadMarkerRef = useRef<string>("");
  const [preferRestFallback] = useState(() => {
    if (typeof navigator === "undefined") return false;
    return /firefox/i.test(navigator.userAgent);
  });

  useEffect(() => {
    if (preferRestFallback) {
      setConnectionStatus("connected");
    }
  }, [preferRestFallback]);
  // Load sessions on mount
  useEffect(() => {
    setSessions(loadSessions());
  }, []);

  // Save current session ID when changed
  useEffect(() => {
    localStorage.setItem("currentSessionId", currentSessionId);
  }, [currentSessionId]);

  // Agent connection
  const agent = useAgent({
    agent: "chat-agent",
    name: currentSessionId,
    enabled: !preferRestFallback,
    onClose: useCallback(() => setConnectionStatus("disconnected"), []),
    onMcpUpdate: useCallback((mcpServers: MCPServersState) => {
      setMcpState(mcpServers);
    }, []),
    onOpen: useCallback(() => {
      setConnectionStatus("connected");
    }, [])
  });

  // useAgentChat hook for AIChatAgent integration
  const { messages, sendMessage, status, stop, setMessages } = useAgentChat({
    agent,
    onToolCall: async ({ toolCall }) => {
      // Handle client-side tools if needed
      console.log("Tool call:", toolCall);
    },
    onData: (part) => {
      const progress = parseLiveProgressPart(part);
      if (!progress) return;
      setLiveProgress((prev) => [...prev, progress].slice(-12));
    }
  });

  const isStreaming = status === "streaming";
  const isConnected = connectionStatus === "connected";
  const shouldUseRestFallback = preferRestFallback || !isConnected;

  const requestJson = useCallback(
    async <T,>(input: RequestInfo | URL, init?: RequestInit): Promise<T> => {
      const response = await fetch(input, init);
      const data = (await response.json()) as T;
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return data;
    },
    []
  );

  const loadPreconfiguredServers = useCallback(
    async (attempt = 0) => {
      try {
        const servers = shouldUseRestFallback
          ? (
              await requestJson<{ success: boolean; servers: Record<string, PreconfiguredServer> }>(
                `/api/mcp/servers?sessionId=${encodeURIComponent(currentSessionId)}`
              )
            ).servers
          : ((await agent.call("getPreconfiguredServers", [])) as Record<string, PreconfiguredServer>);
        setPreconfiguredServers(servers as Record<string, PreconfiguredServer>);
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
    [agent, currentSessionId, requestJson, shouldUseRestFallback]
  );

  // Load preconfigured servers only after confirmed connected state.
  useEffect(() => {
    if (!shouldUseRestFallback && connectionStatus !== "connected") return;
    setIsLoading(true);
    void loadPreconfiguredServers();
  }, [connectionStatus, loadPreconfiguredServers, shouldUseRestFallback]);

  useEffect(() => {
    if (!shouldUseRestFallback) {
      return;
    }
    const loadingKey = `loading:${currentSessionId}`;
    const doneKey = `done:${currentSessionId}`;
    if (historyLoadMarkerRef.current === loadingKey || historyLoadMarkerRef.current === doneKey) {
      return;
    }
    historyLoadMarkerRef.current = loadingKey;

    let cancelled = false;
    const loadHistory = async () => {
      try {
        const data = await requestJson<{
          success: boolean;
          history: Array<{ id?: string; role: string; content: string }>;
        }>(`/api/chat/history?sessionId=${encodeURIComponent(currentSessionId)}`);
        if (cancelled) return;
        const nextMessages = data.history.map((item, index) => ({
          id: item.id ?? `${item.role}-${index}`,
          role: item.role as "user" | "assistant" | "system",
          parts: [{ type: "text", text: item.content }]
        })) as UIMessage[];
        setMessages(nextMessages);
        historyLoadMarkerRef.current = doneKey;
      } catch (error) {
        console.error("Failed to load history via REST fallback:", error);
        historyLoadMarkerRef.current = "";
      }
    };
    void loadHistory();
    return () => {
      cancelled = true;
    };
  }, [currentSessionId, requestJson, setMessages, shouldUseRestFallback]);

  // Hide live progress panel once assistant content starts arriving.
  useEffect(() => {
    if (!awaitingFirstAssistant) return;
    const hasAssistantContent = messages.some(
      (msg) =>
        msg.role === "assistant" &&
        getMessageText(msg)
          // Ignore invisible keepalive/control characters.
          .replace(/[\u200b\u200c\u200d\ufeff]/g, "")
          .trim().length > 0
    );
    if (hasAssistantContent) {
      setAwaitingFirstAssistant(false);
      setLiveProgress([]);
    }
  }, [messages, awaitingFirstAssistant]);

  // Update session meta when messages change
  useEffect(() => {
    if (messages.length > 0) {
      const lastMsg = messages[messages.length - 1];
      const text = getMessageText(lastMsg);

      // Only update on assistant messages
      if (lastMsg.role === "assistant" && text) {
        const firstUserMsg = messages.find((m) => m.role === "user");
        const title = firstUserMsg
          ? getMessageText(firstUserMsg).slice(0, 30) +
            (getMessageText(firstUserMsg).length > 30 ? "..." : "")
          : "New Chat";

        updateSessionMeta(currentSessionId, {
          title,
          lastMessage: text.slice(0, 50) + (text.length > 50 ? "..." : ""),
          timestamp: new Date().toISOString(),
          messageCount: messages.length
        });
        setSessions(loadSessions());
      }
    }
  }, [messages, currentSessionId]);

  // Create new session
  const handleNewSession = useCallback(() => {
    const newId = nanoid(8);
    setCurrentSessionId(newId);
    setConnectionStatus("connecting");
    setAwaitingFirstAssistant(false);
    setLiveProgress([]);
  }, []);

  // Switch session
  const handleSelectSession = useCallback(
    (sessionId: string) => {
      if (sessionId === currentSessionId) return;
      setCurrentSessionId(sessionId);
      setConnectionStatus("connecting");
      setAwaitingFirstAssistant(false);
      setLiveProgress([]);
    },
    [currentSessionId]
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
      try {
        const result = shouldUseRestFallback
          ? await requestJson<DeleteMessageResult>(
              `/api/chat/message?sessionId=${encodeURIComponent(currentSessionId)}&messageId=${encodeURIComponent(messageId)}`,
              { method: "DELETE" }
            )
          : ((await agent.call("deleteMessage", [messageId])) as DeleteMessageResult);
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

        const nextMessages = messages.filter((msg) => msg.id !== messageId);
        setMessages(nextMessages);

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
    [agent, addToast, currentSessionId, messages, requestJson, setMessages, shouldUseRestFallback, t]
  );

  const handleEditMessage = useCallback(
    async (messageId: UIMessage["id"], content: string) => {
      try {
        const resolved = shouldUseRestFallback
          ? await requestJson<EditMessageResult>("/api/chat/edit", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: currentSessionId, messageId, content })
            })
          : ((await agent.call("editUserMessage", [messageId, content])) as EditMessageResult);
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

        const nextMessages = messages.map((message) => {
          if (message.id !== messageId || message.role !== "user" || !Array.isArray(message.parts)) {
            return message;
          }
          const nextParts = message.parts.map((part) => {
            if (part.type !== "text") return part;
            return { ...part, text: content };
          });
          return { ...message, parts: nextParts };
        });

        setMessages(nextMessages);
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
    [agent, addToast, currentSessionId, messages, requestJson, setMessages, shouldUseRestFallback, t]
  );

  const handleRegenerateMessage = useCallback(
    async (messageId: UIMessage["id"]) => {
      try {
        const result = shouldUseRestFallback
          ? await requestJson<RegenerateMessageResult>("/api/chat/regenerate", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: currentSessionId, messageId })
            })
          : ((await agent.call("regenerateFrom", [messageId])) as RegenerateMessageResult);
        if (!isRegenerateMessageResult(result)) {
          throw new Error("Invalid regenerateFrom response");
        }
        if (!result.success) {
          throw new Error(result.error || "Regenerate failed");
        }

        if (result.response) {
          setMessages([
            ...messages,
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
    [agent, addToast, currentSessionId, messages, requestJson, setMessages, shouldUseRestFallback, t]
  );

  const handleForkSession = useCallback(
    async (messageId: UIMessage["id"]) => {
      try {
        const result = shouldUseRestFallback
          ? await requestJson<ForkSessionResult>("/api/chat/fork", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ sessionId: currentSessionId, messageId })
            })
          : ((await agent.call("forkSession", [messageId])) as ForkSessionResult);
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
    [agent, addToast, currentSessionId, requestJson, shouldUseRestFallback, t]
  );

  const handleToggleServer = useCallback(
    async (name: string) => {
      setTogglingServer(name);
      try {
        const result = shouldUseRestFallback
          ? await requestJson<ToggleServerResult>("/api/mcp/toggle", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ name, sessionId: currentSessionId })
            })
          : ((await agent.call("toggleServer", [name])) as ToggleServerResult);
        if (!isToggleServerResult(result)) {
          throw new Error("Invalid toggleServer response");
        }
        if (result.success) {
          addToast(
            t("server_toggle_success", {
              name,
              state: result.active ? t("server_toggle_active") : t("server_toggle_inactive")
            }),
            "success"
          );
          await loadPreconfiguredServers();
        } else {
          addToast(
            t("server_toggle_failed", {
              reason: result.error || "Unknown error"
            }),
            "error"
          );
        }
      } catch (error) {
        console.error("Failed to toggle server:", error);
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
    [agent, addToast, currentSessionId, loadPreconfiguredServers, requestJson, shouldUseRestFallback, t]
  );

  const handleSend = useCallback(() => {
    const text = input.trim();
    if (!text || isStreaming) return;

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
    setLiveProgress([
      {
        id: nanoid(10),
        timestamp: new Date().toISOString(),
        phase: "context",
        message: t("live_feed_sent"),
        status: "start"
      }
    ]);
    if (shouldUseRestFallback) {
      const userMessage: UIMessage = {
        id: `user-${Date.now()}`,
        role: "user",
        parts: [{ type: "text", text }]
      };
      const historyWithUser = [...messages, userMessage];
      setMessages(historyWithUser);
      void (async () => {
        try {
          const data = await requestJson<{ success: boolean; response: string }>("/api/chat", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ sessionId: currentSessionId, message: text })
          });
          const assistantMessage: UIMessage = {
            id: `assistant-${Date.now()}`,
            role: "assistant",
            parts: [{ type: "text", text: data.response }]
          };
          setMessages([...historyWithUser, assistantMessage]);
        } catch (error) {
          addToast(
            t("server_toggle_failed", {
              reason: error instanceof Error ? error.message : "Unknown error"
            }),
            "error"
          );
        } finally {
          setAwaitingFirstAssistant(false);
          setLiveProgress([]);
        }
      })();
      return;
    }

    sendMessage({ role: "user", parts: [{ type: "text", text }] });
  }, [
    addToast,
    handleNewSession,
    handleSelectSession,
    input,
    isStreaming,
    currentSessionId,
    messages,
    requestJson,
    sendMessage,
    setMessages,
    sessions,
    shouldUseRestFallback,
    stop,
    t
  ]);

  const handleStop = useCallback(() => {
    stop();
    setAwaitingFirstAssistant(false);
  }, [stop]);

  const serverEntries = useMemo(() => Object.entries(mcpState.servers), [mcpState.servers]);

  const preconfiguredServerList = useMemo(
    () => Object.entries(preconfiguredServers),
    [preconfiguredServers]
  );

  const activeToolsCount = mcpState.tools.length;
  const commandSuggestions = useMemo<CommandSuggestionItem[]>(() => {
    const toolItems = mcpState.tools.slice(0, 20).map((tool) => ({
      id: `tool-${tool.serverId}-${tool.name}`,
      trigger: "@" as const,
      label: tool.name,
      description: tool.serverId,
      value: tool.name,
      section: "tools" as const,
      group: "tools",
      priority: 100,
      keywords: [tool.name, tool.serverId ?? ""]
    }));

    const sessionItems = sessions.slice(0, 12).map((session) => ({
      id: `session-${session.id}`,
      trigger: "#" as const,
      label: session.title,
      description: session.lastMessage || t("session_no_messages"),
      value: session.id,
      section: "sessions" as const,
      group: "sessions",
      priority: 80,
      keywords: [session.title, session.lastMessage]
    }));

    const actionItems: CommandSuggestionItem[] = [
      {
        id: "action-new",
        trigger: "!" as const,
        label: t("session_new"),
        description: "Create a new session",
        value: "new",
        section: "actions",
        group: "actions",
        priority: 60,
        keywords: ["new", "session", "create"]
      },
      {
        id: "action-stop",
        trigger: "!" as const,
        label: t("chat_input_action_stop"),
        description: "Stop current generation",
        value: "stop",
        section: "actions",
        group: "actions",
        priority: 50,
        keywords: ["stop", "abort", "cancel"]
      }
    ];

    return [...toolItems, ...sessionItems, ...actionItems];
  }, [mcpState.tools, sessions, t]);

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
      messages.reduce((sum, message) => {
        return sum + extractMessageSources(message.parts).length;
      }, 0),
    [messages]
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
        lang={lang}
        setLang={setLang}
        t={t}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar
          mobile={mobile}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
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
                messages={messages}
                isStreaming={isStreaming}
                isConnected={isConnected}
                activeToolsCount={activeToolsCount}
                awaitingFirstAssistant={awaitingFirstAssistant}
                liveProgress={liveProgress}
                phaseLabels={phaseLabels}
                input={input}
                setInput={setInput}
                commandSuggestions={commandSuggestions}
                onSend={handleSend}
                onStop={handleStop}
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
                mcpTools={mcpState.tools}
                t={t}
              />
            )}
          </main>

          <InspectorPane
            toolsCount={mcpState.tools.length}
            sourcesCount={sourceGroupsCount}
            liveProgress={liveProgress}
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
