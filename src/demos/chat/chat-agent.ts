import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  callable,
  getAgentByName,
  getCurrentAgent,
  type Connection,
  type ConnectionContext
} from "agents";
import {
  convertToModelMessages,
  pruneMessages,
  createUIMessageStream,
  createUIMessageStreamResponse,
  type UIMessageStreamWriter,
  type ModelMessage
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import type { ToolSet } from "ai";
import { MCP_SERVERS } from "../../mcp-config";
import {
  cancelIdleSchedules,
  destroyIfIdle,
  resolveIdleTimeoutSeconds,
  scheduleIdleDestroy
} from "../../shared/agent-lifecycle";
import {
  getMessageText,
  toFallbackModelMessages
} from "./model-utils";
import {
  getMaxOutputTokens,
  getModelId,
  getModelStreamEnabled,
  getThinkingEnabled,
  getThinkingType,
  getToolMaxAttempts,
  getToolTimeoutMs,
  getModelTemperature,
  getMaxToolSteps
} from "./runtime-config";
import { buildSystemPromptWithKeywords } from "./system-prompt";
import {
  // Types
  type McpServerConnectionState,
  type ToolRunRecord,
  type AgentRuntimeEvent,
  type RetryStats,
  type ToolApprovalRequest,
  type ChatAgentState,
  type ProgressPhase,
  type LiveProgressEvent,
  type ProgressEmitter,
  // State helpers
  createInitialRuntimeState,
  appendRuntimeEvent,
  updateLastErrorState,
  updateRetryStatsState,
  upsertToolRunState,
  setServerConnectionState,
  getRuntimeSnapshot,
  // Approval helpers
  pruneApprovalState,
  hasApprovedSignature,
  queueApproval,
  approveToolCallState,
  rejectToolCallState,
  // Model execution
  requestModelText,
  streamModelTextToWriter,
  // Tool runtime
  isRetryableMcpConnectionError,
  buildAiTools,
  // MCP server runtime
  activateMcpServer,
  deactivateMcpServer,
  toggleMcpServer,
  getMcpTools,
  // Chat methods
  getHistory as getHistoryImpl,
  clearChat as clearChatImpl,
  deleteMessage as deleteMessageImpl,
  editUserMessage as editUserMessageImpl,
  regenerateFrom as regenerateFromImpl,
  seedHistory as seedHistoryImpl
} from "./runtime";

// Re-export types for backward compatibility
export type {
  McpServerConnectionState,
  ToolRunRecord,
  AgentRuntimeEvent,
  RetryStats,
  ToolApprovalRequest,
  ChatAgentState,
  ProgressPhase,
  LiveProgressEvent
};

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

  maxPersistedMessages = 1000;

  initialState: ChatAgentState = {
    mcp: {
      preconfiguredServers: {}
    },
    runtime: createInitialRuntimeState()
  };

  private mcpInitPromise: Promise<void> | null = null;
  private pendingSessionDeletion = false;

  declare readonly env: Env;

  // ============ State Update Helpers ============

  private updateState(newState: ChatAgentState): void {
    this.setState({
      ...newState,
      runtime: {
        ...newState.runtime,
        stateVersion: this.state.runtime.stateVersion + 1
      }
    });
  }

  private appendRuntimeEvent(
    event: Omit<AgentRuntimeEvent, "id" | "timestamp">
  ): AgentRuntimeEvent {
    const nextState = appendRuntimeEvent(this.state, event);
    this.updateState(nextState);
    // Return the last event that was just added
    const events = nextState.runtime.events;
    return events[events.length - 1];
  }

  private updateLastError(message?: string): void {
    if (!message) return;
    this.updateState(updateLastErrorState(this.state, message));
  }

  private updateRetryStats(
    kind: "tool" | "mcpConnection",
    mutation: (target: RetryStats["tool"]) => RetryStats["tool"]
  ): void {
    this.updateState(updateRetryStatsState(this.state, kind, mutation));
  }

  private setServerConnectionState(
    name: string,
    next: Partial<{
      serverId?: string;
      connected: boolean;
      error?: string;
    }>
  ): void {
    this.updateState(setServerConnectionState(this.state, name, next));
  }

  // ============ Progress Emission ============

  private emitProgress(writer: UIMessageStreamWriter, event: LiveProgressEvent): void {
    if (event.phase === "thinking" && !getThinkingEnabled(this.env)) {
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

  // ============ Model Execution ============

  private async requestModelTextInternal(params: {
    model: ReturnType<ReturnType<typeof createOpenAICompatible>>;
    system: string;
    messages: ModelMessage[];
    tools: ToolSet;
    temperature: number;
    abortSignal?: AbortSignal;
    emitProgress?: ProgressEmitter;
  }): Promise<string> {
    return requestModelText({
      model: params.model,
      system: params.system,
      messages: params.messages,
      temperature: params.temperature,
      tools: params.tools,
      abortSignal: params.abortSignal,
      emitProgress: params.emitProgress,
      maxOutputTokens: getMaxOutputTokens(this.env),
      maxToolSteps: getMaxToolSteps(this.env),
      thinkingType: getThinkingType(this.env),
      streamEnabled: getModelStreamEnabled(this.env)
    });
  }

  // ============ Message Handling ============

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
        snippet: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
        groupKey: "context:history-conversion"
      });
      return { modelMessages: fallbackMessages, source: "fallback" };
    }
  }

  // ============ Tool Building ============

  private async buildAiTools(
    emitProgress?: ProgressEmitter,
    mcpProgressGroupKey?: string
  ): Promise<{
    tools: Awaited<ReturnType<typeof buildAiTools>>["tools"];
    toolList: string[];
  }> {
    await this.ensureMcpConnections(emitProgress, mcpProgressGroupKey);

    const { tools, toolList } = await buildAiTools(
      this.mcp ?? null,
      {
        getState: () => this.state,
        setState: (s) => this.updateState(s),
        retry: this.retry.bind(this),
        getToolTimeoutMs: () => getToolTimeoutMs(this.env),
        getToolMaxAttempts: () => getToolMaxAttempts(this.env)
      },
      emitProgress
    );

    return { tools, toolList };
  }

  // ============ Lifecycle Methods ============

  onConnect(_connection: Connection, _ctx: ConnectionContext) {
    cancelIdleSchedules(this as never);
  }

  shouldConnectionBeReadonly(_connection: Connection, ctx: ConnectionContext): boolean {
    const url = new URL(ctx.request.url);
    return url.searchParams.get("mode") === "view";
  }

  onError(connectionOrError: Connection | unknown, maybeError?: unknown) {
    const error = maybeError === undefined ? connectionOrError : maybeError;
    const message = error instanceof Error ? error.message : String(error);
    this.updateLastError(message);
    this.appendRuntimeEvent({
      level: "error",
      source: "system",
      type: "connection_error",
      message: "Agent connection error.",
      data: { error: message }
    });
  }

  onClose(_connection: Connection, code?: number, reason?: string, wasClean?: boolean) {
    this.appendRuntimeEvent({
      level: "info",
      source: "system",
      type: "connection_closed",
      message: "Agent connection closed.",
      data: { code, reason, wasClean: Boolean(wasClean) }
    });
    if (this.pendingSessionDeletion) {
      void (async () => {
        try {
          const destroyed = await destroyIfIdle(this as never);
          if (!destroyed) {
            scheduleIdleDestroy(this as never, {
              idleTimeoutSeconds: resolveIdleTimeoutSeconds(this.env.AGENT_IDLE_TIMEOUT_SECONDS)
            });
          }
        } catch (err) {
          console.error("Failed to destroy after session deletion:", err);
        } finally {
          this.pendingSessionDeletion = false;
        }
      })();
      return;
    }
    scheduleIdleDestroy(this as never, {
      idleTimeoutSeconds: resolveIdleTimeoutSeconds(this.env.AGENT_IDLE_TIMEOUT_SECONDS)
    });
  }

  async onIdleTimeout() {
    this.appendRuntimeEvent({
      level: "info",
      source: "system",
      type: "idle_destroy",
      message: "Agent destroying after idle timeout."
    });
    await destroyIfIdle(this as never);
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
    this.updateState({
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
        ].slice(-120)
      }
    });
  }

  private async ensureMcpConnections(
    emitProgress?: ProgressEmitter,
    mcpProgressGroupKey?: string
  ): Promise<void> {
    // If init is already in flight, join the existing promise instead of
    // starting a second one. We only clear the promise once it settles so
    // concurrent callers share the same result.
    if (this.mcpInitPromise) {
      await this.mcpInitPromise;
      return;
    }

    // Skip if all active servers are already connected
    const activeServers = MCP_SERVERS.filter((config) => config.active);
    const allConnected = activeServers.every((config) => {
      const entry = this.state.mcp.preconfiguredServers[config.name];
      return entry?.connected && entry.serverId;
    });
    if (allConnected && activeServers.length > 0) {
      return;
    }

    const initPromise = (async () => {
      await Promise.all(activeServers.map(async (config) => {
        emitProgress?.({
          phase: "context",
          status: "info",
          message: `Connecting MCP server: ${config.name}`,
          groupKey: mcpProgressGroupKey || "context:mcp-init"
        });
        const result = await this.activateServer(config.name);
        emitProgress?.({
          phase: "context",
          status: result.success ? "success" : "error",
          message: result.success
            ? `MCP server ready: ${config.name}`
            : `MCP server failed: ${config.name}`,
          snippet: result.error?.slice(0, 240),
          groupKey: mcpProgressGroupKey || "context:mcp-init"
        });
      }));
    })();

    this.mcpInitPromise = initPromise;

    try {
      await initPromise;
    } finally {
      // Only clear if still our promise (avoids clearing a newer init)
      if (this.mcpInitPromise === initPromise) {
        this.mcpInitPromise = null;
      }
    }
  }

  // ============ Chat Methods ============

  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    const msgs = Array.isArray(this.messages) ? this.messages : [];
    let latestUserMessage: (typeof msgs)[number] | undefined;
    for (let i = msgs.length - 1; i >= 0; i--) {
      if (msgs[i].role === "user") {
        latestUserMessage = msgs[i];
        break;
      }
    }
    const latestUserText = latestUserMessage ? getMessageText(latestUserMessage.parts) : "";

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
        const requestTraceId = crypto.randomUUID().slice(0, 8);

        emitProgress({
          phase: "context",
          status: "start",
          message: "Message received. Preparing response pipeline.",
          groupKey: "context:pipeline"
        });

        const heartbeat = setInterval(() => {
          emitProgress({
            phase: "heartbeat",
            status: "info",
            message: "Still thinking..."
          });
        }, 3000);

        // Clear heartbeat immediately if the request is aborted
        const abortCleanup = () => clearInterval(heartbeat);
        options?.abortSignal?.addEventListener("abort", abortCleanup, { once: true });

        writer.write({ type: "text-start", id: textId });
        try {
          const finalResponse = await this.streamAssistantResponse(
            latestUserText,
            writer,
            textId,
            options?.abortSignal,
            emitProgress,
            requestTraceId
          );
          const safeFinalResponse = finalResponse.trim();
          if (!safeFinalResponse) {
            writer.write({ type: "text-delta", id: textId, delta: "抱歉，这次没有生成有效回复，请重试。" });
          }
          writer.write({ type: "text-end", id: textId });
          emitProgress({
            phase: "result",
            status: "success",
            message: "Response streamed to client."
          });
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
          options?.abortSignal?.removeEventListener("abort", abortCleanup);
        }
      }
    });

    return createUIMessageStreamResponse({ stream });
  }

  /**
   * Prepare context shared by both streaming and non-streaming generation paths.
   */
  private async prepareGenerationContext(
    message: string,
    userAlreadyInHistory: boolean,
    emitProgress?: ProgressEmitter,
    requestTraceId?: string
  ) {
    emitProgress?.({
      phase: "context",
      status: "start",
      message: "Loading system prompt and tool context.",
      groupKey: "context:tool-context"
    });
    this.appendRuntimeEvent({
      level: "info",
      source: "chat",
      type: "generate_start",
      message: "Assistant response generation started."
    });

    const mcpProgressGroupKey = requestTraceId
      ? `context:mcp-init:${requestTraceId}`
      : "context:mcp-init";
    const { tools, toolList } = await this.buildAiTools(emitProgress, mcpProgressGroupKey);
    const systemPrompt = buildSystemPromptWithKeywords(toolList, message);
    emitProgress?.({
      phase: "context",
      status: "success",
      message: "Context ready. Requesting draft answer from model.",
      groupKey: "context:model-request"
    });

    const glm = createOpenAICompatible({
      name: "glm",
      apiKey: this.env.BIGMODEL_API_KEY,
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
      message: `History prepared (${source}); messages: ${candidateMessages.length} -> ${messages.length}.`,
      groupKey: "context:history-prune"
    });

    emitProgress?.({
      phase: "model",
      status: "start",
      message: "Model is generating the response."
    });

    const temperature = getModelTemperature(this.env);
    const modelInstance = glm(getModelId(this.env));

    return { tools, systemPrompt, messages, candidateMessages, temperature, modelInstance, glm };
  }

  /**
   * Stream assistant response with real-time text deltas piped to the UI writer.
   * Used by onChatMessage for true end-to-end streaming.
   */
  private async streamAssistantResponse(
    message: string,
    writer: UIMessageStreamWriter,
    textId: string,
    abortSignal?: AbortSignal,
    emitProgress?: ProgressEmitter,
    requestTraceId?: string
  ): Promise<string> {
    const ctx = await this.prepareGenerationContext(message, true, emitProgress, requestTraceId);

    // Stream text deltas directly to the UI writer
    let finalResponse = await streamModelTextToWriter(
      {
        model: ctx.modelInstance,
        system: ctx.systemPrompt,
        messages: ctx.messages,
        tools: ctx.tools,
        temperature: ctx.temperature,
        abortSignal,
        emitProgress,
        maxOutputTokens: getMaxOutputTokens(this.env),
        maxToolSteps: getMaxToolSteps(this.env),
        thinkingType: getThinkingType(this.env),
        streamEnabled: true
      },
      (delta) => writer.write({ type: "text-delta", id: textId, delta })
    );

    // If streaming produced empty text, fall back to non-streaming retry
    if (finalResponse.trim().length === 0) {
      finalResponse = await this.retryEmptyResponse(
        message, ctx, abortSignal, emitProgress
      );
      // Write fallback response as a single delta (it wasn't streamed)
      if (finalResponse.trim().length > 0) {
        writer.write({ type: "text-delta", id: textId, delta: finalResponse });
      }
    }

    emitProgress?.({
      phase: "thinking",
      status: "info",
      message: "Response generation completed.",
      snippet: finalResponse.slice(0, 320)
    });
    this.appendRuntimeEvent({
      level: "success",
      source: "chat",
      type: "generate_success",
      message: "Assistant response generation completed."
    });
    return finalResponse;
  }

  /**
   * Generate assistant response (non-streaming, returns full string).
   * Used by @callable chat() and regenerateFrom().
   */
  private async generateAssistantResponse(
    message: string,
    userAlreadyInHistory: boolean,
    abortSignal?: AbortSignal,
    emitProgress?: ProgressEmitter,
    requestTraceId?: string
  ): Promise<string> {
    const ctx = await this.prepareGenerationContext(
      message, userAlreadyInHistory, emitProgress, requestTraceId
    );

    let finalResponse = await this.requestModelTextInternal({
      model: ctx.modelInstance,
      system: ctx.systemPrompt,
      messages: ctx.messages,
      tools: ctx.tools,
      temperature: ctx.temperature,
      abortSignal,
      emitProgress
    });

    if (finalResponse.trim().length === 0) {
      finalResponse = await this.retryEmptyResponse(
        message, ctx, abortSignal, emitProgress
      );
    }

    emitProgress?.({
      phase: "thinking",
      status: "info",
      message: "Response generation completed.",
      snippet: finalResponse.slice(0, 320)
    });
    this.appendRuntimeEvent({
      level: "success",
      source: "chat",
      type: "generate_success",
      message: "Assistant response generation completed."
    });
    return finalResponse;
  }

  /**
   * Retry when model returns empty response — shared by both streaming and non-streaming paths.
   */
  private async retryEmptyResponse(
    message: string,
    ctx: Awaited<ReturnType<typeof ChatAgentV2.prototype.prepareGenerationContext>>,
    abortSignal?: AbortSignal,
    emitProgress?: ProgressEmitter
  ): Promise<string> {
    const hasToolResults = ctx.messages.some(
      m => m.role === "tool" ||
      (m.role === "assistant" && Array.isArray(m.content) &&
       m.content.some(c => typeof c === "object" && c !== null && "type" in c && c.type === "tool-call"))
    );

    let fallbackAddendum: string;
    if (hasToolResults) {
      const toolSummaries: string[] = [];
      for (const m of ctx.messages) {
        if (m.role === "tool" && Array.isArray(m.content)) {
          for (const part of m.content) {
            if (typeof part === "object" && part !== null && "text" in part && typeof part.text === "string") {
              toolSummaries.push(part.text.slice(0, 500));
            }
          }
        }
      }
      const toolSummaryText = toolSummaries.length > 0
        ? `\n\nHere is a summary of the tool results:\n${toolSummaries.slice(0, 3).join("\n---\n").slice(0, 2000)}`
        : "";
      fallbackAddendum = `\n\nIMPORTANT: Tool calls have already been executed and their results appear in the conversation. You MUST synthesize the tool output into a direct, complete answer for the user. Do not attempt any further tool calls. The user asked: "${message.slice(0, 500)}"${toolSummaryText}`;
    } else {
      fallbackAddendum = `\n\nIMPORTANT: Your previous attempt produced no output. Please respond directly to the user's question with a complete answer. If you are uncertain, say so rather than remaining silent. The user asked: "${message.slice(0, 500)}"`;
    }

    emitProgress?.({
      phase: "model",
      status: "info",
      message: "Primary model response was empty. Retrying without tools."
    });
    this.appendRuntimeEvent({
      level: "info",
      source: "chat",
      type: "generate_empty_retry",
      message: `Primary model response was empty; fallback retry started (hasToolResults=${hasToolResults}).`
    });

    const fallbackMessages = pruneMessages({
      messages: ctx.candidateMessages,
      toolCalls: "before-last-message",
      reasoning: "before-last-message"
    });

    let finalResponse = await this.requestModelTextInternal({
      model: ctx.modelInstance,
      system: `${ctx.systemPrompt}${fallbackAddendum}`,
      messages: fallbackMessages,
      tools: {},
      temperature: Math.max(0.2, ctx.temperature - 0.2),
      abortSignal,
      emitProgress
    });

    if (finalResponse.trim().length === 0) {
      finalResponse = "工具调用后模型未生成有效回复，请重试。 / Empty model response after tool use — please retry.";
      this.appendRuntimeEvent({
        level: "error",
        source: "chat",
        type: "generate_empty_fallback",
        message: "Model returned empty response after fallback retry."
      });
    }

    return finalResponse;
  }

  // ============ Callable Methods ============

  @callable({ description: "Send a chat message and get AI response with tool execution" })
  async chat(message: string): Promise<string> {
    const finalResponse = await this.generateAssistantResponse(message, false);

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
    return getHistoryImpl(this.messages);
  }

  @callable({ description: "Heartbeat probe for connection health checks" })
  heartbeat(): { success: true; serverTime: string } {
    return {
      success: true,
      serverTime: new Date().toISOString()
    };
  }

  @callable({ description: "Clear chat history" })
  async clearChat(): Promise<{ success: boolean }> {
    return clearChatImpl(() => this.persistMessages([]));
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

      this.updateState({
        ...this.state,
        runtime: {
          ...this.initialState.runtime
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
    return deleteMessageImpl(
      messageId,
      this.sql.bind(this) as Parameters<typeof deleteMessageImpl>[1],
      this.messages,
      (msgs) => { this.messages = msgs as typeof this.messages; }
    );
  }

  @callable({ description: "Edit an existing user message" })
  async editUserMessage(
    messageId: string,
    content: string
  ): Promise<{ success: boolean; updated: boolean; error?: string }> {
    return editUserMessageImpl(
      messageId,
      content,
      this.messages,
      this.persistMessages.bind(this) as Parameters<typeof editUserMessageImpl>[3]
    );
  }

  @callable({ description: "Regenerate assistant response starting from a specific message" })
  async regenerateFrom(
    messageId: string
  ): Promise<{ success: boolean; response?: string; error?: string }> {
    return regenerateFromImpl(
      messageId,
      this.messages,
      this.generateAssistantResponse.bind(this),
      this.persistMessages.bind(this) as Parameters<typeof regenerateFromImpl>[3]
    );
  }

  @callable({ description: "Seed a session with specific history messages" })
  async seedHistory(
    messages: Array<{ id: string; role: "user" | "assistant" | "system"; parts: Array<{ type: "text"; text: string }> }>
  ): Promise<{ success: boolean; error?: string }> {
    return seedHistoryImpl(messages, this.persistMessages.bind(this) as Parameters<typeof seedHistoryImpl>[1]);
  }

  // ============ MCP Server Management ============

  private getMcpServerContext() {
    return {
      state: this.state,
      runtimeEnv: this.env,
      mcp: this.mcp,
      addMcpServer: this.addMcpServer.bind(this),
      removeMcpServer: this.removeMcpServer.bind(this),
      retry: this.retry.bind(this),
      getToolMaxAttempts: () => getToolMaxAttempts(this.env),
      updateRetryStats: this.updateRetryStats.bind(this),
      setServerConnectionState: this.setServerConnectionState.bind(this),
      updateLastError: this.updateLastError.bind(this),
      appendRuntimeEvent: this.appendRuntimeEvent.bind(this)
    };
  }

  @callable({ description: "Get list of pre-configured MCP servers" })
  async getPreconfiguredServers(): Promise<McpServerConnectionState["preconfiguredServers"]> {
    return this.state.mcp.preconfiguredServers;
  }

  @callable({ description: "Activate a pre-configured MCP server" })
  async activateServer(
    name: string
  ): Promise<{ success: boolean; error?: string; stateVersion: number }> {
    const result = await activateMcpServer(name, this.getMcpServerContext());
    return { success: result.success, error: result.error, stateVersion: result.stateVersion };
  }

  @callable({ description: "Deactivate a pre-configured MCP server" })
  async deactivateServer(name: string): Promise<{ success: boolean; stateVersion: number }> {
    return deactivateMcpServer(name, this.getMcpServerContext());
  }

  @callable({ description: "Toggle a pre-configured MCP server on/off" })
  async toggleServer(
    name: string
  ): Promise<{ success: boolean; active?: boolean; error?: string; stateVersion: number }> {
    return toggleMcpServer(name, this.getMcpServerContext());
  }

  @callable({ description: "Get available MCP tools" })
  async getAvailableTools() {
    await this.ensureMcpConnections();
    return getMcpTools({
      mcp: this.mcp,
      updateLastError: this.updateLastError.bind(this)
    });
  }

  // ============ Tool Approval Methods ============

  @callable({ description: "List tool approval requests" })
  listToolApprovals(): ToolApprovalRequest[] {
    const prunedState = pruneApprovalState(this.state);
    this.updateState(prunedState);
    return prunedState.runtime.approvals;
  }

  @callable({ description: "Approve pending tool call request" })
  approveToolCall(
    approvalId: string
  ): { success: boolean; error?: string; stateVersion: number } {
    const { success, error, nextState } = approveToolCallState(this.state, approvalId);
    this.updateState(nextState);
    if (success) {
      const target = nextState.runtime.approvals.find((item) => item.id === approvalId);
      this.appendRuntimeEvent({
        level: "success",
        source: "tool",
        type: "tool_approval_granted",
        message: `Tool approval granted for ${target?.toolName}`,
        data: { approvalId }
      });
    }
    return { success, error, stateVersion: nextState.runtime.stateVersion };
  }

  @callable({ description: "Reject pending tool call request" })
  rejectToolCall(
    approvalId: string,
    reason?: string
  ): { success: boolean; error?: string; stateVersion: number } {
    const { success, error, nextState } = rejectToolCallState(this.state, approvalId, reason);
    this.updateState(nextState);
    if (success) {
      const target = nextState.runtime.approvals.find((item) => item.id === approvalId);
      this.appendRuntimeEvent({
        level: "info",
        source: "tool",
        type: "tool_approval_rejected",
        message: `Tool approval rejected for ${target?.toolName}`,
        data: { approvalId, reason: reason || "Rejected by operator" }
      });
    }
    return { success, error, stateVersion: nextState.runtime.stateVersion };
  }

  // ============ Runtime Observability ============

  @callable({ description: "Get runtime observability snapshot" })
  async getRuntimeSnapshot(): Promise<{
    toolRuns: ToolRunRecord[];
    lastError?: string;
    events: AgentRuntimeEvent[];
    approvals: ToolApprovalRequest[];
    retryStats: RetryStats;
    stateVersion: number;
  }> {
    const prunedState = pruneApprovalState(this.state);
    this.updateState(prunedState);
    return getRuntimeSnapshot(prunedState);
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
