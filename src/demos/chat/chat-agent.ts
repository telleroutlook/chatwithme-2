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
import {
  getMaxOutputTokens,
  getModelId,
  getModelStreamEnabled,
  getThinkingEnabled,
  getThinkingType,
  getToolMaxAttempts,
  getToolTimeoutMs
} from "./runtime-config";
import { buildSystemPrompt } from "./system-prompt";
import { classifyRetryableError } from "./retry-policy";
import { buildApprovalSignature, requiresApprovalPolicy } from "./approval-policy";

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

export interface RetryStats {
  tool: {
    attempts: number;
    success: number;
    exhausted: number;
  };
  mcpConnection: {
    attempts: number;
    success: number;
    exhausted: number;
  };
}

export interface ToolApprovalRequest {
  id: string;
  signature: string;
  toolName: string;
  serverId?: string;
  argsSnippet: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
  resolvedAt?: string;
  reason?: string;
}

export interface ChatAgentState {
  mcp: McpServerConnectionState;
  runtime: {
    toolRuns: ToolRunRecord[];
    lastError?: string;
    events: AgentRuntimeEvent[];
    approvals: ToolApprovalRequest[];
    approvedSignatures: Array<{ signature: string; expiresAt: string }>;
    retryStats: RetryStats;
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
      approvals: [],
      approvedSignatures: [],
      retryStats: {
        tool: { attempts: 0, success: 0, exhausted: 0 },
        mcpConnection: { attempts: 0, success: 0, exhausted: 0 }
      },
      stateVersion: 0
    }
  };

  private mcpInitPromise: Promise<void> | null = null;
  private pendingSessionDeletion = false;

  private isModelStreamEnabled(): boolean {
    return getModelStreamEnabled(this.runtimeEnv);
  }

  private getThinkingType(): "enabled" | "disabled" {
    return getThinkingType(this.runtimeEnv);
  }

  private getModelId(): string {
    return getModelId(this.runtimeEnv);
  }

  private getMaxOutputTokens(): number | undefined {
    return getMaxOutputTokens(this.runtimeEnv);
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
    return getThinkingEnabled(this.runtimeEnv);
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

  private updateRetryStats(
    kind: "tool" | "mcpConnection",
    mutation: (target: RetryStats["tool"]) => RetryStats["tool"]
  ): void {
    const nextStats = {
      ...this.state.runtime.retryStats,
      [kind]: mutation(this.state.runtime.retryStats[kind])
    };
    this.setState({
      ...this.state,
      runtime: {
        ...this.state.runtime,
        retryStats: nextStats,
        stateVersion: this.state.runtime.stateVersion + 1
      }
    });
  }

  private pruneApprovalState(): void {
    const now = Date.now();
    const keptApprovals = this.state.runtime.approvals
      .filter((item) => {
        if (item.status === "pending") return true;
        if (!item.resolvedAt) return true;
        return now - new Date(item.resolvedAt).getTime() < 1000 * 60 * 60 * 24;
      })
      .slice(-120);
    const approvedSignatures = this.state.runtime.approvedSignatures.filter(
      (entry) => new Date(entry.expiresAt).getTime() > now
    );
    this.setState({
      ...this.state,
      runtime: {
        ...this.state.runtime,
        approvals: keptApprovals,
        approvedSignatures,
        stateVersion: this.state.runtime.stateVersion + 1
      }
    });
  }

  private hasApprovedSignature(signature: string): boolean {
    const now = Date.now();
    const exists = this.state.runtime.approvedSignatures.some(
      (entry) => entry.signature === signature && new Date(entry.expiresAt).getTime() > now
    );
    if (!exists) return false;
    const remaining = this.state.runtime.approvedSignatures.filter(
      (entry) => !(entry.signature === signature && new Date(entry.expiresAt).getTime() > now)
    );
    this.setState({
      ...this.state,
      runtime: {
        ...this.state.runtime,
        approvedSignatures: remaining,
        stateVersion: this.state.runtime.stateVersion + 1
      }
    });
    return true;
  }

  private queueApproval(params: {
    signature: string;
    toolName: string;
    serverId?: string;
    argsSnippet: string;
  }): ToolApprovalRequest {
    const existing = this.state.runtime.approvals.find(
      (item) => item.signature === params.signature && item.status === "pending"
    );
    if (existing) {
      return existing;
    }
    const nextApproval: ToolApprovalRequest = {
      id: crypto.randomUUID(),
      signature: params.signature,
      toolName: params.toolName,
      serverId: params.serverId,
      argsSnippet: params.argsSnippet,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    this.setState({
      ...this.state,
      runtime: {
        ...this.state.runtime,
        approvals: [...this.state.runtime.approvals, nextApproval].slice(-120),
        stateVersion: this.state.runtime.stateVersion + 1
      }
    });
    return nextApproval;
  }

  private getToolTimeoutMs(): number {
    return getToolTimeoutMs(this.runtimeEnv);
  }

  private getToolMaxAttempts(): number {
    return getToolMaxAttempts(this.runtimeEnv);
  }

  private isRetryableToolError(error: unknown): boolean {
    return classifyRetryableError("tool", error);
  }

  private isRetryableMcpConnectionError(error: unknown): boolean {
    return classifyRetryableError("mcp_connection", error);
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
      this.updateRetryStats("tool", (stats) => ({
        ...stats,
        attempts: stats.attempts + 1
      }));
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
      try {
        const result = await runner(1);
        this.updateRetryStats("tool", (stats) => ({
          ...stats,
          success: stats.success + 1
        }));
        return result;
      } catch (error) {
        this.updateRetryStats("tool", (stats) => ({
          ...stats,
          exhausted: stats.exhausted + 1
        }));
        throw error;
      }
    }

    try {
      const result = await this.retry(runner, {
        maxAttempts,
        shouldRetry: (error) => this.isRetryableToolError(error)
      });
      this.updateRetryStats("tool", (stats) => ({
        ...stats,
        success: stats.success + 1
      }));
      return result;
    } catch (error) {
      this.updateRetryStats("tool", (stats) => ({
        ...stats,
        exhausted: stats.exhausted + 1
      }));
      throw error;
    }
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
              const approvalSignature = buildApprovalSignature(rawName, serverId, normalizedArgs);
              if (requiresApprovalPolicy(rawName, normalizedArgs) && !this.hasApprovedSignature(approvalSignature)) {
                const approval = this.queueApproval({
                  signature: approvalSignature,
                  toolName: alias,
                  serverId,
                  argsSnippet: JSON.stringify(normalizedArgs).slice(0, 320)
                });
                const error = `Tool "${alias}" requires approval (id: ${approval.id}).`;
                this.upsertToolRun({
                  ...baseRun,
                  status: "blocked",
                  finishedAt: new Date().toISOString(),
                  error
                });
                this.appendRuntimeEvent({
                  level: "info",
                  source: "tool",
                  type: "tool_approval_required",
                  message: `Tool ${alias} pending approval`,
                  data: { toolName: alias, approvalId: approval.id }
                });
                this.updateLastError(error);
                emitProgress?.({
                  phase: "tool",
                  status: "info",
                  toolName: alias,
                  message: `Tool "${alias}" is waiting for approval`,
                  snippet: error
                });
                return { error, approvalId: approval.id, status: "pending_approval" };
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
    if (this.pendingSessionDeletion) {
      void (async () => {
        const destroyed = await destroyIfIdle(this as never);
        if (!destroyed) {
          return;
        }
        this.pendingSessionDeletion = false;
      })();
      return;
    }
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
    const systemPrompt = buildSystemPrompt(toolList);
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
    try {
      await this.persistMessages([]);
      return { success: true };
    } catch (e) {
      console.error("Error clearing messages:", e);
      return { success: false };
    }
  }

  @callable({ description: "Delete session permanently and destroy agent state" })
  async deleteSession(): Promise<{
    success: boolean;
    destroyed: boolean;
    pendingDestroy?: boolean;
    error?: string;
  }> {
    try {
      await this.persistMessages([]);
      this.messages = [];

      this.setState({
        ...this.state,
        runtime: {
          ...this.initialState.runtime,
          stateVersion: this.state.runtime.stateVersion + 1
        }
      });

      const hasConnections = [...this.getConnections()].length > 0;
      this.pendingSessionDeletion = true;
      if (!hasConnections) {
        cancelIdleSchedules(this as never);
        this.schedule(1, "onIdleTimeout" as never, {});
      }
      return {
        success: true,
        destroyed: false,
        pendingDestroy: true
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error("Error deleting session:", error);
      return {
        success: false,
        destroyed: false,
        error: message
      };
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
        async () => {
          this.updateRetryStats("mcpConnection", (stats) => ({
            ...stats,
            attempts: stats.attempts + 1
          }));
          return await this.addMcpServer(name, config.url, options);
        },
        {
          maxAttempts: this.getToolMaxAttempts(),
          shouldRetry: (error) => this.isRetryableMcpConnectionError(error)
        }
      );
      this.updateRetryStats("mcpConnection", (stats) => ({
        ...stats,
        success: stats.success + 1
      }));
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
      this.updateRetryStats("mcpConnection", (stats) => ({
        ...stats,
        exhausted: stats.exhausted + 1
      }));
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
      await this.retry(
        async () => {
          this.updateRetryStats("mcpConnection", (stats) => ({
            ...stats,
            attempts: stats.attempts + 1
          }));
          return await this.removeMcpServer(serverEntry.serverId as string);
        },
        {
          maxAttempts: this.getToolMaxAttempts(),
          shouldRetry: (error) => this.isRetryableMcpConnectionError(error)
        }
      );
      this.updateRetryStats("mcpConnection", (stats) => ({
        ...stats,
        success: stats.success + 1
      }));
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
      this.updateRetryStats("mcpConnection", (stats) => ({
        ...stats,
        exhausted: stats.exhausted + 1
      }));
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

  @callable({ description: "List tool approval requests" })
  listToolApprovals(): ToolApprovalRequest[] {
    this.pruneApprovalState();
    return this.state.runtime.approvals;
  }

  @callable({ description: "Approve pending tool call request" })
  approveToolCall(
    approvalId: string
  ): { success: boolean; error?: string; stateVersion: number } {
    const target = this.state.runtime.approvals.find((item) => item.id === approvalId);
    if (!target || target.status !== "pending") {
      return {
        success: false,
        error: "Approval request not found or already resolved",
        stateVersion: this.state.runtime.stateVersion
      };
    }

    const resolvedAt = new Date().toISOString();
    this.setState({
      ...this.state,
      runtime: {
        ...this.state.runtime,
        approvals: this.state.runtime.approvals.map((item) =>
          item.id === approvalId ? { ...item, status: "approved", resolvedAt } : item
        ),
        approvedSignatures: [
          ...this.state.runtime.approvedSignatures,
          {
            signature: target.signature,
            expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
          }
        ].slice(-200),
        stateVersion: this.state.runtime.stateVersion + 1
      }
    });
    this.appendRuntimeEvent({
      level: "success",
      source: "tool",
      type: "tool_approval_granted",
      message: `Tool approval granted for ${target.toolName}`,
      data: { approvalId }
    });
    return { success: true, stateVersion: this.state.runtime.stateVersion };
  }

  @callable({ description: "Reject pending tool call request" })
  rejectToolCall(
    approvalId: string,
    reason?: string
  ): { success: boolean; error?: string; stateVersion: number } {
    const target = this.state.runtime.approvals.find((item) => item.id === approvalId);
    if (!target || target.status !== "pending") {
      return {
        success: false,
        error: "Approval request not found or already resolved",
        stateVersion: this.state.runtime.stateVersion
      };
    }

    const resolvedAt = new Date().toISOString();
    this.setState({
      ...this.state,
      runtime: {
        ...this.state.runtime,
        approvals: this.state.runtime.approvals.map((item) =>
          item.id === approvalId
            ? { ...item, status: "rejected", resolvedAt, reason: reason || "Rejected by operator" }
            : item
        ),
        stateVersion: this.state.runtime.stateVersion + 1
      }
    });
    this.appendRuntimeEvent({
      level: "info",
      source: "tool",
      type: "tool_approval_rejected",
      message: `Tool approval rejected for ${target.toolName}`,
      data: { approvalId, reason: reason || "Rejected by operator" }
    });
    return { success: true, stateVersion: this.state.runtime.stateVersion };
  }

  @callable({ description: "Get runtime observability snapshot" })
  async getRuntimeSnapshot(): Promise<{
    toolRuns: ToolRunRecord[];
    lastError?: string;
    events: AgentRuntimeEvent[];
    approvals: ToolApprovalRequest[];
    retryStats: RetryStats;
    stateVersion: number;
  }> {
    this.pruneApprovalState();
    return {
      toolRuns: this.state.runtime.toolRuns,
      lastError: this.state.runtime.lastError,
      events: this.state.runtime.events,
      approvals: this.state.runtime.approvals,
      retryStats: this.state.runtime.retryStats,
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
