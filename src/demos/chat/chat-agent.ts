import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import {
  callable,
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
  getMaxToolSteps,
  getModelTimeoutMs
} from "./runtime-config";
import { buildSystemPrompt, stripToolSections } from "./system-prompt";
import { buildLookup as buildChartTemplateLookup } from "./builtin-tools/chart-template";
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
  // Constants
  MAX_RUNTIME_EVENTS,
  // State helpers
  createInitialRuntimeState,
  appendRuntimeEvent,
  updateLastErrorState,
  updateRetryStatsState,
  setServerConnectionState,
  getRuntimeSnapshot,
  // Approval helpers
  pruneApprovalState,
  approveToolCallState,
  rejectToolCallState,
  // Model execution
  requestModelText,
  streamModelTextToWriter,
  // Tool runtime
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
  trimToMessage as trimToMessageImpl,
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

  // ============ Message Handling ============

  private async convertMessagesWithFallback(
    emitProgress?: ProgressEmitter
  ): Promise<ModelMessage[]> {
    const currentMessages = Array.isArray(this.messages) ? this.messages : [];
    try {
      return await convertToModelMessages(currentMessages);
    } catch (error) {
      emitProgress?.({
        phase: "context",
        status: "error",
        message: "Message conversion failed. Using text-only fallback history.",
        snippet: error instanceof Error ? error.message.slice(0, 240) : String(error).slice(0, 240),
        groupKey: "context:history-conversion"
      });
      return toFallbackModelMessages(currentMessages);
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
      this.env.SERPER_API_KEY,
      emitProgress
    );

    return { tools, toolList };
  }

  // ============ Lifecycle Methods ============

  onConnect(_connection: Connection, _ctx: ConnectionContext) {
    cancelIdleSchedules(this as never);
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "ws_connect", agentName: this.name }));
  }

  shouldConnectionBeReadonly(_connection: Connection, ctx: ConnectionContext): boolean {
    const url = new URL(ctx.request.url);
    return url.searchParams.get("mode") === "view";
  }

  onError(connectionOrError: Connection | unknown, maybeError?: unknown) {
    const error = maybeError === undefined ? connectionOrError : maybeError;
    const message = error instanceof Error ? error.message : String(error);
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "ws_error", agentName: this.name, error: message }));
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
    console.log(JSON.stringify({ ts: new Date().toISOString(), event: "ws_close", agentName: this.name, code, reason, wasClean: Boolean(wasClean) }));
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
        ].slice(-MAX_RUNTIME_EVENTS)
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
      // Use allSettled so a single failing server doesn't block all others
      const results = await Promise.allSettled(activeServers.map(async (config) => {
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
        return result;
      }));
      // Log any unexpected rejections (activateServer itself shouldn't throw, but be safe)
      for (const r of results) {
        if (r.status === "rejected") {
          console.error("[mcp_init] Unexpected server activation rejection:", r.reason);
        }
      }
    })();

    // Assign before awaiting so any concurrent caller joins this promise
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
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: "chat_message_received",
      agentName: this.name,
      messageChars: latestUserText.length,
      historyLength: msgs.length
    }));

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
        const t0 = Date.now();
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
          console.log(JSON.stringify({ ts: new Date().toISOString(), event: "chat_message_done", agentName: this.name, traceId: requestTraceId, durationMs: Date.now() - t0, responseChars: finalResponse.length, empty: !safeFinalResponse }));
          emitProgress({
            phase: "result",
            status: "success",
            message: "Response streamed to client."
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Unknown generation error";
          console.log(JSON.stringify({ ts: new Date().toISOString(), event: "chat_message_error", agentName: this.name, traceId: requestTraceId, durationMs: Date.now() - t0, error: message }));
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
    const [{ tools, toolList }, existingMessages] = await Promise.all([
      this.buildAiTools(emitProgress, mcpProgressGroupKey),
      this.convertMessagesWithFallback(emitProgress)
    ]);

    const systemPrompt = buildSystemPrompt(toolList);
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
      message: `History prepared; messages: ${candidateMessages.length} -> ${messages.length}.`,
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

    // Track how much text was already streamed to the UI
    let streamedLength = 0;

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
        streamEnabled: true,
        agentName: this.name
      },
      (delta) => {
        streamedLength += delta.length;
        writer.write({ type: "text-delta", id: textId, delta });
      }
    );

    // If streaming produced empty text, fall back to non-streaming retry.
    // Note: streamedLength may be > 0 even when finalResponse is empty — this
    // happens when the model outputs pre-tool-call text but then exhausts all
    // maxToolSteps without a final "stop" response.
    if (finalResponse.trim().length === 0) {
      finalResponse = await this.retryEmptyResponse(
        message, ctx, abortSignal, emitProgress
      );
      // Write fallback response as a single delta (it wasn't streamed)
      if (finalResponse.trim().length > 0) {
        // Add separator if we already streamed some text before the retry
        if (streamedLength > 0) {
          writer.write({ type: "text-delta", id: textId, delta: "\n\n" });
        }
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
    const t0 = Date.now();
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: "chat_message_received",
      agentName: this.name,
      path: "callable",
      traceId: requestTraceId,
      messageChars: message.length,
      historyLength: Array.isArray(this.messages) ? this.messages.length : 0
    }));

    const ctx = await this.prepareGenerationContext(
      message, userAlreadyInHistory, emitProgress, requestTraceId
    );

    let finalResponse = await requestModelText({
      model: ctx.modelInstance,
      system: ctx.systemPrompt,
      messages: ctx.messages,
      tools: ctx.tools,
      temperature: ctx.temperature,
      abortSignal,
      emitProgress,
      maxOutputTokens: getMaxOutputTokens(this.env),
      maxToolSteps: getMaxToolSteps(this.env, this.state.deepResearch),
      thinkingType: getThinkingType(this.env),
      streamEnabled: getModelStreamEnabled(this.env),
      agentName: this.name
    });

    if (finalResponse.trim().length === 0) {
      finalResponse = await this.retryEmptyResponse(
        message, ctx, abortSignal, emitProgress
      );
    }

    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: "chat_message_done",
      agentName: this.name,
      path: "callable",
      traceId: requestTraceId,
      durationMs: Date.now() - t0,
      responseChars: finalResponse.length,
      empty: finalResponse.trim().length === 0
    }));

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
      fallbackAddendum = `\n\nIMPORTANT: Tool calls have already been executed and their results appear in the conversation. You MUST synthesize the tool output into a direct, complete answer for the user. Do not attempt any further tool calls or output JSON describing tool calls. Answer directly in natural language. The user asked: "${message.slice(0, 500)}"${toolSummaryText}`;
    } else {
      fallbackAddendum = `\n\nIMPORTANT: Your previous attempt produced no output. Please respond directly to the user's question with a complete answer in natural language. Do not output JSON or code blocks describing tool calls. If you are uncertain, say so rather than remaining silent. The user asked: "${message.slice(0, 500)}"`;
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

    // Strip tool-related sections from the system prompt so the model
    // doesn't try to output raw JSON tool calls as text.
    const strippedPrompt = stripToolSections(ctx.systemPrompt);

    let finalResponse = await requestModelText({
      model: ctx.modelInstance,
      system: `${strippedPrompt}${fallbackAddendum}`,
      messages: fallbackMessages,
      tools: {},
      temperature: Math.max(0.2, ctx.temperature - 0.2),
      abortSignal,
      emitProgress,
      maxOutputTokens: getMaxOutputTokens(this.env),
      maxToolSteps: getMaxToolSteps(this.env, this.state.deepResearch),
      thinkingType: getThinkingType(this.env),
      streamEnabled: getModelStreamEnabled(this.env),
      agentName: this.name
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
    const timeoutMs = getModelTimeoutMs(this.env);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(new Error(`Model request timeout after ${timeoutMs}ms`)), timeoutMs);
    let finalResponse: string;
    try {
      finalResponse = await this.generateAssistantResponse(message, false, controller.signal);
    } finally {
      clearTimeout(timeoutId);
    }

    const timestamp = Date.now();
    // Log tool run summary via console for observability (visible in wrangler tail)
    const toolRuns = this.state.runtime.toolRuns ?? [];
    console.log(JSON.stringify({
      ts: new Date().toISOString(),
      event: "tool_run_summary",
      agentName: this.name,
      toolCount: toolRuns.length,
      toolRuns: toolRuns.map(r => ({
        tool: r.toolName,
        status: r.status,
        args: r.argsSnippet?.slice(0, 80),
        durationMs: r.finishedAt && r.startedAt
          ? new Date(r.finishedAt).getTime() - new Date(r.startedAt).getTime()
          : undefined
      }))
    }));
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
      console.error(JSON.stringify({
        event: "persist_failed",
        error: e instanceof Error ? e.message : String(e),
      }));
      // Re-throw so the caller knows the message was not saved.
      throw new Error(`Response generated but failed to save: ${e instanceof Error ? e.message : "unknown error"}`);
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
      if (!hasConnections) {
        // No active connections — destroy immediately.
        this.pendingSessionDeletion = true;
        cancelIdleSchedules(this as never);
        this.schedule(1, "onIdleTimeout" as never, {});
      } else {
        // Connections are open — mark for destruction when the last one closes.
        this.pendingSessionDeletion = true;
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
      this.persistMessages.bind(this) as Parameters<typeof deleteMessageImpl>[3]
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

  @callable({ description: "Fix a broken chart spec given the engine, type, broken spec, and render error" })
  async fixChart(
    engine: string,
    chartType: string,
    brokenSpec: string,
    errorMessage?: string
  ): Promise<{ success: boolean; fixedSpec?: string; error?: string }> {
    // Validate brokenSpec is JSON before embedding in prompt (prevents prompt injection)
    try {
      JSON.parse(brokenSpec);
    } catch {
      return { success: false, error: "brokenSpec must be valid JSON" };
    }
    // Fetch the precise format spec from the knowledge base (same data builtin_chart_template uses)
    const lookup = buildChartTemplateLookup();
    const templateKey = `${engine}:${chartType}`;
    const template = lookup.get(templateKey);

    const templateSection = template
      ? `\n\nOfficial format specification for ${engine} ${chartType}:\n${JSON.stringify(template, null, 2).slice(0, 3000)}`
      : "";
    const errorHint = errorMessage ? `\nRender error: ${errorMessage}` : "";

    const fixPrompt = `You are a chart spec repair assistant. Fix the following broken ${engine} ${chartType} spec so it renders correctly.${errorHint}${templateSection}

Rules:
- Return ONLY the corrected JSON spec — no markdown fences, no explanation.
- Keep the same chart type (${chartType}) and engine (${engine}).
- Follow the official format specification above exactly if provided.
- Do NOT set color, backgroundColor, or font colors — the renderer handles theming.
- Ensure all numeric values are JSON numbers (not strings).
- The output must be valid RFC 8259 JSON with no comments or trailing commas.

Broken spec:
${brokenSpec.slice(0, 6000)}`;

    try {
      const glm = createOpenAICompatible({
        name: "glm",
        apiKey: this.env.BIGMODEL_API_KEY,
        baseURL: "https://open.bigmodel.cn/api/coding/paas/v4"
      });
      const result = await requestModelText({
        model: glm(getModelId(this.env)),
        system: "You are a JSON chart spec repair tool. Output only valid JSON, nothing else.",
        messages: [{ role: "user", content: [{ type: "text", text: fixPrompt }] }],
        tools: {},
        temperature: 0.1,
        maxOutputTokens: getMaxOutputTokens(this.env),
        maxToolSteps: 1,
        thinkingType: "disabled",
        streamEnabled: false,
        agentName: this.name
      });

      const fixedSpec = result.trim();
      if (!fixedSpec) {
        return { success: false, error: "Model returned empty response" };
      }
      // Validate it's JSON
      JSON.parse(fixedSpec);
      return { success: true, fixedSpec };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
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

  @callable({ description: "Trim message history up to the user message preceding messageId, returning the user text so the client can resend it via WebSocket for streaming" })
  async trimToMessage(
    messageId: string
  ): Promise<{ success: boolean; userText?: string; trimmedCount?: number; error?: string }> {
    return trimToMessageImpl(
      messageId,
      this.messages,
      this.persistMessages.bind(this) as Parameters<typeof trimToMessageImpl>[2]
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

  @callable({ description: "Toggle deep research mode (8 tool steps) on or off" })
  toggleDeepResearch(): { deepResearch: boolean } {
    const next = !this.state.deepResearch;
    this.updateState({ ...this.state, deepResearch: next });
    return { deepResearch: next };
  }

  @callable({ description: "Get current deep research mode state" })
  getDeepResearch(): { deepResearch: boolean } {
    return { deepResearch: this.state.deepResearch ?? false };
  }

  // ============ Debug Info ============

  @callable({ description: "Get comprehensive debug information for this agent instance" })
  async getDebugInfo(): Promise<{
    agentName: string;
    messageCount: number;
    lastUserMessage: string;
    lastAssistantSnippet: string;
    mcpServers: Array<{ name: string; connected: boolean; error?: string }>;
    snapshot: Awaited<ReturnType<typeof getRuntimeSnapshot>>;
  }> {
    const prunedState = pruneApprovalState(this.state);
    this.updateState(prunedState);
    const snapshot = getRuntimeSnapshot(prunedState);

    const msgs = Array.isArray(this.messages) ? this.messages : [];
    let lastUserMessage = "";
    let lastAssistantSnippet = "";
    for (let i = msgs.length - 1; i >= 0; i--) {
      const m = msgs[i];
      if (!lastAssistantSnippet && m.role === "assistant") {
        lastAssistantSnippet = getMessageText(m.parts).slice(0, 200);
      }
      if (!lastUserMessage && m.role === "user") {
        lastUserMessage = getMessageText(m.parts).slice(0, 200);
      }
      if (lastUserMessage && lastAssistantSnippet) break;
    }

    const mcpServers = Object.entries(prunedState.mcp.preconfiguredServers).map(
      ([name, entry]) => ({
        name,
        connected: entry.connected,
        ...(entry.error ? { error: entry.error } : {})
      })
    );

    return {
      agentName: this.name,
      messageCount: msgs.length,
      lastUserMessage,
      lastAssistantSnippet,
      mcpServers,
      snapshot
    };
  }
}
