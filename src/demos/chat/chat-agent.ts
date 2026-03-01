import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  callable,
  getAgentByName,
  getCurrentAgent,
  type Connection,
  type ConnectionContext
} from "agents";
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
  cancelIdleSchedules,
  destroyIfIdle,
  resolveIdleTimeoutSeconds,
  scheduleIdleDestroy
} from "../../shared/agent-lifecycle";
import {
  getMessageText,
  normalizeToolArguments as normalizeArgs,
  toFallbackModelMessages
} from "./model-utils";

export interface McpServerConnectionState {
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

export interface ToolRunRecord {
  id: string;
  toolName: string;
  serverId?: string;
  status: "running" | "success" | "error" | "blocked";
  startedAt: string;
  finishedAt?: string;
  argsSnippet?: string;
  resultSnippet?: string;
  error?: string;
}

export interface AgentRuntimeEvent {
  id: string;
  level: "info" | "success" | "error";
  source: "chat" | "mcp" | "tool" | "system";
  type: string;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}

export interface ChatAgentState {
  mcp: McpServerConnectionState;
  runtime: {
    toolRuns: ToolRunRecord[];
    lastError?: string;
    events: AgentRuntimeEvent[];
    stateVersion: number;
  };
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
export class ChatAgentV2 extends AIChatAgent<Env, ChatAgentState> {
  static options = {
    retry: { maxAttempts: 2, baseDelayMs: 150, maxDelayMs: 1500 }
  };

  // Keep last 100 messages in SQLite storage
  maxPersistedMessages = 100;

  initialState: ChatAgentState = {
    mcp: {
      preconfiguredServers: {}
    },
    runtime: {
      toolRuns: [],
      events: [],
      stateVersion: 0
    }
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

  private appendRuntimeEvent(
    event: Omit<AgentRuntimeEvent, "id" | "timestamp">
  ): AgentRuntimeEvent {
    const runtimeEvent: AgentRuntimeEvent = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...event
    };
    const nextEvents = [...this.state.runtime.events, runtimeEvent].slice(-120);
    this.setState({
      ...this.state,
      runtime: {
        ...this.state.runtime,
        events: nextEvents,
        stateVersion: this.state.runtime.stateVersion + 1
      }
    });
    return runtimeEvent;
  }

  private upsertToolRun(run: ToolRunRecord): void {
    const withoutCurrent = this.state.runtime.toolRuns.filter((item) => item.id !== run.id);
    const nextRuns = [...withoutCurrent, run].slice(-80);
    this.setState({
      ...this.state,
      runtime: {
        ...this.state.runtime,
        toolRuns: nextRuns,
        stateVersion: this.state.runtime.stateVersion + 1
      }
    });
  }

  private updateLastError(message?: string): void {
    if (!message) return;
    this.setState({
      ...this.state,
      runtime: {
        ...this.state.runtime,
        lastError: message,
        stateVersion: this.state.runtime.stateVersion + 1
      }
    });
  }

  private setServerConnectionState(
    name: string,
    next: Partial<{
      serverId?: string;
      connected: boolean;
      error?: string;
    }>
  ): void {
    const current = this.state.mcp.preconfiguredServers[name];
    if (!current) return;
    this.setState({
      ...this.state,
      mcp: {
        preconfiguredServers: {
          ...this.state.mcp.preconfiguredServers,
          [name]: {
            ...current,
            ...next
          }
        }
      },
      runtime: {
        ...this.state.runtime,
        stateVersion: this.state.runtime.stateVersion + 1
      }
    });
  }

  private getToolTimeoutMs(): number {
    const raw = this.runtimeEnv.CHAT_TOOL_TIMEOUT_MS;
    if (!raw) return 25000;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 25000;
  }

  private getToolMaxAttempts(): number {
    const raw = this.runtimeEnv.CHAT_TOOL_MAX_ATTEMPTS;
    if (!raw) return 2;
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 2;
  }

  private isRetryableToolError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const lowered = message.toLowerCase();
    return (
      lowered.includes("timeout") ||
      lowered.includes("network") ||
      lowered.includes("fetch") ||
      lowered.includes("econnreset") ||
      lowered.includes("temporar") ||
      lowered.includes("503") ||
      lowered.includes("429")
    );
  }

