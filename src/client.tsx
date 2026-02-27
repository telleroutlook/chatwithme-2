import { McpItemCard } from "./components/McpItemCard";
import { Toaster } from "./components/Toaster";
import { ToastProvider, useToast } from "./hooks/useToast.tsx";
import { useAgent } from "agents/react";
import { useCallback, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@cloudflare/agents-ui/hooks";
import {
  ConnectionIndicator,
  ModeToggle,
  PoweredByAgents,
  type ConnectionStatus
} from "@cloudflare/agents-ui";
import { Button, Badge, Surface, Text, Empty } from "@cloudflare/kumo";
import {
  PlusIcon,
  PlugIcon,
  PlugsConnectedIcon,
  WrenchIcon,
  ChatTextIcon,
  DatabaseIcon,
  TrashIcon,
  SignInIcon,
  InfoIcon,
  SpinnerIcon,
  ChatCircleIcon,
  PaperPlaneTiltIcon
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

function App() {
  const { addToast } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("chat");
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("connecting");
  const mcpUrlInputRef = useRef<HTMLInputElement>(null);
  const mcpNameInputRef = useRef<HTMLInputElement>(null);
  const mcpApiKeyInputRef = useRef<HTMLInputElement>(null);
  const [mcpState, setMcpState] = useState<MCPServersState>({
    prompts: [],
    resources: [],
    servers: {},
    tools: []
  });
  const [isConnecting, setIsConnecting] = useState(false);
  const [disconnectingId, setDisconnectingId] = useState<string | null>(null);

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
    onOpen: useCallback(() => setConnectionStatus("connected"), [])
  });

  // Chat Agent
  const chatAgent = useAgent({
    agent: "chat-agent",
    name: sessionId!,
    onClose: useCallback(() => console.log("Chat agent disconnected"), []),
    onOpen: useCallback(() => console.log("Chat agent connected"), [])
  });

  function openPopup(authUrl: string) {
    window.open(
      authUrl,
      "popupWindow",
      "width=600,height=800,resizable=yes,scrollbars=yes"
    );
  }

  const validateForm = useCallback((name: string, url: string): string | null => {
    if (!name.trim()) return "Server name is required";
    if (!url.trim()) return "Server URL is required";
    try {
      new URL(url);
    } catch {
      return "Please enter a valid URL (e.g., https://example.com/mcp)";
    }
    return null;
  }, []);

  const handleMcpSubmit = useCallback(
    async (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      if (!mcpUrlInputRef.current || !mcpNameInputRef.current) return;

      const serverName = mcpNameInputRef.current.value;
      const serverUrl = mcpUrlInputRef.current.value;
      const apiKey = mcpApiKeyInputRef.current?.value?.trim() || undefined;

      const validationError = validateForm(serverName, serverUrl);
      if (validationError) {
        addToast(validationError, "error");
        return;
      }

      setIsConnecting(true);
      try {
        const result = await mcpAgent.call("connectToServer", [
          serverName,
          serverUrl,
          apiKey
        ]);
        if (result.success) {
          mcpUrlInputRef.current.value = "";
          mcpNameInputRef.current.value = "";
          if (mcpApiKeyInputRef.current) mcpApiKeyInputRef.current.value = "";
          addToast(`Server "${serverName}" added successfully`, "success");
        } else {
          addToast(
            `Failed to add server: ${result.error || "Unknown error"}`,
            "error"
          );
        }
      } catch (error) {
        console.error("Failed to add server:", error);
        addToast(
          `Failed to add server: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "error"
        );
      } finally {
        setIsConnecting(false);
      }
    },
    [mcpAgent, validateForm, addToast]
  );

  const handleDisconnect = useCallback(
    async (serverId: string, serverName: string) => {
      const confirmed = window.confirm(`Disconnect "${serverName}"?`);
      if (!confirmed) return;

      setDisconnectingId(serverId);
      try {
        await mcpAgent.call("disconnectFromServer", [serverId]);
        addToast(`Server "${serverName}" disconnected`, "success");
      } catch (error) {
        console.error("Failed to disconnect server:", error);
        addToast(
          `Failed to disconnect: ${
            error instanceof Error ? error.message : "Unknown error"
          }`,
          "error"
        );
      } finally {
        setDisconnectingId(null);
      }
    },
    [mcpAgent, addToast]
  );

  const handleChatSubmit = useCallback(
    async (e: React.FormEvent) => {
      e.preventDefault();
      if (!chatInput.trim() || isChatLoading) return;

      const userMessage = chatInput.trim();
      setChatInput("");
      setChatMessages((prev) => [...prev, { role: "user", content: userMessage }]);
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
        // Scroll to bottom
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
                      description="Type a message below to chat with the AI assistant. Connect MCP servers to enable web search and reading capabilities."
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
                      MCP Client
                    </Text>
                    <span className="mt-1 block">
                      <Text size="xs" variant="secondary">
                        Connect to external MCP servers to enable web search,
                        reading, and more. The AI assistant will automatically
                        use these tools when needed.
                      </Text>
                    </span>
                  </div>
                </div>
              </Surface>

              {/* Add Server Form */}
              <Surface className="p-4 rounded-xl ring ring-kumo-line">
                <div className="mb-3">
                  <Text size="sm" bold>
                    Connect to an MCP Server
                  </Text>
                </div>
                <form onSubmit={handleMcpSubmit} className="space-y-2">
                  <div className="flex gap-2 items-end">
                    <div className="w-40">
                      <label
                        htmlFor="mcp-name"
                        className="block text-xs text-kumo-subtle mb-1"
                      >
                        Name *
                        <input
                          id="mcp-name"
                          ref={mcpNameInputRef}
                          type="text"
                          placeholder="My Server"
                          aria-required="true"
                          className="w-full px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent"
                        />
                      </label>
                    </div>
                    <div className="flex-1">
                      <label
                        htmlFor="mcp-url"
                        className="block text-xs text-kumo-subtle mb-1"
                      >
                        URL *
                        <input
                          id="mcp-url"
                          ref={mcpUrlInputRef}
                          type="text"
                          placeholder="https://example.com/mcp"
                          aria-required="true"
                          className="w-full px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent"
                        />
                      </label>
                    </div>
                    <Button
                      type="submit"
                      variant="primary"
                      size="sm"
                      icon={
                        isConnecting ? (
                          <SpinnerIcon size={14} className="animate-spin" />
                        ) : (
                          <PlusIcon size={14} />
                        )
                      }
                      disabled={isConnecting}
                    >
                      {isConnecting ? "Adding..." : "Add"}
                    </Button>
                  </div>
                  <div className="flex-1">
                    <label
                      htmlFor="mcp-apikey"
                      className="block text-xs text-kumo-subtle mb-1"
                    >
                      API Key (optional)
                      <input
                        id="mcp-apikey"
                        ref={mcpApiKeyInputRef}
                        type="password"
                        placeholder="For servers requiring Bearer token auth"
                        className="w-full px-3 py-1.5 text-sm rounded-lg border border-kumo-line bg-kumo-base text-kumo-default placeholder:text-kumo-inactive focus:outline-none focus:ring-1 focus:ring-kumo-accent"
                      />
                    </label>
                  </div>
                </form>
              </Surface>

              {/* Connected Servers */}
              <section>
                <div className="flex items-center gap-2 mb-3">
                  <PlugIcon
                    size={18}
                    weight="bold"
                    className="text-kumo-subtle"
                  />
                  <Text size="base" bold>
                    Servers
                  </Text>
                  <Badge variant="secondary">{serverEntries.length}</Badge>
                </div>
                {serverEntries.length === 0 ? (
                  <Empty
                    icon={<PlugIcon size={32} />}
                    title="No servers connected"
                    description="Add an MCP server URL above to get started."
                  />
                ) : (
                  <div className="space-y-2">
                    {serverEntries.map(([id, server]) => (
                      <Surface
                        key={id}
                        className="p-4 rounded-xl ring ring-kumo-line"
                      >
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="flex items-center gap-2">
                              <Text size="sm" bold>
                                {server.name}
                              </Text>
                              <Badge
                                variant={
                                  server.state === "ready"
                                    ? "primary"
                                    : server.state === "failed"
                                    ? "destructive"
                                    : "secondary"
                                }
                              >
                                {server.state}
                              </Badge>
                            </div>
                            <span className="mt-0.5 font-mono block">
                              <Text size="xs" variant="secondary">
                                {server.server_url}
                              </Text>
                            </span>
                            {server.state === "failed" && server.error && (
                              <span className="text-red-500 mt-1 block">
                                <Text size="xs">{server.error}</Text>
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-2">
                            {server.state === "authenticating" &&
                              server.auth_url && (
                                <Button
                                  variant="primary"
                                  size="sm"
                                  icon={<SignInIcon size={14} />}
                                  onClick={() =>
                                    openPopup(server.auth_url as string)
                                  }
                                >
                                  Authorize
                                </Button>
                              )}
                            <Button
                              variant="ghost"
                              size="sm"
                              icon={
                                disconnectingId === id ? (
                                  <SpinnerIcon
                                    size={14}
                                    className="animate-spin"
                                  />
                                ) : (
                                  <TrashIcon size={14} />
                                )
                              }
                              aria-label={`Disconnect ${server.name}`}
                              disabled={disconnectingId === id}
                              onClick={() => handleDisconnect(id, server.name)}
                            />
                          </div>
                        </div>
                      </Surface>
                    ))}
                  </div>
                )}
              </section>

              {/* Tools */}
              {mcpState.tools.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <WrenchIcon
                      size={18}
                      weight="bold"
                      className="text-kumo-subtle"
                    />
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
