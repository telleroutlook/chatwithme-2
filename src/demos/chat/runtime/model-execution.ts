/**
 * Model execution runtime module for ChatAgent
 *
 * Handles:
 * - Model candidate selection logic
 * - Timeout handling
 * - Streaming with snippet emission and direct UI writer piping
 * - requestModelText / streamModelTextToWriter helpers
 */

import {
  generateText,
  streamText,
  type LanguageModel,
  type ModelMessage,
  type ToolSet
} from "ai";
import { stepCountIs } from "ai";
import {
  extractSnippet,
  SNIPPET_THROTTLE_MS,
  SNIPPET_MIN_LENGTH_TO_EMIT
} from "../snippet-utils";
import { resolveToolKind } from "../model-utils";
import type { ProgressEmitter } from "./state-runtime";

// ============ Structured Logging ============

function slog(event: string, data: Record<string, unknown>): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), event, ...data }));
}

// ============ Model Execution Options ============

export interface ModelExecutionOptions {
  model: LanguageModel;
  system: string;
  messages: ModelMessage[];
  temperature: number;
  tools?: ToolSet;
  abortSignal?: AbortSignal;
  emitProgress?: ProgressEmitter;
  maxOutputTokens?: number | undefined;
  maxToolSteps?: number;
  thinkingType: "enabled" | "disabled";
  streamEnabled: boolean;
  /** Optional: agent name for structured logging */
  agentName?: string;
}

/** Callback invoked for each text delta during streaming */
export type TextDeltaCallback = (delta: string) => void;

// ============ Shared Call Options Builder ============

function buildCallOptions(params: ModelExecutionOptions) {
  return {
    model: params.model,
    system: params.system,
    messages: params.messages,
    temperature: params.temperature,
    tools: params.tools,
    stopWhen: stepCountIs(params.maxToolSteps ?? 4),
    abortSignal: params.abortSignal,
    ...(params.maxOutputTokens ? { maxOutputTokens: params.maxOutputTokens } : {}),
    providerOptions: {
      glm: {
        thinking: {
          type: params.thinkingType
        },
        tool_stream: true
      }
    }
  };
}

// ============ Snippet Throttle Helper ============

/**
 * Emit a throttled progress snippet if enough time has passed and content changed.
 * Mutates lastEmitTime and lastEmittedSnippet in-place via the returned values.
 */
function maybeEmitSnippet(
  accumulatedText: string,
  lastEmitTime: number,
  lastEmittedSnippet: string,
  emitProgress: ProgressEmitter
): { lastEmitTime: number; lastEmittedSnippet: string } {
  const now = Date.now();
  const snippet = extractSnippet(accumulatedText);
  if (
    now - lastEmitTime >= SNIPPET_THROTTLE_MS &&
    snippet.length >= SNIPPET_MIN_LENGTH_TO_EMIT &&
    snippet !== lastEmittedSnippet
  ) {
    emitProgress({ phase: "model", message: "Generating response...", status: "info", snippet });
    return { lastEmitTime: now, lastEmittedSnippet: snippet };
  }
  return { lastEmitTime, lastEmittedSnippet };
}

// ============ Response Sanitization ============

/**
 * Strip residual <think>...</think> blocks that GLM may leak even when
 * thinking is disabled. Also strips lone </think> closing tags.
 */
function stripThinkingTags(text: string): string {
  // Remove complete <think>...</think> blocks (including multiline)
  let result = text.replace(/<think>[\s\S]*?<\/think>/gi, "");
  // Remove any remaining lone </think> or <think> tags
  result = result.replace(/<\/?think>/gi, "");
  return result.trim();
}

// ============ Model Execution Functions ============

/**
 * Request model text — returns the full response string.
 * Used by @callable chat() and the empty-response fallback path.
 */
export async function requestModelText(params: ModelExecutionOptions): Promise<string> {
  const callOptions = buildCallOptions(params);
  const t0 = Date.now();

  let text: string;
  if (params.streamEnabled) {
    text = await streamModelTextCollect(callOptions, params.emitProgress);
  } else {
    const result = await generateText(callOptions);
    text = result.text;
  }

  const sanitized = stripThinkingTags(text);
  if (sanitized !== text) {
    slog("thinking_tags_stripped", { agentName: params.agentName, before: text.length, after: sanitized.length });
  }

  slog("model_request", {
    path: "non-streaming",
    agentName: params.agentName,
    durationMs: Date.now() - t0,
    responseChars: sanitized.length,
    empty: sanitized.trim().length === 0
  });
  return sanitized;
}

