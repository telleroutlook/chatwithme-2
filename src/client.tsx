import { McpItemCard } from "./components/McpItemCard";
import { Toaster } from "./components/Toaster";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { ToolCallCard, extractToolCalls } from "./components/ToolCallCard";
import { MessageActions } from "./components/MessageActions";
import { ChatInput } from "./components/ChatInput";
import { ModalHost } from "./components/modal";
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
      loadPreconfiguredServers();
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
    }
  });

  const isStreaming = status === "streaming";
  const isConnected = connectionStatus === "connected";

  const loadPreconfiguredServers = useCallback(async () => {
    try {
      const servers = await agent.call("getPreconfiguredServers", []);
      setPreconfiguredServers(servers as Record<string, PreconfiguredServer>);
    } catch (error) {
      console.error("Failed to load pre-configured servers:", error);
    } finally {
      setIsLoading(false);
    }
  }, [agent]);

  // Auto-scroll on new messages (using VList scrollToIndex)
  useEffect(() => {
    if (messages.length > 0 && vListRef.current) {
      // Scroll to the last message
      vListRef.current.scrollToIndex(messages.length - 1, { align: "end" });
    }
  }, [messages.length]);

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
  }, []);

  // Switch session
  const handleSelectSession = useCallback((sessionId: string) => {
    if (sessionId === currentSessionId) return;
    setCurrentSessionId(sessionId);
    setConnectionStatus("connecting");
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
    setInput("");
    sendMessage({ role: "user", parts: [{ type: "text", text }] });
  }, [input, isStreaming, sendMessage]);

  const serverEntries = useMemo(
    () => Object.entries(mcpState.servers),
    [mcpState.servers]
  );

  const preconfiguredServerList = useMemo(
    () => Object.entries(preconfiguredServers),
    [preconfiguredServers]
  );

  const activeToolsCount = mcpState.tools.length;

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
    <div className="h-full flex bg-kumo-base/70 text-kumo-default">
      {/* Mobile Drawer Overlay */}
      {mobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          style={{ background: "var(--app-overlay)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop fixed, Mobile drawer */}
      <aside
        className={`
          ${mobile
            ? `fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`
            : `${sidebarOpen ? "w-72" : "w-0"} transition-all duration-300`
          }
          app-panel flex flex-col border-r border-kumo-line bg-kumo-base/95 app-glass overflow-hidden shrink-0
        `}
      >
        {/* Sidebar Header */}
        <div className="p-3 border-b border-kumo-line/80 space-y-3 bg-kumo-base/60">
          <div className="flex items-center justify-between">
            <Text size="xs" variant="secondary">
              {t("sidebar_sessions")}
            </Text>
            {mobile && (
              <button
                type="button"
                onClick={() => setSidebarOpen(false)}
                className="p-2 rounded-lg hover:bg-kumo-control transition-colors focus-visible:outline-none"
                aria-label={t("sidebar_close")}
              >
                <XIcon size={20} className="text-kumo-subtle" />
              </button>
            )}
          </div>
          <Button
            variant="primary"
            className="w-full justify-center"
            icon={<PlusIcon size={16} />}
            onClick={() => {
              handleNewSession();
              if (mobile) setSidebarOpen(false);
            }}
          >
            {t("session_new")}
          </Button>
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-kumo-subtle">
              <ChatCircleDotsIcon size={32} className="mx-auto mb-2 opacity-50" />
              <Text size="xs">{t("session_empty")}</Text>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => {
                  handleSelectSession(session.id);
                  if (mobile) setSidebarOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    handleSelectSession(session.id);
                    if (mobile) setSidebarOpen(false);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-current={currentSessionId === session.id ? "page" : undefined}
                className={`w-full text-left p-3 rounded-xl transition-all duration-200 group ${
                  currentSessionId === session.id
                    ? "bg-kumo-accent/10 ring-1 ring-kumo-accent shadow-[var(--app-shadow-soft)]"
                    : "hover:bg-kumo-control/75 ring-1 ring-transparent hover:ring-kumo-line"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <span className="block truncate">
                      <Text size="sm" bold={currentSessionId === session.id}>
                        {session.title}
                      </Text>
                    </span>
                    <span className="block truncate mt-0.5">
                      <Text size="xs" variant="secondary">
                        {session.lastMessage || t("session_no_messages")}
                      </Text>
                    </span>
                    <div className="flex items-center gap-2 mt-1">
                      <Text size="xs" variant="secondary">
                        {formatTime(session.timestamp)}
                      </Text>
                      {session.messageCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {session.messageCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteSession(session.id);
                    }}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-kumo-danger/20 text-kumo-subtle hover:text-kumo-danger transition-all focus-visible:opacity-100"
                    aria-label={t("session_delete")}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        {/* Header */}
        <header className="app-glass px-3 sm:px-5 py-3 border-b border-kumo-line/80 bg-kumo-base/70">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg hover:bg-kumo-control transition-colors focus-visible:outline-none"
                aria-label={
                  mobile
                    ? t("sidebar_open")
                    : t("sidebar_toggle")
                }
              >
                <ListIcon size={20} className="text-kumo-subtle" />
              </button>
              <div className="flex items-center gap-2 sm:gap-3">
                <PlugsConnectedIcon
                  size={22}
                  className="text-kumo-accent shrink-0"
                  weight="bold"
                />
                <div>
                  <h1 className="text-base sm:text-lg font-semibold text-kumo-default leading-tight">
                    {t("app_title")}
                  </h1>
                  <Text size="xs" variant="secondary">
                    {t("app_subtitle")}
                  </Text>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <div
                className="inline-flex items-center rounded-lg border border-[var(--app-border-default)] bg-[var(--app-surface-secondary)] p-1"
                role="group"
                aria-label={t("lang_group")}
              >
                <button
                  type="button"
                  onClick={() => setLang("zh")}
                  className={`h-8 min-w-8 rounded-md px-2 text-xs font-medium transition-colors ${
                    lang === "zh"
                      ? "bg-[var(--app-accent)] text-[var(--app-text-on-accent)]"
                      : "text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-tertiary)]"
                  }`}
                  aria-pressed={lang === "zh"}
                >
                  {t("lang_zh")}
                </button>
                <button
                  type="button"
                  onClick={() => setLang("en")}
                  className={`h-8 min-w-8 rounded-md px-2 text-xs font-medium transition-colors ${
                    lang === "en"
                      ? "bg-[var(--app-accent)] text-[var(--app-text-on-accent)]"
                      : "text-[var(--app-text-secondary)] hover:bg-[var(--app-surface-tertiary)]"
                  }`}
                  aria-pressed={lang === "en"}
                >
                  {t("lang_en")}
                </button>
              </div>
              <ConnectionIndicator
                status={connectionStatus}
                labels={{
                  connecting: t("connection_connecting"),
                  connected: t("connection_connected"),
                  disconnected: t("connection_disconnected")
                }}
              />
              <ModeToggle
                labels={{
                  light: t("theme_light"),
                  dark: t("theme_dark"),
                  system: t("theme_system"),
                  group: t("theme_group")
                }}
              />
            </div>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="border-b border-kumo-line/80 px-3 sm:px-5 bg-kumo-base/55 app-glass">
          <div className="flex gap-2 py-2" role="tablist" aria-label={t("tabs_label")}>
            <button
              type="button"
              onClick={() => setActiveTab("chat")}
              role="tab"
              aria-selected={activeTab === "chat"}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                activeTab === "chat"
                  ? "border-kumo-accent text-kumo-accent bg-kumo-accent/12 shadow-[var(--app-shadow-soft)]"
                  : "border-kumo-line text-kumo-subtle hover:text-kumo-default hover:bg-kumo-control/70"
              }`}
            >
              <ChatCircleIcon size={18} weight="bold" />
              {t("tabs_chat")}
              {activeToolsCount > 0 && (
                <Badge variant="primary">
                  {t("tabs_tools_count", { count: String(activeToolsCount) })}
                </Badge>
              )}
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("mcp")}
              role="tab"
              aria-selected={activeTab === "mcp"}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium border transition-colors ${
                activeTab === "mcp"
                  ? "border-kumo-accent text-kumo-accent bg-kumo-accent/12 shadow-[var(--app-shadow-soft)]"
                  : "border-kumo-line text-kumo-subtle hover:text-kumo-default hover:bg-kumo-control/70"
              }`}
            >
              <PlugIcon size={18} weight="bold" />
              {t("tabs_mcp")}
              {serverEntries.length > 0 && (
                <Badge variant="secondary">{serverEntries.length}</Badge>
              )}
            </button>
          </div>
        </div>

        <main className="flex-1 min-h-0">
          {activeTab === "chat" ? (
            /* Chat Tab */
            <section className="flex h-full min-h-0 flex-col">
              {/* Chat Messages with Virtual Scrolling */}
              <div className="flex-1 min-h-0 overflow-hidden px-3 sm:px-5 pt-4 pb-2">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <Empty
                      icon={<ChatCircleIcon size={32} />}
                      title={t("chat_empty_title")}
                      description={
                        activeToolsCount > 0
                          ? t("chat_empty_with_tools", {
                              count: String(activeToolsCount)
                            })
                          : t("chat_empty_no_tools")
                      }
                    />
                  </div>
                ) : (
                  <VList
                    ref={vListRef}
                    style={{ height: "100%" }}
                    className="space-y-4 px-1"
                  >
                    {messages.map((msg) => {
                      const isUser = msg.role === "user";
                      const text = getMessageText(msg);
                      // Extract tool calls from message parts
                      const toolCalls = Array.isArray(msg.parts)
                        ? extractToolCalls(msg.parts as Array<{ type: string; [key: string]: unknown }>)
                        : [];
                      const hasToolCalls = toolCalls.length > 0;

                      return (
                        <div
                          key={msg.id}
                          className={`flex flex-col ${
                            isUser ? "items-end" : "items-start"
                          } group`}
                        >
                          {/* Tool Calls Display */}
                          {!isUser && hasToolCalls && (
                            <div className="w-full max-w-[95%] sm:max-w-[85%] mb-2 space-y-2">
                              {toolCalls.map((toolCall, index) => (
                                <ToolCallCard
                                  key={`${toolCall.toolName}-${index}`}
                                  toolName={toolCall.toolName}
                                  state={toolCall.state}
                                  input={toolCall.input}
                                  output={toolCall.output}
                                  errorText={toolCall.errorText}
                                />
                              ))}
                            </div>
                          )}
                          {/* Message Content */}
                          <div
                            className={`w-fit max-w-[95%] sm:max-w-[85%] px-4 py-2.5 rounded-2xl shadow-[var(--app-shadow-soft)] ${
                              isUser
                                ? "bg-kumo-accent text-white"
                                : "bg-kumo-surface/95 ring ring-kumo-line text-kumo-default"
                            }`}
                          >
                            {isUser ? (
                              <span className="whitespace-pre-wrap block">
                                <Text size="sm">{text}</Text>
                              </span>
                            ) : (
                              <MarkdownRenderer
                                content={text}
                                isStreaming={isStreaming && msg === messages[messages.length - 1]}
                              />
                            )}
                          </div>
                          {/* Message Actions */}
                          <div className="mt-1">
                            <MessageActions
                              content={text}
                              showRegenerate={!isUser}
                              showEdit={isUser}
                              showDelete={true}
                              onDelete={() => handleDeleteMessage(msg.id)}
                              disabled={isStreaming}
                              compact={true}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </VList>
                )}
              </div>

              {/* Chat Input */}
              <div className="sticky bottom-0 z-10 border-t border-kumo-line/80 bg-kumo-base/80 app-glass px-3 sm:px-5 py-3">
                <ChatInput
                  value={input}
                  onChange={setInput}
                  onSubmit={handleSend}
                  onStop={stop}
                  isStreaming={isStreaming}
                  isConnected={isConnected}
                  placeholder={
                    activeToolsCount > 0
                      ? t("chat_placeholder_tools")
                      : t("chat_placeholder_default")
                  }
                  multiline={true}
                  maxRows={6}
                  showCharCount={true}
                />
              </div>
            </section>
          ) : (
            /* MCP Tab */
            <section className="h-full overflow-y-auto px-3 sm:px-5 py-5">
              <div className="space-y-8 max-w-4xl mx-auto">
              {/* Info */}
              <Surface className="app-panel p-4 rounded-2xl ring ring-kumo-line">
                <div className="flex gap-3">
                  <InfoIcon
                    size={20}
                    weight="bold"
                    className="text-kumo-accent shrink-0 mt-0.5"
                  />
                  <div>
                    <Text size="sm" bold>
                      {t("mcp_info_title")}
                    </Text>
                    <span className="mt-1 block">
                      <Text size="xs" variant="secondary">
                        {t("mcp_info_desc")}
                      </Text>
                    </span>
                  </div>
                </div>
              </Surface>

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <SpinnerIcon size={24} className="animate-spin text-kumo-accent" />
                  <span className="ml-2">
                    <Text size="sm">{t("mcp_loading")}</Text>
                  </span>
                </div>
              )}

              {/* Pre-configured Servers */}
              {!isLoading && preconfiguredServerList.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <PlugIcon size={18} weight="bold" className="text-kumo-subtle" />
                    <Text size="base" bold>
                      {t("mcp_available_servers")}
                    </Text>
                  </div>
                  <div className="space-y-2">
                    {preconfiguredServerList.map(([name, server]) => (
                      <Surface
                        key={name}
                        className="app-panel-soft p-4 rounded-2xl ring ring-kumo-line"
                      >
                        <div className="flex items-start justify-between">
                          <div className="flex-1">
                            <div className="flex items-center gap-2">
                              <Text size="sm" bold>
                                {server.config.name}
                              </Text>
                              {server.connected ? (
                                <Badge variant="primary">
                                  <CheckCircleIcon size={12} weight="fill" className="mr-1" />
                                  {t("mcp_status_active")}
                                </Badge>
                              ) : (
                                <Badge variant="secondary">{t("mcp_status_inactive")}</Badge>
                              )}
                            </div>
                            <span className="mt-1 block">
                              <Text size="xs" variant="secondary">
                                {server.config.description}
                              </Text>
                            </span>
                            <span className="mt-0.5 font-mono block">
                              <Text size="xs" variant="secondary">
                                {server.config.url}
                              </Text>
                            </span>
                            {server.error && (
                              <div className="flex items-center gap-1 mt-2 text-red-500">
                                <WarningIcon size={14} weight="fill" />
                                <Text size="xs">{server.error}</Text>
                              </div>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {togglingServer === name ? (
                              <SpinnerIcon size={20} className="animate-spin text-kumo-accent" />
                            ) : (
                              <Switch
                                checked={server.connected}
                                onChange={() => handleToggleServer(name)}
                                aria-label={t("mcp_toggle_server", { name })}
                              />
                            )}
                          </div>
                        </div>
                      </Surface>
                    ))}
                  </div>
                </section>
              )}

              {/* Connected Tools */}
              {mcpState.tools.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <WrenchIcon size={18} weight="bold" className="text-kumo-subtle" />
                    <Text size="base" bold>
                      {t("mcp_available_tools")}
                    </Text>
                    <Badge variant="secondary">{mcpState.tools.length}</Badge>
                  </div>
                  <div className="space-y-2">
                    {mcpState.tools.map((tool) => (
                      <McpItemCard
                        key={`${tool.name}-${tool.serverId}`}
                        name={tool.name}
                        serverId={tool.serverId}
                        data={tool}
                        serverLabel={t("mcp_server")}
                        payloadLabel={t("mcp_raw_payload")}
                      />
                    ))}
                  </div>
                </section>
              )}
              </div>
            </section>
          )}
        </main>

        <footer className="shrink-0 border-t border-kumo-line/80 py-3 bg-kumo-base/55 app-glass">
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
