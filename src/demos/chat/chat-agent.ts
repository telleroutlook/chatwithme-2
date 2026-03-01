import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable, getAgentByName } from "agents";
import {
  generateText,
  streamText,
  convertToModelMessages,
  pruneMessages,
  tool,
  stepCountIs,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
  type ModelMessage,
  type ToolSet,
  type UIMessageStreamWriter
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { z } from "zod";
import { MCP_SERVERS, getApiKey, type McpServerConfig } from "../../mcp-config";
import {
  getMessageText,
  normalizeToolArguments as normalizeArgs,
  toFallbackModelMessages
} from "./model-utils";

// MCP Server state (separate from chat messages)
export interface McpServerState {
  preconfiguredServers: Record<
    string,
    {
      config: McpServerConfig;
      serverId?: string;
      connected: boolean;
      error?: string;
    }
  >;
}

type ProgressPhase = "context" | "model" | "thinking" | "tool" | "heartbeat" | "result" | "error";

interface LiveProgressEvent {
  phase: ProgressPhase;
  message: string;
  status?: "start" | "success" | "error" | "info";
  toolName?: string;
  snippet?: string;
}

type ProgressEmitter = (event: LiveProgressEvent) => void;

/**
 * Unified Chat + MCP Agent
 *
 * Extends AIChatAgent for:
 * - Automatic message persistence to SQLite
 * - Built-in message pruning
 * - Streaming responses
 *
 * Adds MCP capabilities:
 * - Pre-configured MCP server management
 * - Dynamic tool execution
 */
export class ChatAgent extends AIChatAgent<Env> {
  // Keep last 100 messages in SQLite storage
  maxPersistedMessages = 100;

  // MCP server state (stored separately)
  private mcpServerState: McpServerState = {
    preconfiguredServers: {}
  };
  private mcpInitPromise: Promise<void> | null = null;

  private parseBooleanEnv(raw: string | undefined, defaultValue: boolean): boolean {
    if (!raw) return defaultValue;
    const normalized = raw.toLowerCase();
    if (["1", "true", "yes", "on"].includes(normalized)) return true;
    if (["0", "false", "no", "off"].includes(normalized)) return false;
    return defaultValue;
  }

  private isModelStreamEnabled(): boolean {
    return this.parseBooleanEnv(this.runtimeEnv.CHAT_MODEL_STREAM, true);
  }

  private getThinkingType(): "enabled" | "disabled" {
    const explicit = this.runtimeEnv.CHAT_MODEL_THINKING?.toLowerCase();
    if (explicit === "enabled" || explicit === "disabled") {
      return explicit;
    }
    return this.isThinkingEnabled() ? "enabled" : "disabled";
  }

  private getModelId(): string {
    return this.runtimeEnv.CHAT_MODEL_ID || "GLM-4.7";
  }

  private getMaxOutputTokens(): number | undefined {
    const raw = this.runtimeEnv.CHAT_MODEL_MAX_TOKENS;
    if (!raw) return undefined;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
  }

  private async requestModelText(params: {
    model: LanguageModel;
    system: string;
    messages: ModelMessage[];
    temperature: number;
    tools?: ToolSet;
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const maxOutputTokens = this.getMaxOutputTokens();
    const callOptions = {
      model: params.model,
      system: params.system,
      messages: params.messages,
      temperature: params.temperature,
      tools: params.tools,
      stopWhen: stepCountIs(6),
      abortSignal: params.abortSignal,
      ...(maxOutputTokens ? { maxOutputTokens } : {}),
      providerOptions: {
        glm: {
          thinking: {
            type: this.getThinkingType()
          }
        }
      }
    };

    if (this.isModelStreamEnabled()) {
      const result = streamText(callOptions);
      return await result.text;
    }

    const { text } = await generateText(callOptions);
    return text;
  }

  private get runtimeEnv(): Env {
    return (this as unknown as { env: Env }).env;
  }

  private isThinkingEnabled(): boolean {
    return this.parseBooleanEnv(this.runtimeEnv.CHAT_ENABLE_THINKING, false);
  }

  private emitProgress(writer: UIMessageStreamWriter, event: LiveProgressEvent): void {
    if (event.phase === "thinking" && !this.isThinkingEnabled()) {
      return;
    }
    writer.write({
      type: "data-progress",
      transient: true,
      data: {
        id: crypto.randomUUID(),
        timestamp: new Date().toISOString(),
        ...event
      }
    });
  }

  private getMessageText(message: { parts: Array<{ type: string; text?: string }> }): string {
    return getMessageText(message.parts);
  }

  private normalizeToolArguments(
    toolName: string,
    args: Record<string, unknown>
  ): Record<string, unknown> {
    return normalizeArgs(toolName, args);
  }

  private async convertMessagesWithFallback(
    emitProgress?: ProgressEmitter
  ): Promise<{ modelMessages: ModelMessage[]; source: "converted" | "fallback" }> {
    const currentMessages = Array.isArray(this.messages) ? this.messages : [];
    try {
      const converted = await convertToModelMessages(currentMessages);
      return { modelMessages: converted, source: "converted" };
    } catch (error) {
      const fallbackMessages = toFallbackModelMessages(currentMessages);

      emitProgress?.({
        phase: "context",
        status: "error",
        message: "Message conversion failed. Using text-only fallback history.",
        snippet: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240)
      });
      return { modelMessages: fallbackMessages, source: "fallback" };
    }
  }

  private async buildAiTools(emitProgress?: ProgressEmitter): Promise<{
    tools: ToolSet;
    toolList: string[];
  }> {
    await this.ensureMcpConnections();
    if (!this.mcp) return { tools: {}, toolList: [] };

    const availableTools = this.mcp.listTools();
    const shortNameCounts = new Map<string, number>();

    for (const item of availableTools) {
      const shortName = item.name.includes(".") ? item.name.split(".").slice(1).join(".") : item.name;
      shortNameCounts.set(shortName, (shortNameCounts.get(shortName) || 0) + 1);
    }

    const tools: ToolSet = {};
    const toolList: string[] = [];

    for (const item of availableTools) {
      const rawName = item.name.includes(".") ? item.name.split(".").slice(1).join(".") : item.name;
      const serverId = item.name.includes(".") ? item.name.split(".")[0] : item.serverId;
      const shortName = rawName;

      const aliases = shortNameCounts.get(shortName) === 1 ? [shortName, item.name] : [item.name];
      for (const alias of aliases) {
        if (tools[alias]) continue;
        tools[alias] = tool({
          description: item.description || `MCP tool ${rawName}`,
          inputSchema: z.object({}).passthrough(),
          execute: async (args: Record<string, unknown>) => {
            const normalizedArgs = this.normalizeToolArguments(rawName, args);
            emitProgress?.({
              phase: "tool",
              status: "start",
              toolName: alias,
              message: `Executing tool "${alias}"`,
              snippet: JSON.stringify(normalizedArgs).slice(0, 240)
            });
            try {
              if (!this.mcp) {
                return { error: "MCP unavailable" };
              }
              const result = await this.mcp.callTool({
                name: rawName,
                serverId,
                arguments: normalizedArgs
              });
              const resultSnippet =
                typeof result === "string" ? result : JSON.stringify(result, null, 2);
              emitProgress?.({
                phase: "tool",
                status: "success",
                toolName: alias,
                message: `Tool "${alias}" completed`,
                snippet: resultSnippet.slice(0, 320)
              });
              return result;
            } catch (error) {
              const message = error instanceof Error ? error.message : String(error);
              emitProgress?.({
                phase: "tool",
                status: "error",
                toolName: alias,
                message: `Tool "${alias}" failed`,
                snippet: message.slice(0, 240)
              });
              return { error: message };
            }
          }
        });
      }
      toolList.push(`${item.name}: ${item.description || "No description"}`);
    }

    return { tools, toolList };
  }

  async onStart() {
    // Initialize pre-configured servers
    for (const config of MCP_SERVERS) {
      this.mcpServerState.preconfiguredServers[config.name] = {
        config,
        connected: false
      };
    }
  }

  private async ensureMcpConnections(): Promise<void> {
    if (this.mcpInitPromise) {
      await this.mcpInitPromise;
      return;
    }

    this.mcpInitPromise = (async () => {
      for (const config of MCP_SERVERS) {
        if (config.active) {
          await this.activateServer(config.name);
        }
      }
    })();

    try {
      await this.mcpInitPromise;
    } finally {
      this.mcpInitPromise = null;
    }
  }

  /**
   * Main chat handler - called when user sends a message
   * AIChatAgent automatically handles message persistence
   */
  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const latestUserMessage = [...this.messages].reverse().find((msg) => msg.role === "user");

    const latestUserText = latestUserMessage ? this.getMessageText(latestUserMessage) : "";

    if (!latestUserText.trim()) {
      const emptyId = crypto.randomUUID();
      const emptyStream = createUIMessageStream({
        execute: ({ writer }) => {
          writer.write({ type: "text-start", id: emptyId });
          writer.write({ type: "text-delta", id: emptyId, delta: "请先输入问题。" });
          writer.write({ type: "text-end", id: emptyId });
        }
      });
      return createUIMessageStreamResponse({ stream: emptyStream });
    }

    const textId = crypto.randomUUID();

    const stream = createUIMessageStream({
      execute: async ({ writer }) => {
        const emitProgress: ProgressEmitter = (event) => this.emitProgress(writer, event);

        emitProgress({
          phase: "context",
          status: "start",
          message: "Message received. Preparing response pipeline."
        });

        const heartbeat = setInterval(() => {
          emitProgress({
            phase: "heartbeat",
            status: "info",
            message: "Still working..."
          });
        }, 1200);

        writer.write({ type: "text-start", id: textId });
        writer.write({
          type: "text-delta",
          id: textId,
          // Send an invisible keepalive chunk so the client receives an early stream event.
          delta: "\u200b"
        });
        try {
          const finalResponse = await this.generateAssistantResponse(
            latestUserText,
            true,
            options?.abortSignal,
            emitProgress
          );
          writer.write({ type: "text-delta", id: textId, delta: finalResponse });
          writer.write({ type: "text-end", id: textId });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown generation error";
          emitProgress({
            phase: "error",
            status: "error",
            message: "Generation failed.",
            snippet: message.slice(0, 240)
          });
          writer.write({
            type: "text-delta",
            id: textId,
            delta: `抱歉，处理请求时出错：${message}`
          });
          writer.write({ type: "text-end", id: textId });
        } finally {
          clearInterval(heartbeat);
        }
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  /**
   * Build system prompt with available MCP tools and chart generation instructions
   */
  private buildSystemPrompt(toolList: string[]): string {
    return `You are a helpful AI assistant with the following capabilities:

## 1. Web Tools (MCP)
${toolList.length > 0 ? toolList.map((line) => `- ${line}`).join("\n") : "No tools available."}

You can call the tools directly when external information is required.

## 2. Chart Generation

When asked to create charts or diagrams, you MUST output them in code blocks.
For scenarios that are suitable for chart-based visualization, prefer G2 JSON charts first.
Use Mermaid as a secondary option when G2 is not suitable, or when the user explicitly asks for diagrams.

### For Diagrams (flowcharts, sequence, pie charts):
Use Mermaid syntax in a code block:

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
\`\`\`

Mermaid examples:

**Pie Chart:**
\`\`\`mermaid
pie title Sales Distribution
    "East" : 35
    "West" : 25
    "North" : 20
    "South" : 20
\`\`\`

**Flowchart:**
\`\`\`mermaid
flowchart LR
    A[Input] --> B[Process]
    B --> C[Output]
\`\`\`

**Sequence Diagram:**
\`\`\`mermaid
sequenceDiagram
    User->>Server: Request
    Server->>Database: Query
    Database-->>Server: Result
    Server-->>User: Response
\`\`\`

### For Data Charts (bar, line, area, scatter):
Use G2 JSON format in a code block:

\`\`\`g2
{
  "type": "interval",
  "data": [
    {"month": "Jan", "sales": 100},
    {"month": "Feb", "sales": 150},
    {"month": "Mar", "sales": 200}
  ],
  "encode": {"x": "month", "y": "sales"}
}
\`\`\`

G2 chart types:
- "interval" : bar/column charts
- "line" : line charts
- "area" : area charts
- "point" : scatter plots
- "cell" : heatmaps

**Line Chart Example:**
\`\`\`g2
{
  "type": "line",
  "data": [
    {"date": "2024-01", "value": 120},
    {"date": "2024-02", "value": 180},
    {"date": "2024-03", "value": 150}
  ],
  "encode": {"x": "date", "y": "value"}
}
\`\`\`

IMPORTANT:
- Always use actual code blocks (triple backticks) for charts
- Prefer G2 for data visualization with numbers and chart-friendly scenarios
- Use Mermaid as the second choice for diagrams or when G2 is not suitable
- Make sure JSON is valid in G2 blocks
- After generating a chart, briefly explain what it shows`;
  }

  // ============ Chat Methods (callable for REST API) ============

  private async generateAssistantResponse(
    message: string,
    userAlreadyInHistory: boolean,
    abortSignal?: AbortSignal,
    emitProgress?: ProgressEmitter
  ): Promise<string> {
    emitProgress?.({
      phase: "context",
      status: "start",
      message: "Loading system prompt and tool context."
    });

    const { tools, toolList } = await this.buildAiTools(emitProgress);
    const systemPrompt = this.buildSystemPrompt(toolList);
    emitProgress?.({
      phase: "context",
      status: "success",
      message: "Context ready. Requesting draft answer from model."
    });

    // Create GLM provider
    const glm = createOpenAICompatible({
      name: "glm",
      apiKey: this.runtimeEnv.BIGMODEL_API_KEY,
      baseURL: "https://open.bigmodel.cn/api/coding/paas/v4"
    });

    const { modelMessages: existingMessages, source } = await this.convertMessagesWithFallback(
      emitProgress
    );

    const userMessage: ModelMessage = {
      role: "user",
      content: [{ type: "text", text: message }]
    };
    const candidateMessages = userAlreadyInHistory
      ? existingMessages
      : [...existingMessages, userMessage];
    const messages = pruneMessages({
      messages: candidateMessages,
      toolCalls: "before-last-2-messages",
      reasoning: "before-last-message"
    });

    emitProgress?.({
      phase: "context",
      status: "info",
      message: `History prepared (${source}); messages: ${candidateMessages.length} -> ${messages.length}.`
    });

    emitProgress?.({
      phase: "model",
      status: "start",
      message: "Model is generating the response."
    });
    const finalResponse = await this.requestModelText({
      model: glm(this.getModelId()),
      system: systemPrompt,
      messages,
      tools,
      temperature: 0.7,
      abortSignal
    });
    emitProgress?.({
      phase: "thinking",
      status: "info",
      message: "Response generation completed.",
      snippet: finalResponse.slice(0, 320)
    });

    emitProgress?.({
      phase: "result",
      status: "success",
      message: "Final answer ready to stream."
    });
    return finalResponse;
  }

  @callable({ description: "Send a chat message and get AI response with tool execution" })
  async chat(message: string): Promise<string> {
    const finalResponse = await this.generateAssistantResponse(message, false);

    // Persist messages to storage using proper ChatMessage format
    const timestamp = Date.now();
    const currentMessages = Array.isArray(this.messages) ? this.messages : [];
    try {
      await this.persistMessages([
        ...currentMessages,
        {
          id: `user-${timestamp}`,
          role: "user",
          parts: [{ type: "text", text: message }]
        },
        {
          id: `assistant-${timestamp}`,
          role: "assistant",
          parts: [{ type: "text", text: finalResponse }]
        }
      ]);
    } catch (e) {
      console.error("Error persisting messages:", e);
    }

    return finalResponse;
  }

  @callable({ description: "Get chat message history" })
  async getHistory(): Promise<Array<{ role: string; content: string; id?: string }>> {
    const messages = Array.isArray(this.messages) ? this.messages : [];
    return messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: this.getMessageText(msg)
    }));
  }

  @callable({ description: "Clear chat history" })
  async clearChat(): Promise<{ success: boolean }> {
    // Clear all messages by directly deleting from SQL
    try {
      this.sql`DELETE FROM cf_ai_chat_agent_messages`;
      // Also clear the in-memory messages array
      this.messages.length = 0;
      return { success: true };
    } catch (e) {
      console.error("Error clearing messages:", e);
      return { success: false };
    }
  }

  @callable({ description: "Delete a single chat message by id" })
  async deleteMessage(
    messageId: string
  ): Promise<{ success: boolean; deleted: boolean; error?: string }> {
    if (!messageId) {
      return { success: false, deleted: false, error: "Message ID is required" };
    }

    try {
      const existing =
        this.sql<{ cnt: number }>`
          select count(*) as cnt
          from cf_ai_chat_agent_messages
          where id = ${messageId}
        ` ?? [];

      const deleted = (existing[0]?.cnt ?? 0) > 0;

      this.sql`
        delete from cf_ai_chat_agent_messages
        where id = ${messageId}
      `;

      this.messages = (Array.isArray(this.messages) ? this.messages : []).filter(
        (message) => message.id !== messageId
      );

      return { success: true, deleted };
    } catch (e) {
      const error = e instanceof Error ? e.message : "Unknown error";
      console.error("Error deleting message:", e);
      return { success: false, deleted: false, error };
    }
  }

  @callable({ description: "Edit an existing user message" })
  async editUserMessage(
    messageId: string,
    content: string
  ): Promise<{ success: boolean; updated: boolean; error?: string }> {
    if (!messageId || !content.trim()) {
      return { success: false, updated: false, error: "Message ID and content are required" };
    }

    try {
      const currentMessages = Array.isArray(this.messages) ? this.messages : [];
      const targetIndex = currentMessages.findIndex(
        (message) => message.id === messageId && message.role === "user"
      );

      if (targetIndex < 0) {
        return { success: false, updated: false, error: "User message not found" };
      }

      const targetMessage = currentMessages[targetIndex];
      const existingText = this.getMessageText(targetMessage);
      if (existingText.trim() === content.trim()) {
        return { success: true, updated: false };
      }

      const nextMessages = currentMessages.map((message, index) => {
        if (index !== targetIndex) {
          return message;
        }
        return {
          ...message,
          parts: [{ type: "text" as const, text: content.trim() }]
        };
      });

      await this.persistMessages(nextMessages);
      return { success: true, updated: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, updated: false, error: message };
    }
  }

  @callable({ description: "Regenerate assistant response starting from a specific message" })
  async regenerateFrom(
    messageId: string
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    if (!messageId) {
      return { success: false, error: "Message ID is required" };
    }

    try {
      const currentMessages = Array.isArray(this.messages) ? this.messages : [];
      const index = currentMessages.findIndex((message) => message.id === messageId);
      if (index < 0) {
        return { success: false, error: "Message not found" };
      }

      let anchorIndex = index;
      if (currentMessages[index].role !== "user") {
        for (let i = index; i >= 0; i -= 1) {
          if (currentMessages[i].role === "user") {
            anchorIndex = i;
            break;
          }
        }
      }

      const anchorMessage = currentMessages[anchorIndex];
      if (!anchorMessage || anchorMessage.role !== "user") {
        return { success: false, error: "No user message found for regeneration" };
      }

      const userText = this.getMessageText(anchorMessage).trim();
      if (!userText) {
        return { success: false, error: "User message content is empty" };
      }

      const preservedMessages = currentMessages.slice(0, anchorIndex + 1);
      await this.persistMessages(preservedMessages);

      const regenerated = await this.generateAssistantResponse(userText, true);
      const assistantMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant" as const,
        parts: [{ type: "text" as const, text: regenerated }]
      };
      await this.persistMessages([...preservedMessages, assistantMessage]);

      return { success: true, response: regenerated };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  @callable({ description: "Seed a session with specific history messages" })
  async seedHistory(
    messages: Array<{ id: string; role: "user" | "assistant" | "system"; parts: Array<{ type: "text"; text: string }> }>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      await this.persistMessages(messages);
      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  @callable({ description: "Fork current session into a new session from a specific message" })
  async forkSession(
    messageId: string
  ): Promise<{ success: boolean; newSessionId?: string; error?: string }> {
    if (!messageId) {
      return { success: false, error: "Message ID is required" };
    }

    try {
      const currentMessages = Array.isArray(this.messages) ? this.messages : [];
      const index = currentMessages.findIndex((message) => message.id === messageId);
      if (index < 0) {
        return { success: false, error: "Message not found" };
      }

      const forkedHistory = currentMessages.slice(0, index + 1);
      const newSessionId = crypto.randomUUID().slice(0, 8);
      const targetAgent = (await getAgentByName(this.runtimeEnv.ChatAgent, newSessionId)) as {
        seedHistory: (
          messages: Array<{
            id: string;
            role: "user" | "assistant" | "system";
            parts: Array<{ type: "text"; text: string }>;
          }>
        ) => Promise<{ success: boolean; error?: string }>;
      };
      const result = await targetAgent.seedHistory(
        forkedHistory as Array<{
          id: string;
          role: "user" | "assistant" | "system";
          parts: Array<{ type: "text"; text: string }>;
        }>
      );
      if (!result?.success) {
        return { success: false, error: result?.error || "Failed to seed forked session" };
      }

      return { success: true, newSessionId };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return { success: false, error: message };
    }
  }

  // ============ MCP Server Management (callable methods) ============

  @callable({ description: "Get list of pre-configured MCP servers" })
  async getPreconfiguredServers(): Promise<McpServerState["preconfiguredServers"]> {
    return this.mcpServerState.preconfiguredServers;
  }

  @callable({ description: "Activate a pre-configured MCP server" })
  async activateServer(name: string): Promise<{ success: boolean; error?: string }> {
    const serverEntry = this.mcpServerState.preconfiguredServers[name];
    if (!serverEntry) {
      return { success: false, error: `Server "${name}" not found` };
    }

    const config = serverEntry.config;
    const runtimeEnv = this.runtimeEnv;
    const apiKey = getApiKey(config, runtimeEnv);

    try {
      const options: {
        callbackHost?: string;
        transport?: { type?: "streamable-http"; headers?: HeadersInit };
      } = {};

      if (runtimeEnv.HOST) {
        options.callbackHost = runtimeEnv.HOST;
      }

      if (apiKey) {
        options.transport = {
          type: "streamable-http",
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        };
      }

      const result = await this.addMcpServer(name, config.url, options);

      this.mcpServerState.preconfiguredServers[name] = {
        ...serverEntry,
        serverId: result.id,
        connected: true,
        error: undefined
      };

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.mcpServerState.preconfiguredServers[name] = {
        ...serverEntry,
        connected: false,
        error: message
      };

      return { success: false, error: message };
    }
  }

  @callable({ description: "Deactivate a pre-configured MCP server" })
  async deactivateServer(name: string): Promise<{ success: boolean }> {
    const serverEntry = this.mcpServerState.preconfiguredServers[name];
    if (!serverEntry || !serverEntry.serverId) {
      return { success: false };
    }

    try {
      await this.removeMcpServer(serverEntry.serverId);

      this.mcpServerState.preconfiguredServers[name] = {
        ...serverEntry,
        serverId: undefined,
        connected: false
      };

      return { success: true };
    } catch (error) {
      console.error(`Failed to deactivate server ${name}:`, error);
      return { success: false };
    }
  }

  @callable({ description: "Toggle a pre-configured MCP server on/off" })
  async toggleServer(
    name: string
  ): Promise<{ success: boolean; active?: boolean; error?: string }> {
    const serverEntry = this.mcpServerState.preconfiguredServers[name];
    if (!serverEntry) {
      return { success: false, error: `Server "${name}" not found` };
    }

    if (serverEntry.connected) {
      const result = await this.deactivateServer(name);
      return { ...result, active: false };
    } else {
      const result = await this.activateServer(name);
      return { ...result, active: result.success };
    }
  }

  @callable({ description: "Get available MCP tools" })
  async getAvailableTools() {
    try {
      await this.ensureMcpConnections();
      if (!this.mcp) {
        return [];
      }
      const tools = this.mcp.listTools();
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        serverId: tool.name.includes(".") ? tool.name.split(".")[0] : tool.serverId
      }));
    } catch (error) {
      console.error("Failed to get MCP tools:", error);
      return [];
    }
  }
}