/**
 * Stream model text and pipe each text delta to a callback in real time.
 * Returns the full accumulated text when complete.
 * This is the primary path for onChatMessage — it enables true end-to-end streaming.
 */
export async function streamModelTextToWriter(
  params: ModelExecutionOptions,
  onTextDelta: TextDeltaCallback
): Promise<string> {
  const callOptions = buildCallOptions(params);
  let accumulatedText = "";
  let lastEmitTime = 0;
  let lastEmittedSnippet = "";
  const t0 = Date.now();

  const result = streamText({
    ...callOptions,
    onChunk: ({ chunk }) => {
      if (chunk.type === "text-delta") {
        accumulatedText += chunk.text;
        // Pipe every delta directly to the UI writer
        onTextDelta(chunk.text);
      }

      // Also emit throttled progress snippets for the live feed
      if (params.emitProgress) {
        ({ lastEmitTime, lastEmittedSnippet } = maybeEmitSnippet(
          accumulatedText, lastEmitTime, lastEmittedSnippet, params.emitProgress
        ));
      }
    }
  });

  // Wait for the stream to complete (handles multi-step tool calls)
  const finalText = await result.text;

  // If tool calls produced additional text beyond what was streamed via onChunk,
  // emit the remainder. This happens when the model does tool calls and then
  // generates a final response — streamText accumulates it all in result.text.
  if (finalText.length > accumulatedText.length) {
    const remainder = finalText.slice(accumulatedText.length);
    onTextDelta(remainder);
  }

  // Strip any leaked <think>...</think> tags from the accumulated output.
  // GLM may emit these even with thinking:disabled. Because the tags could
  // span multiple chunks we sanitize the full string after streaming.
  // If stripping removed content we already wrote to the UI, we can't
  // "unsend" it — but we return the sanitized text so it's stored correctly
  // in the message history and the empty-check triggers properly.
  const sanitized = stripThinkingTags(finalText);
  if (sanitized !== finalText) {
    slog("thinking_tags_stripped", {
      agentName: params.agentName,
      path: "streaming",
      before: finalText.length,
      after: sanitized.length
    });
  }

  slog("model_request", {
    path: "streaming",
    agentName: params.agentName,
    durationMs: Date.now() - t0,
    streamedChars: accumulatedText.length,
    finalChars: sanitized.length,
    empty: sanitized.trim().length === 0
  });

  return sanitized;
}

/**
 * Stream model text and collect into a string (for non-writer callers).
 */
async function streamModelTextCollect(
  callOptions: ReturnType<typeof buildCallOptions>,
  emitProgress?: ProgressEmitter
): Promise<string> {
  let lastEmittedSnippet = "";
  let lastEmitTime = 0;
  let accumulatedText = "";

  const result = streamText({
    ...callOptions,
    onChunk: ({ chunk }) => {
      if (chunk.type === "text-delta") {
        accumulatedText += chunk.text;
      }

      if (emitProgress) {
        ({ lastEmitTime, lastEmittedSnippet } = maybeEmitSnippet(
          accumulatedText, lastEmitTime, lastEmittedSnippet, emitProgress
        ));
      }
    }
  });
  return await result.text;
}

// ============ Tool Validation ============

/**
 * Validate tool arguments before execution
 */
export function validateToolArguments(
  toolName: string,
  args: Record<string, unknown>,
  context?: { alias?: string; serverId?: string }
): string | null {
  const kind = resolveToolKind(toolName, context);
  if (kind === "webSearch" || kind === "webSearchPrime") {
    const searchQuery = args.search_query;
    if (typeof searchQuery !== "string" || searchQuery.trim().length === 0) {
      return `Tool "${toolName}" requires a non-empty "search_query" field.`;
    }
  }
  if (kind === "builtinWebReader" || kind === "webReader") {
    const url = args.url;
    if (typeof url !== "string" || url.trim().length === 0) {
      return `Tool "${toolName}" requires a non-empty "url" field.`;
    }
  }
  return null;
}