  private isRetryableMcpConnectionError(error: unknown): boolean {
    const message = error instanceof Error ? error.message : String(error);
    const lowered = message.toLowerCase();
    return (
      lowered.includes("timeout") ||
      lowered.includes("network") ||
      lowered.includes("fetch") ||
      lowered.includes("econnreset") ||
      lowered.includes("temporar") ||
      lowered.includes("503") ||
      lowered.includes("429") ||
      lowered.includes("connection")
    );
  }

  private async callMcpToolWithRetry(params: {
    name: string;
    serverId: string;
    arguments: Record<string, unknown>;
    emitProgress?: ProgressEmitter;
  }): Promise<unknown> {
    const timeoutMs = this.getToolTimeoutMs();
    const maxAttempts = this.getToolMaxAttempts();
    const retryEnabled = maxAttempts > 1;

    const runner = async (attempt: number) => {
      if (attempt > 1) {
        params.emitProgress?.({
          phase: "tool",
          status: "info",
          toolName: params.name,
          message: `Retrying "${params.name}" (attempt ${attempt}/${maxAttempts})`
        });
      }

      return await Promise.race([
        this.mcp.callTool({
          name: params.name,
          serverId: params.serverId,
          arguments: params.arguments
        }),
        new Promise<never>((_, reject) => {
          setTimeout(() => {
            reject(new Error(`Tool timeout after ${timeoutMs}ms`));
          }, timeoutMs);
        })
      ]);
    };

    if (!retryEnabled) {
      return await runner(1);
    }

    return await this.retry(runner, {
      maxAttempts,
      shouldRetry: (error) => this.isRetryableToolError(error)
    });
  }

  private requiresApprovalPolicy(toolName: string, args: Record<string, unknown>): boolean {
    const lowered = toolName.toLowerCase();
    const dangerousTokens = ["delete", "remove", "drop", "write", "update", "create", "patch"];
    if (dangerousTokens.some((token) => lowered.includes(token))) {
      return true;
    }

    const serialized = JSON.stringify(args);
    return serialized.length > 8000;
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
            const runId = crypto.randomUUID();
            const runStart = new Date().toISOString();
            const baseRun: ToolRunRecord = {
              id: runId,
              toolName: alias,
              serverId,
              status: "running",
              startedAt: runStart,
              argsSnippet: JSON.stringify(normalizedArgs).slice(0, 320)
            };
            this.upsertToolRun(baseRun);
            this.appendRuntimeEvent({
              level: "info",
              source: "tool",
              type: "tool_start",
              message: `Tool ${alias} started`,
              data: {
                toolName: alias,
                serverId
              }
            });
            emitProgress?.({
              phase: "tool",
              status: "start",
              toolName: alias,
              message: `Executing tool "${alias}"`,
              snippet: JSON.stringify(normalizedArgs).slice(0, 240)
            });
            try {
              if (!this.mcp) {
                const error = "MCP unavailable";
                this.upsertToolRun({
                  ...baseRun,
                  status: "error",
                  finishedAt: new Date().toISOString(),
                  error
                });
                this.updateLastError(error);
                return { error };
              }
              if (this.requiresApprovalPolicy(rawName, normalizedArgs)) {
                const error =
                  "Tool blocked by policy: this action requires approval in server safety policy.";
                this.upsertToolRun({
                  ...baseRun,
                  status: "blocked",
                  finishedAt: new Date().toISOString(),
                  error
                });
                this.appendRuntimeEvent({
                  level: "error",
                  source: "tool",
                  type: "tool_blocked",
                  message: `Tool ${alias} blocked by policy`,
                  data: { toolName: alias }
                });
                this.updateLastError(error);
                emitProgress?.({
                  phase: "tool",
                  status: "error",
                  toolName: alias,
                  message: `Tool "${alias}" blocked by approval policy`,
                  snippet: error
                });
                return { error };
              }
              const result = await this.callMcpToolWithRetry({
                name: rawName,
                serverId,
                arguments: normalizedArgs,
                emitProgress
              });
              const resultSnippet =
                typeof result === "string" ? result : JSON.stringify(result, null, 2);
              this.upsertToolRun({
                ...baseRun,
                status: "success",
                finishedAt: new Date().toISOString(),
                resultSnippet: resultSnippet.slice(0, 480)
              });
              this.appendRuntimeEvent({
                level: "success",
                source: "tool",
                type: "tool_success",
                message: `Tool ${alias} completed`,
                data: {
                  toolName: alias
                }
              });
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
              this.upsertToolRun({
                ...baseRun,
                status: "error",
                finishedAt: new Date().toISOString(),
                error: message
              });
              this.appendRuntimeEvent({
                level: "error",
                source: "tool",
                type: "tool_error",
                message: `Tool ${alias} failed`,
                data: {
                  toolName: alias
                }
              });
              this.updateLastError(message);
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

  onConnect(_connection: Connection, _ctx: ConnectionContext) {
    cancelIdleSchedules(this as never);
  }

  shouldConnectionBeReadonly(_connection: Connection, ctx: ConnectionContext): boolean {
    const url = new URL(ctx.request.url);
    return url.searchParams.get("mode") === "view";
  }

  onClose(_connection: Connection) {
    scheduleIdleDestroy(this as never, {
      idleTimeoutSeconds: resolveIdleTimeoutSeconds(this.runtimeEnv.AGENT_IDLE_TIMEOUT_SECONDS)
    });
  }

  async onIdleTimeout() {
    const destroyed = await destroyIfIdle(this as never);
    if (destroyed) {
      this.appendRuntimeEvent({
        level: "info",
        source: "system",
        type: "idle_destroy",
        message: "Agent destroyed after idle timeout."
      });
    }
  }

  async onStart() {
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" },
            status: 200
          });
        }
        const error = result.authError || "Unknown OAuth error";
        return new Response(`OAuth failed: ${error}`, {
          headers: { "content-type": "text/plain" },
          status: 400
        });
      }
    });

    const preconfiguredServers: McpServerConnectionState["preconfiguredServers"] = {};
    for (const config of MCP_SERVERS) {
      preconfiguredServers[config.name] = {
        config,
        connected: false
      };
    }
    this.setState({
      ...this.state,
      mcp: {
        preconfiguredServers
      },
      runtime: {
        ...this.state.runtime,
        events: [
          ...this.state.runtime.events,
          {
            id: crypto.randomUUID(),
            timestamp: new Date().toISOString(),
            level: "info" as const,
            source: "system" as const,
            type: "agent_start",
            message: "ChatAgentV2 started."
          }
        ].slice(-120),
        stateVersion: this.state.runtime.stateVersion + 1
      }
    });
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
            message: "Still thinking..."
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
          this.updateLastError(message);
          this.appendRuntimeEvent({
            level: "error",
            source: "chat",
            type: "generate_error",
            message: "Assistant response generation failed.",
            data: { error: message }
          });
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

