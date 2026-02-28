import { McpItemCard } from "./components/McpItemCard";
import { Toaster } from "./components/Toaster";
import { MarkdownRenderer } from "./components/MarkdownRenderer";
import { ToolCallCard, extractToolCalls } from "./components/ToolCallCard";
import { MessageActions } from "./components/MessageActions";
import { ChatInput } from "./components/ChatInput";
import { ModalHost } from "./components/modal";
import { ToastProvider, useToast } from "./hooks/useToast";
import { useResponsive } from "./hooks/useResponsive";
import { useAgent } from "agents/react";
import { useAgentChat } from "@cloudflare/ai-chat/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@cloudflare/agents-ui/hooks";
import {
  ConnectionIndicator,
  ModeToggle,
  PoweredByAgents,
  type ConnectionStatus
} from "@cloudflare/agents-ui";
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
import type { MCPServersState, UIMessage } from "agents";
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
  if (typeof message.content === "string") {
    return message.content;
  }
  if (Array.isArray(message.parts)) {
    return message.parts
      .filter((part): part is { type: "text"; text: string } => part.type === "text")
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

function App() {
  const { addToast } = useToast();

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
  const { mobile, tablet, desktop } = useResponsive();

  // On mobile, sidebar starts closed
  useEffect(() => {
    if (mobile) {
      setSidebarOpen(false);
    }
  }, [mobile]);

  // Chat input
  const [input, setInput] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

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
    clearHistory,
    status,
    stop
  } = useAgentChat({
    agent,
    onToolCall: async ({ toolCall, addToolOutput }) => {
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

  // Auto-scroll on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
    (sessionId: string, e: React.MouseEvent) => {
      e.stopPropagation();
      deleteSessionMeta(sessionId);
      setSessions(loadSessions());

      if (sessionId === currentSessionId) {
        handleNewSession();
      }

      addToast("Session deleted", "success");
    },
    [currentSessionId, handleNewSession, addToast]
  );

  const handleToggleServer = useCallback(
    async (name: string) => {
      setTogglingServer(name);
      try {
        const result = await agent.call("toggleServer", [name]);
        if (result.success) {
          addToast(
            `Server "${name}" ${result.active ? "activated" : "deactivated"}`,
            "success"
          );
          await loadPreconfiguredServers();
        } else {
          addToast(`Failed to toggle server: ${result.error}`, "error");
        }
      } catch (error) {
        console.error("Failed to toggle server:", error);
        addToast(
          `Failed to toggle server: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "error"
        );
      } finally {
        setTogglingServer(null);
      }
    },
    [agent, addToast, loadPreconfiguredServers]
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
    <div className="h-full flex bg-kumo-base">
      {/* Mobile Drawer Overlay */}
      {mobile && sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar - Desktop fixed, Mobile drawer */}
      <aside
        className={`
          ${mobile
            ? `fixed inset-y-0 left-0 z-50 w-64 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`
            : `${sidebarOpen ? "w-64" : "w-0"} transition-all duration-300`
          }
          flex flex-col border-r border-kumo-line bg-kumo-base overflow-hidden shrink-0
        `}
      >
        {/* Sidebar Header */}
        <div className="p-3 border-b border-kumo-line flex items-center justify-between">
          <Button
            variant="primary"
            className="flex-1 justify-center"
            icon={<PlusIcon size={16} />}
            onClick={() => {
              handleNewSession();
              if (mobile) setSidebarOpen(false);
            }}
          >
            New Chat
          </Button>
          {mobile && (
            <button
              onClick={() => setSidebarOpen(false)}
              className="ml-2 p-2 rounded-lg hover:bg-kumo-control transition-colors"
              aria-label="Close sidebar"
            >
              <XIcon size={20} className="text-kumo-subtle" />
            </button>
          )}
        </div>

        {/* Session List */}
        <div className="flex-1 overflow-y-auto p-2 space-y-1">
          {sessions.length === 0 ? (
            <div className="text-center py-8 text-kumo-subtle">
              <ChatCircleDotsIcon size={32} className="mx-auto mb-2 opacity-50" />
              <Text size="xs">No conversations yet</Text>
            </div>
          ) : (
            sessions.map((session) => (
              <button
                key={session.id}
                onClick={() => {
                  handleSelectSession(session.id);
                  if (mobile) setSidebarOpen(false);
                }}
                className={`w-full text-left p-3 rounded-lg transition-colors group ${
                  currentSessionId === session.id
                    ? "bg-kumo-accent/10 ring-1 ring-kumo-accent"
                    : "hover:bg-kumo-control"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <Text
                      size="sm"
                      bold={currentSessionId === session.id}
                      className="truncate"
                    >
                      {session.title}
                    </Text>
                    <Text
                      size="xs"
                      variant="secondary"
                      className="truncate mt-0.5"
                    >
                      {session.lastMessage || "No messages"}
                    </Text>
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
                    onClick={(e) => handleDeleteSession(session.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 rounded hover:bg-kumo-danger/20 text-kumo-subtle hover:text-kumo-danger transition-all"
                    aria-label="Delete session"
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </button>
            ))
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="px-5 py-4 border-b border-kumo-line">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="p-2 rounded-lg hover:bg-kumo-control transition-colors"
                aria-label={mobile ? "Open menu" : "Toggle sidebar"}
              >
                <ListIcon size={20} className="text-kumo-subtle" />
              </button>
              <PlugsConnectedIcon
                size={22}
                className="text-kumo-accent"
                weight="bold"
              />
              <h1 className="text-lg font-semibold text-kumo-default">
                ChatWithMe MCP
              </h1>
            </div>
            <div className="flex items-center gap-3">
              <ConnectionIndicator status={connectionStatus} />
              <ModeToggle />
            </div>
          </div>
        </header>

        {/* Tab Navigation */}
        <div className="border-b border-kumo-line">
          <div className="flex">
            <button
              onClick={() => setActiveTab("chat")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "chat"
                  ? "border-kumo-accent text-kumo-accent"
                  : "border-transparent text-kumo-subtle hover:text-kumo-default"
              }`}
            >
              <ChatCircleIcon size={18} weight="bold" />
              Chat
              {activeToolsCount > 0 && (
                <Badge variant="primary">{activeToolsCount} tools</Badge>
              )}
            </button>
            <button
              onClick={() => setActiveTab("mcp")}
              className={`flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                activeTab === "mcp"
                  ? "border-kumo-accent text-kumo-accent"
                  : "border-transparent text-kumo-subtle hover:text-kumo-default"
              }`}
            >
              <PlugIcon size={18} weight="bold" />
              MCP Servers
              {serverEntries.length > 0 && (
                <Badge variant="secondary">{serverEntries.length}</Badge>
              )}
            </button>
          </div>
        </div>

        <main className="flex-1 overflow-auto p-5">
          {activeTab === "chat" ? (
            /* Chat Tab */
            <div className="flex flex-col h-[calc(100vh-280px)]">
              {/* Chat Messages */}
              <div className="flex-1 overflow-auto space-y-4 mb-4">
                {messages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <Empty
                      icon={<ChatCircleIcon size={32} />}
                      title="Start a conversation"
                      description={
                        activeToolsCount > 0
                          ? `AI has access to ${activeToolsCount} tools (web search, reading). Just ask anything!`
                          : "Connect MCP servers in the MCP tab to enable tool access."
                      }
                    />
                  </div>
                ) : (
                  messages.map((msg) => {
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
                          <div className="max-w-[80%] mb-2 space-y-2">
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
                          className={`max-w-[80%] px-4 py-2 rounded-xl ${
                            isUser
                              ? "bg-kumo-accent text-white"
                              : "bg-kumo-surface ring ring-kumo-line text-kumo-default"
                          }`}
                        >
                          {isUser ? (
                            <Text size="sm" className="whitespace-pre-wrap">
                              {text}
                            </Text>
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
                            disabled={isStreaming}
                            compact={true}
                          />
                        </div>
                      </div>
                    );
                  })
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Chat Input */}
              <ChatInput
                value={input}
                onChange={setInput}
                onSubmit={handleSend}
                onStop={stop}
                isStreaming={isStreaming}
                isConnected={isConnected}
                placeholder={
                  activeToolsCount > 0
                    ? "Ask anything... (AI can search web & read pages)"
                    : "Type a message..."
                }
                multiline={true}
                maxRows={6}
                showCharCount={true}
              />
            </div>
          ) : (
            /* MCP Tab */
            <div className="space-y-8 max-w-3xl">
              {/* Info */}
              <Surface className="p-4 rounded-xl ring ring-kumo-line">
                <div className="flex gap-3">
                  <InfoIcon
                    size={20}
                    weight="bold"
                    className="text-kumo-accent shrink-0 mt-0.5"
                  />
                  <div>
                    <Text size="sm" bold>
                      Pre-configured MCP Servers
                    </Text>
                    <span className="mt-1 block">
                      <Text size="xs" variant="secondary">
                        Toggle servers on/off to activate or deactivate them.
                        Active servers provide tools that the AI can use
                        automatically during chat.
                      </Text>
                    </span>
                  </div>
                </div>
              </Surface>

              {/* Loading State */}
              {isLoading && (
                <div className="flex items-center justify-center py-8">
                  <SpinnerIcon size={24} className="animate-spin text-kumo-accent" />
                  <Text size="sm" className="ml-2">Loading servers...</Text>
                </div>
              )}

              {/* Pre-configured Servers */}
              {!isLoading && preconfiguredServerList.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <PlugIcon size={18} weight="bold" className="text-kumo-subtle" />
                    <Text size="base" bold>
                      Available Servers
                    </Text>
                  </div>
                  <div className="space-y-2">
                    {preconfiguredServerList.map(([name, server]) => (
                      <Surface
                        key={name}
                        className="p-4 rounded-xl ring ring-kumo-line"
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
                                  Active
                                </Badge>
                              ) : (
                                <Badge variant="secondary">Inactive</Badge>
                              )}
                            </div>
                            <Text size="xs" variant="secondary" className="mt-1">
                              {server.config.description}
                            </Text>
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
                                aria-label={`Toggle ${name}`}
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
                      Available Tools
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
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </main>

        <footer className="border-t border-kumo-line py-3">
          <div className="flex justify-center">
            <PoweredByAgents />
          </div>
        </footer>
      </div>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <ToastProvider>
      <App />
      <Toaster />
      <ModalHost />
    </ToastProvider>
  </ThemeProvider>
);
