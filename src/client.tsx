import { McpItemCard } from "./components/McpItemCard";
import { Toaster } from "./components/Toaster";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { ToolCallCard, extractToolCalls } from "./components/ToolCallCard";
import { MessageActions } from "./components/MessageActions";
import { ChatInput } from "./components/ChatInput";
import { ModalHost } from "./components/modal";
import { MessageSources } from "./components/MessageSources";
import {
  ChatPane,
  InspectorPane,
  McpPane,
  TopBar,
  WorkspaceSidebar,
  type WorkspaceSection
} from "./components/layout";
import {
  ConnectionIndicator,
  ModeToggle,
  PoweredByAgents,
  ThemeProvider,
  type ConnectionStatus
} from "./components/AgentsUiCompat";
import { ToastProvider, useToast } from "./hooks/useToast";
import { I18nProvider, useI18n } from "./hooks/useI18n";
import { useResponsive } from "./hooks/useResponsive";
import { Tabs } from "./components/ui";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { VList, VListHandle } from "virtua";
import { Button, Badge, Surface, Text, Empty, Switch } from "@cloudflare/kumo";
import {
  PlugIcon,
  PlugsConnectedIcon,
  WrenchIcon,
  InfoIcon,
  SpinnerIcon,
  ChatCircleIcon,
  PaperPlaneTiltIcon,
  CheckCircleIcon,
  WarningIcon,
  PlusIcon,
  TrashIcon,
  ChatCircleDotsIcon,
  StopIcon,
  XIcon,
  ListIcon
} from "@phosphor-icons/react";
import type { UIMessage } from "ai";
import type { MCPServersState } from "agents";
import type { CommandSuggestionItem } from "./types/command";
import { extractMessageSources } from "./types/message-sources";
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

function updateSessionMeta(
  sessionId: string,
  updates: Partial<SessionMeta>
): void {
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

// ============ Helper to extract text from UIMessage ============

function getMessageText(message: UIMessage): string {
  const candidate = message as unknown as {
    content?: unknown;
    parts?: unknown;
  };

  if (typeof candidate.content === "string") {
    return candidate.content;
  }
  if (Array.isArray(candidate.parts)) {
    type TextPart = { type: "text"; text: string };
    return candidate.parts
      .filter((part: unknown): part is TextPart => {
        if (!part || typeof part !== "object") {
          return false;
        }
        const candidate = part as { type?: unknown; text?: unknown };
        return candidate.type === "text" && typeof candidate.text === "string";
      })
      .map((part) => part.text)
      .join("");
  }
  return "";
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

type ProgressPhase =
  | "context"
  | "model"
  | "thinking"
  | "tool"
  | "heartbeat"
  | "result"
  | "error";

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
  return (
    value === "start" ||
    value === "success" ||
    value === "error" ||
    value === "info"
  );
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
    timestamp:
      typeof data.timestamp === "string"
        ? data.timestamp
        : new Date().toISOString(),
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
  const [workspaceSection, setWorkspaceSection] =
    useState<WorkspaceSection>("chats");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
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

  // Chat input
  const [input, setInput] = useState("");
  const [liveProgress, setLiveProgress] = useState<LiveProgressEntry[]>([]);
  const [awaitingFirstAssistant, setAwaitingFirstAssistant] = useState(false);
  const vListRef = useRef<VListHandle>(null);
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
    onClose: useCallback(() => setConnectionStatus("disconnected"), []),
    onMcpUpdate: useCallback((mcpServers: MCPServersState) => {
      setMcpState(mcpServers);
    }, []),
    onOpen: useCallback(() => {
      setConnectionStatus("connected");
    }, [])
  });

  // useAgentChat hook for AIChatAgent integration
  const {
    messages,
    sendMessage,
    status,
    stop,
    setMessages
  } = useAgentChat({
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

  const loadPreconfiguredServers = useCallback(async (attempt = 0) => {
    try {
      const servers = await agent.call("getPreconfiguredServers", []);
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
  }, [agent]);

  // Load preconfigured servers only after confirmed connected state.
  useEffect(() => {
    if (connectionStatus !== "connected") return;
    setIsLoading(true);
    void loadPreconfiguredServers();
  }, [connectionStatus, loadPreconfiguredServers]);

  // Auto-scroll on new messages (using VList scrollToIndex)
  useEffect(() => {
    if (messages.length > 0 && vListRef.current) {
      // Scroll to the last message
      vListRef.current.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [messages.length]);

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
  const handleSelectSession = useCallback((sessionId: string) => {
    if (sessionId === currentSessionId) return;
    setCurrentSessionId(sessionId);
    setConnectionStatus("connecting");
    setAwaitingFirstAssistant(false);
    setLiveProgress([]);
  }, [currentSessionId]);

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
        const result = await agent.call("deleteMessage", [messageId]);
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
    [agent, addToast, currentSessionId, messages, setMessages, t]
  );

  const handleToggleServer = useCallback(
    async (name: string) => {
      setTogglingServer(name);
      try {
        const result = await agent.call("toggleServer", [name]);
        if (!isToggleServerResult(result)) {
          throw new Error("Invalid toggleServer response");
        }
        if (result.success) {
          addToast(
            t("server_toggle_success", {
              name,
              state: result.active
                ? t("server_toggle_active")
                : t("server_toggle_inactive")
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
    [agent, addToast, loadPreconfiguredServers, t]
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
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
  }, [addToast, handleNewSession, handleSelectSession, input, isStreaming, sendMessage, sessions, stop, t]);

  const handleStop = useCallback(() => {
    stop();
    setAwaitingFirstAssistant(false);
  }, [stop]);

  const serverEntries = useMemo(
    () => Object.entries(mcpState.servers),
    [mcpState.servers]
  );

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
      section: "tools" as const
    }));

    const sessionItems = sessions.slice(0, 12).map((session) => ({
      id: `session-${session.id}`,
      trigger: "#" as const,
      label: session.title,
      description: session.lastMessage || t("session_no_messages"),
      value: session.id,
      section: "sessions" as const
    }));

    const actionItems: CommandSuggestionItem[] = [
      {
        id: "action-new",
        trigger: "!" as const,
        label: t("session_new"),
        description: "Create a new session",
        value: "new",
        section: "actions"
      },
      {
        id: "action-stop",
        trigger: "!" as const,
        label: t("chat_input_action_stop"),
        description: "Stop current generation",
        value: "stop",
        section: "actions"
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
        t={t}
      />

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <TopBar
          mobile={mobile}
          onToggleSidebar={() => setSidebarOpen(!sidebarOpen)}
          connectionStatus={connectionStatus}
          lang={lang}
          setLang={setLang}
          t={t}
        />

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
                badge: activeToolsCount > 0 ? (
                  <Badge variant="primary">
                    {t("tabs_tools_count", { count: String(activeToolsCount) })}
                  </Badge>
                ) : undefined
              },
              {
                value: "mcp",
                icon: <PlugIcon size={18} weight="bold" />,
                label: t("tabs_mcp"),
                badge: serverEntries.length > 0 ? (
                  <Badge variant="secondary">{serverEntries.length}</Badge>
                ) : undefined
              }
            ]}
          />
        </div>

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
                vListRef={vListRef}
                input={input}
                setInput={setInput}
                commandSuggestions={commandSuggestions}
                onSend={handleSend}
                onStop={handleStop}
                onDeleteMessage={handleDeleteMessage}
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

        <footer className="app-glass shrink-0 border-t border-kumo-line/80 bg-kumo-base/55 py-3">
          <div className="flex justify-center">
            <PoweredByAgents label={t("app_powered_by")} />
          </div>
        </footer>
      </div>
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
