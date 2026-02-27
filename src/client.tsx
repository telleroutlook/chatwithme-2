import { McpItemCard } from "./components/McpItemCard";
import { Toaster } from "./components/Toaster";
import { ToastProvider, useToast } from "./hooks/useToast.tsx";
import { useAgent } from "agents/react";
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
  PlusIcon,
  PlugIcon,
  PlugsConnectedIcon,
  WrenchIcon,
  TrashIcon,
  SignInIcon,
  InfoIcon,
  SpinnerIcon,
  ChatCircleIcon,
  PaperPlaneTiltIcon,
  CheckCircleIcon,
  WarningIcon
} from "@phosphor-icons/react";
import type { MCPServersState } from "agents";
import { nanoid } from "nanoid";
import "./styles.css";

let sessionId = localStorage.getItem("sessionId");
if (!sessionId) {
  sessionId = nanoid(8);
  localStorage.setItem("sessionId", sessionId);
}

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

  // Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatMessages, setChatMessages] = useState<
    Array<{ role: "user" | "assistant"; content: string }>
  >([]);
  const [isChatLoading, setIsChatLoading] = useState(false);
  const chatContainerRef = useRef<HTMLDivElement>(null);

  // MCP Client Agent
  const mcpAgent = useAgent({
    agent: "mcp-client-agent",
    name: sessionId!,
    onClose: useCallback(() => setConnectionStatus("disconnected"), []),
    onMcpUpdate: useCallback((mcpServers: MCPServersState) => {
      setMcpState(mcpServers);
    }, []),
    onOpen: useCallback(() => {
      setConnectionStatus("connected");
      // Load pre-configured servers
      loadPreconfiguredServers();
    }, [])
  });

  // Chat Agent
  const chatAgent = useAgent({
    agent: "chat-agent",
    name: sessionId!,
    onClose: useCallback(() => console.log("Chat agent disconnected"), []),
    onOpen: useCallback(() => console.log("Chat agent connected"), [])
  });

  const loadPreconfiguredServers = useCallback(async () => {
    try {
      const servers = await mcpAgent.call("getPreconfiguredServers", []);
      setPreconfiguredServers(servers as Record<string, PreconfiguredServer>);
    } catch (error) {
      console.error("Failed to load pre-configured servers:", error);
    } finally {
      setIsLoading(false);
    }
  }, [mcpAgent]);

  useEffect(() => {
    if (connectionStatus === "connected") {
      loadPreconfiguredServers();
    }
  }, [connectionStatus, loadPreconfiguredServers]);

  const handleToggleServer = useCallback(
    async (name: string) => {
      setTogglingServer(name);
      try {
        const result = await mcpAgent.call("toggleServer", [name]);
        if (result.success) {
          addToast(
            `Server "${name}" ${result.active ? "activated" : "deactivated"}`,
            "success"
          );
          // Reload servers
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
    [mcpAgent, addToast, loadPreconfiguredServers]
  );

  const handleChatSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatInput.trim() || isChatLoading) return;

      const userMessage = chatInput.trim();
      setChatInput("");
      setChatMessages((prev) => [
        ...prev,
        { role: "user", content: userMessage }
      ]);
      setIsChatLoading(true);

      try {
        const response = await chatAgent.call("chat", [userMessage]);
        setChatMessages((prev) => [
          ...prev,
          { role: "assistant", content: response as string }
        ]);
      } catch (error) {
        console.error("Chat error:", error);
        addToast(
          `Chat error: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "error"
        );
      } finally {
        setIsChatLoading(false);
        setTimeout(() => {
          chatContainerRef.current?.scrollTo({
            top: chatContainerRef.current.scrollHeight,
            behavior: "smooth"
          });
        }, 100);
      }
    },
    [chatInput, isChatLoading, chatAgent, addToast]
  );

  const serverEntries = useMemo(
    () => Object.entries(mcpState.servers),
    [mcpState.servers]
  );

  const preconfiguredServerList = useMemo(
    () => Object.entries(preconfiguredServers),
    [preconfiguredServers]
  );

  return (
    <div className="h-full flex flex-col bg-kumo-base">
      <header className="px-5 py-4 border-b border-kumo-line">
        <div className="max-w-3xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-3">
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
        <div className="max-w-3xl mx-auto flex">
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
        <div className="max-w-3xl mx-auto">
          {activeTab === "chat" ? (
            /* Chat Tab */
            <div className="flex flex-col h-[calc(100vh-280px)]">
              {/* Chat Messages */}
              <div
                ref={chatContainerRef}
                className="flex-1 overflow-auto space-y-4 mb-4"
              >
                {chatMessages.length === 0 ? (
                  <div className="flex items-center justify-center h-full">
                    <Empty
                      icon={<ChatCircleIcon size={32} />}
                      title="Start a conversation"
                      description="Type a message below to chat with the AI assistant. Connected MCP tools will be used automatically when needed."
                    />
                  </div>
                ) : (
                  chatMessages.map((msg, idx) => (
                    <div
                      key={idx}
                      className={`flex ${
                        msg.role === "user" ? "justify-end" : "justify-start"
                      }`}
                    >
                      <div
                        className={`max-w-[80%] px-4 py-2 rounded-xl ${
                          msg.role === "user"
                            ? "bg-kumo-accent text-white"
                            : "bg-kumo-surface ring ring-kumo-line text-kumo-default"
                        }`}
                      >
                        <Text size="sm" className="whitespace-pre-wrap">
                          {msg.content}
                        </Text>
                      </div>
                    </div>
                  ))
                )}
                {isChatLoading && (
                  <div className="flex justify-start">
                    <div className="bg-kumo-surface ring ring-kumo-line px-4 py-2 rounded-xl">
                      <SpinnerIcon
                        size={16}
                        className="animate-spin text-kumo-subtle"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Chat Input */}
              <form onSubmit={handleChatSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  placeholder="Type a message..."
                  disabled={isChatLoading}
                  className="flex-1 px-4 py-2 text-sm rounded-xl border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent disabled:opacity-50"
                />
                <Button
                  type="submit"
                  variant="primary"
                  disabled={!chatInput.trim() || isChatLoading}
                  icon={
                    isChatLoading ? (
                      <SpinnerIcon size={16} className="animate-spin" />
                    ) : (
                      <PaperPlaneTiltIcon size={16} />
                    )
                  }
                >
                  Send
                </Button>
              </form>
            </div>
          ) : (
            /* MCP Tab */
            <div className="space-y-8">
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
        </div>
      </main>

      <footer className="border-t border-kumo-line py-3">
        <div className="flex justify-center">
          <PoweredByAgents />
        </div>
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(
  <ThemeProvider>
    <ToastProvider>
      <App />
      <Toaster />
    </ToastProvider>
  </ThemeProvider>
);