G2 output contract (MUST follow):
- G2 blocks must be strict RFC 8259 JSON.
- Do not output comments, trailing commas, undefined, NaN, Infinity, or functions.
- All keys must use double quotes; all string values must use double quotes.
- Never output callback expressions such as \`(d) => ...\` or \`function (...)\`.
- For constant colors, use string literals like \`"#4E79A7"\`.
- For categorical color mapping, use \`"encode": { "color": "<field>" }\`.
- \`scale.color.range\` must contain only valid CSS color strings (hex/rgb/hsl), never category labels.
- \`encode.x\`/\`encode.y\`/\`encode.color\` referenced fields must exist in \`data\`.
- If you output a G2 code block, self-check that it can pass \`JSON.parse\`.

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
    this.appendRuntimeEvent({
      level: "info",
      source: "chat",
      type: "generate_start",
      message: "Assistant response generation started."
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
    this.appendRuntimeEvent({
      level: "success",
      source: "chat",
      type: "generate_success",
      message: "Assistant response generation completed."
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

      // Regeneration can race with in-memory history updates after persistence.
      // If history does not currently end with a user message, inject the prompt again.
      const latestMessages = Array.isArray(this.messages) ? this.messages : [];
      const historyEndsWithUser = latestMessages[latestMessages.length - 1]?.role === "user";
      const regenerated = await this.generateAssistantResponse(userText, historyEndsWithUser);
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
      const targetAgent = (await getAgentByName(this.runtimeEnv.ChatAgentV2, newSessionId)) as {
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
  async getPreconfiguredServers(): Promise<McpServerConnectionState["preconfiguredServers"]> {
    return this.state.mcp.preconfiguredServers;
  }

  @callable({ description: "Activate a pre-configured MCP server" })
  async activateServer(
    name: string
  ): Promise<{ success: boolean; error?: string; stateVersion: number }> {
    const serverEntry = this.state.mcp.preconfiguredServers[name];
    if (!serverEntry) {
      return {
        success: false,
        error: `Server "${name}" not found`,
        stateVersion: this.state.runtime.stateVersion
      };
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

      const result = await this.retry(
        async () => await this.addMcpServer(name, config.url, options),
        {
          maxAttempts: this.getToolMaxAttempts(),
          shouldRetry: (error) => this.isRetryableMcpConnectionError(error)
        }
      );
      this.setServerConnectionState(name, {
        serverId: result.id,
        connected: true,
        error: undefined
      });
      this.appendRuntimeEvent({
        level: "success",
        source: "mcp",
        type: "activate_server",
        message: `MCP server ${name} activated.`,
        data: { serverId: result.id }
      });

      return { success: true, stateVersion: this.state.runtime.stateVersion };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.setServerConnectionState(name, {
        connected: false,
        error: message
      });
      this.updateLastError(message);
      this.appendRuntimeEvent({
        level: "error",
        source: "mcp",
        type: "activate_server_error",
        message: `MCP server ${name} activation failed.`,
        data: { error: message }
      });
      return { success: false, error: message, stateVersion: this.state.runtime.stateVersion };
    }
  }

  @callable({ description: "Deactivate a pre-configured MCP server" })
  async deactivateServer(name: string): Promise<{ success: boolean; stateVersion: number }> {
    const serverEntry = this.state.mcp.preconfiguredServers[name];
    if (!serverEntry || !serverEntry.serverId) {
      return { success: false, stateVersion: this.state.runtime.stateVersion };
    }

    try {
      await this.retry(async () => await this.removeMcpServer(serverEntry.serverId as string), {
        maxAttempts: this.getToolMaxAttempts(),
        shouldRetry: (error) => this.isRetryableMcpConnectionError(error)
      });
      this.setServerConnectionState(name, {
        serverId: undefined,
        connected: false,
        error: undefined
      });
      this.appendRuntimeEvent({
        level: "info",
        source: "mcp",
        type: "deactivate_server",
        message: `MCP server ${name} deactivated.`,
        data: { serverId: serverEntry.serverId }
      });
      return { success: true, stateVersion: this.state.runtime.stateVersion };
    } catch (error) {
      console.error(`Failed to deactivate server ${name}:`, error);
      const message = error instanceof Error ? error.message : String(error);
      this.updateLastError(message);
      this.appendRuntimeEvent({
        level: "error",
        source: "mcp",
        type: "deactivate_server_error",
        message: `MCP server ${name} deactivation failed.`,
        data: { error: message }
      });
      return { success: false, stateVersion: this.state.runtime.stateVersion };
    }
  }

  @callable({ description: "Toggle a pre-configured MCP server on/off" })
  async toggleServer(
    name: string
  ): Promise<{ success: boolean; active?: boolean; error?: string; stateVersion: number }> {
    const serverEntry = this.state.mcp.preconfiguredServers[name];
    if (!serverEntry) {
      return {
        success: false,
        error: `Server "${name}" not found`,
        stateVersion: this.state.runtime.stateVersion
      };
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
      this.updateLastError(error instanceof Error ? error.message : String(error));
      return [];
    }
  }

  @callable({ description: "Get runtime observability snapshot" })
  async getRuntimeSnapshot(): Promise<{
    toolRuns: ToolRunRecord[];
    lastError?: string;
    events: AgentRuntimeEvent[];
    stateVersion: number;
  }> {
    return {
      toolRuns: this.state.runtime.toolRuns,
      lastError: this.state.runtime.lastError,
      events: this.state.runtime.events,
      stateVersion: this.state.runtime.stateVersion
    };
  }

  @callable({ description: "Get current connection permissions" })
  getPermissions(): { canEdit: boolean; readonly: boolean } {
    const { connection } = getCurrentAgent();
    if (!connection) {
      return { canEdit: false, readonly: true };
    }
    const readonly = this.isConnectionReadonly(connection);
    return { canEdit: !readonly, readonly };
  }
}
