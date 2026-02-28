import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable } from "agents";
import {
  generateText,
  streamText,
  convertToModelMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type LanguageModel,
  type ModelMessage,
  type UIMessageStreamWriter
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { MCP_SERVERS, getApiKey, type McpServerConfig } from "../../mcp-config";

// MCP Server state (separate from chat messages)
export interface McpServerState {
  preconfiguredServers: Record<string, {
    config: McpServerConfig;
    serverId?: string;
    connected: boolean;
    error?: string;
  }>;
}

interface ToolExecutionResult {
  detected: boolean;
  executed: boolean;
  toolName?: string;
  result?: string;
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
    abortSignal?: AbortSignal;
  }): Promise<string> {
    const maxOutputTokens = this.getMaxOutputTokens();
    const callOptions = {
      model: params.model,
      system: params.system,
      messages: params.messages,
      temperature: params.temperature,
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

  private emitProgress(
    writer: UIMessageStreamWriter,
    event: LiveProgressEvent
  ): void {
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
    return message.parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }

  private extractToolCallJson(message: string): string | null {
    const jsonMatch = message.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (jsonMatch?.[1]) {
      return jsonMatch[1].trim();
    }

    const objectMatch = message.match(/\{[\s\S]*"tool_call"[\s\S]*\}/);
    return objectMatch?.[0]?.trim() ?? null;
  }

  private normalizeToolArguments(
    toolName: string,
    args: Record<string, unknown>
  ): Record<string, unknown> {
    const normalized = { ...args };

    if (toolName === "webSearchPrime") {
      const queryValue =
        typeof normalized.search_query === "string"
          ? normalized.search_query
          : typeof normalized.query === "string"
            ? normalized.query
            : "";
      if (queryValue) {
        normalized.search_query = queryValue;
      }
      delete normalized.query;
    }

    if (toolName === "webReader") {
      const urlValue =
        typeof normalized.url === "string"
          ? normalized.url
          : typeof normalized.link === "string"
            ? normalized.link
            : "";
      if (urlValue) {
        normalized.url = urlValue;
      }
      delete normalized.link;
    }

    return normalized;
  }

  private async reconnectActiveServersIfNeeded(): Promise<void> {
    const reconnectTargets = Object.values(this.mcpServerState.preconfiguredServers)
      .filter((entry) => entry.config.active && !entry.connected)
      .map((entry) => entry.config.name);

    for (const serverName of reconnectTargets) {
      await this.activateServer(serverName);
    }
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
    const latestUserMessage = [...this.messages]
      .reverse()
      .find((msg) => msg.role === "user");

    const latestUserText = latestUserMessage
      ? this.getMessageText(latestUserMessage)
      : "";

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
        const emitProgress: ProgressEmitter = (event) =>
          this.emitProgress(writer, event);

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
          const message =
            error instanceof Error ? error.message : "Unknown generation error";
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
  private async buildSystemPrompt(): Promise<string> {
    let toolList = "";
    try {
      await this.ensureMcpConnections();
      if (this.mcp) {
        const tools = this.mcp.listTools();
        toolList = tools
          .map((t) => `- ${t.name}: ${t.description || "No description"}`)
          .join("\n");
      }
    } catch (error) {
      console.error("Failed to get MCP tools:", error);
    }

    return `You are a helpful AI assistant with the following capabilities:

## 1. Web Tools (MCP)
${toolList || "No tools available."}

To use a web tool, respond with:
\`\`\`json
{"tool_call": {"name": "tool_name", "arguments": {"arg": "value"}}}
\`\`\`

Available tools and their parameters:
- webSearchPrime: Search the web for information
  - Parameters: {"search_query": "your search query"} (REQUIRED: use "search_query" not "query")
- webReader: Read and extract content from web pages
  - Parameters: {"url": "https://example.com"}

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

  /**
   * Try to execute a tool call from the message content
   */
  private async tryExecuteToolCall(
    message: string,
    emitProgress?: ProgressEmitter
  ): Promise<ToolExecutionResult> {
    try {
      await this.ensureMcpConnections();
      const jsonStr = this.extractToolCallJson(message);
      if (!jsonStr) {
        emitProgress?.({
          phase: "tool",
          status: "info",
          message: "No tool call found in model draft."
        });
        return { detected: false, executed: false };
      }

      const parsed = JSON.parse(jsonStr);

      if (!parsed.tool_call || !parsed.tool_call.name) {
        emitProgress?.({
          phase: "tool",
          status: "info",
          message: "Tool call JSON detected but invalid."
        });
        return { detected: false, executed: false };
      }

      const { name, arguments: args } = parsed.tool_call;
      const normalizedArgs = this.normalizeToolArguments(name, args || {});
      emitProgress?.({
        phase: "tool",
        status: "start",
        toolName: name,
        message: `Executing tool "${name}".`,
        snippet: JSON.stringify(normalizedArgs).slice(0, 240)
      });

      // Check MCP availability using listTools() method
      if (!this.mcp) {
        emitProgress?.({
          phase: "tool",
          status: "error",
          toolName: name,
          message: "MCP is unavailable; cannot execute tool."
        });
        return { detected: true, executed: false, toolName: name, error: "MCP not available" };
      }

      // Get available tools using listTools()
      const tools = this.mcp.listTools();
      console.log("Available MCP tools:", tools?.map(t => t.name));

      // Find the tool - tools are namespaced as "serverId.toolName"
      let toolInfo = tools?.find((t) => t.name === name || t.name.endsWith(`.${name}`));

      if (!toolInfo) {
        await this.reconnectActiveServersIfNeeded();
        const refreshedTools = this.mcp.listTools();
        toolInfo = refreshedTools?.find((t) => t.name === name || t.name.endsWith(`.${name}`));
      }

      if (!toolInfo) {
        emitProgress?.({
          phase: "tool",
          status: "error",
          toolName: name,
          message: `Tool "${name}" not found in available tools.`
        });
        return {
          detected: true,
          executed: false,
          toolName: name,
          error: `Tool "${name}" not found in available tools`
        };
      }

      // Extract serverId from the namespaced tool name
      const serverId = toolInfo.name.includes('.') ? toolInfo.name.split('.')[0] : toolInfo.serverId;

      console.log(`Executing tool: ${name} on server: ${serverId} with args:`, normalizedArgs);
      const toolResult = await this.mcp.callTool({
        name,
        serverId,
        arguments: normalizedArgs
      });

      const resultText =
        typeof toolResult === "string"
          ? toolResult
          : JSON.stringify(toolResult, null, 2);

      console.log(`Tool ${name} result:`, resultText.substring(0, 200));
      emitProgress?.({
        phase: "tool",
        status: "success",
        toolName: name,
        message: `Tool "${name}" completed.`,
        snippet: resultText.slice(0, 320)
      });
      return { detected: true, executed: true, toolName: name, result: resultText };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Tool call error:", error);
      emitProgress?.({
        phase: "tool",
        status: "error",
        message: "Tool execution failed.",
        snippet: errorMsg.slice(0, 240)
      });
      return { detected: true, executed: false, error: errorMsg };
    }
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
    // Build system prompt
    const systemPrompt = await this.buildSystemPrompt();
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

    // Get existing messages safely - ensure it's an array
    const currentMessages = Array.isArray(this.messages) ? this.messages : [];

    // Convert messages for the model
    let existingMessages: ModelMessage[] = [];
    try {
      existingMessages = await convertToModelMessages(currentMessages);
    } catch (e) {
      console.error("Error converting messages:", e);
      existingMessages = [];
    }

    // Create user message
    const userMessage: ModelMessage = {
      role: "user",
      content: [{ type: "text", text: message }]
    };
    const messages = userAlreadyInHistory
      ? existingMessages
      : [...existingMessages, userMessage];

    // Generate initial response
    emitProgress?.({
      phase: "model",
      status: "start",
      message: "Model is generating the first draft."
    });
    const text = await this.requestModelText({
      model: glm(this.getModelId()),
      system: systemPrompt,
      messages,
      temperature: 0.7,
      abortSignal
    });
    emitProgress?.({
      phase: "thinking",
      status: "info",
      message: "Draft generated. Inspecting for tool instructions.",
      snippet: text.slice(0, 320)
    });

    let finalResponse = text;

    // Check for tool calls and execute them
    console.log("Checking for tool calls in response:", text.substring(0, 200));
    const toolResult = await this.tryExecuteToolCall(text, emitProgress);
    console.log("Tool execution result:", toolResult);

    if (toolResult.executed && toolResult.result) {
      // Tool was executed, now generate a follow-up response with the tool result
      const toolContextMessage = {
        role: "user" as const,
        content: [{
          type: "text" as const,
          text: `Tool "${toolResult.toolName}" returned the following result:\n\n${toolResult.result}\n\nPlease use this information to provide a helpful response to the user's original question.`
        }]
      };

      const followUpMessages: ModelMessage[] = [
        ...messages,
        {
          role: "assistant",
          content: [{ type: "text", text }]
        },
        toolContextMessage
      ];

      emitProgress?.({
        phase: "model",
        status: "start",
        message: "Tool returned data. Generating final answer."
      });
      const followUpText = await this.requestModelText({
        model: glm(this.getModelId()),
        system:
          `${systemPrompt}\n\n` +
          "A tool result has already been provided. Do not output tool_call JSON again. " +
          "Respond directly to the user with a final answer.",
        messages: followUpMessages,
        temperature: 0.7,
        abortSignal
      });

      finalResponse = followUpText;
      emitProgress?.({
        phase: "thinking",
        status: "info",
        message: "Final answer draft generated from tool result.",
        snippet: followUpText.slice(0, 320)
      });
    } else if (toolResult.detected && !toolResult.executed) {
      // Avoid returning raw tool_call JSON to user when tool execution fails.
      const fallbackContextMessage: ModelMessage = {
        role: "user",
        content: [{
          type: "text",
          text:
            `Tool call failed${toolResult.toolName ? ` (${toolResult.toolName})` : ""}: ${toolResult.error || "unknown error"}.\n` +
            "Please answer the user's question directly without outputting tool_call JSON."
        }]
      };

      const fallbackMessages: ModelMessage[] = [
        ...messages,
        {
          role: "assistant",
          content: [{ type: "text", text }]
        },
        fallbackContextMessage
      ];

      emitProgress?.({
        phase: "model",
        status: "start",
        message: "Tool failed. Generating fallback answer without tools."
      });
      const fallbackText = await this.requestModelText({
        model: glm(this.getModelId()),
        system:
          `${systemPrompt}\n\n` +
          "Do not output tool_call JSON. Answer directly based on your own knowledge and be explicit about uncertainty.",
        messages: fallbackMessages,
        temperature: 0.7,
        abortSignal
      });

      finalResponse = fallbackText;
      emitProgress?.({
        phase: "thinking",
        status: "info",
        message: "Fallback answer generated.",
        snippet: fallbackText.slice(0, 320)
      });
    }

    // Final guardrail: never return raw tool_call JSON to API clients.
    if (this.extractToolCallJson(finalResponse)) {
      emitProgress?.({
        phase: "model",
        status: "start",
        message: "Detected raw tool JSON in output. Running guardrail rewrite."
      });
      if (toolResult.executed && toolResult.result) {
        const forcedFinalText = await this.requestModelText({
          model: glm(this.getModelId()),
          system:
            "You are given user question and tool result. " +
            "Return a direct final answer in Markdown. Never output JSON tool calls.",
          messages: [
            {
              role: "user",
              content: [{
                type: "text",
                text:
                  `User question:\n${message}\n\n` +
                  `Tool result:\n${toolResult.result}\n\n` +
                  "Please provide the final answer directly."
              }]
            }
          ],
          temperature: 0.4,
          abortSignal
        });
        finalResponse = forcedFinalText;
      } else {
        const forcedFallbackText = await this.requestModelText({
          model: glm(this.getModelId()),
          system:
            "Answer the user directly without using tools. " +
            "Never output JSON tool calls.",
          messages: [
            {
              role: "user",
              content: [{ type: "text", text: message }]
            }
          ],
          temperature: 0.6,
          abortSignal
        });
        finalResponse = forcedFallbackText;
      }
      emitProgress?.({
        phase: "thinking",
        status: "info",
        message: "Guardrail rewrite completed.",
        snippet: finalResponse.slice(0, 320)
      });
    }

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
  async toggleServer(name: string): Promise<{ success: boolean; active?: boolean; error?: string }> {
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
