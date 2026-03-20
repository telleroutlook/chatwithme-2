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

// ============ Model Execution Functions ============

/**
 * Request model text — returns the full response string.
 * Used by @callable chat() and the empty-response fallback path.
 */
export async function requestModelText(params: ModelExecutionOptions): Promise<string> {
  const callOptions = buildCallOptions(params);

  if (params.streamEnabled) {
    return await streamModelTextCollect(callOptions, params.emitProgress);
  }

  const { text } = await generateText(callOptions);
  return text;
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
        const now = Date.now();
        const snippet = extractSnippet(accumulatedText);
        if (
          now - lastEmitTime >= SNIPPET_THROTTLE_MS &&
          snippet.length >= SNIPPET_MIN_LENGTH_TO_EMIT &&
          snippet !== lastEmittedSnippet
        ) {
          lastEmitTime = now;
          lastEmittedSnippet = snippet;
          params.emitProgress({
            phase: "model",
            message: "Generating response...",
            status: "info",
            snippet
          });
        }
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

  return finalText;
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

      const now = Date.now();
      const snippet = extractSnippet(accumulatedText);

      if (
        now - lastEmitTime < SNIPPET_THROTTLE_MS ||
        snippet.length < SNIPPET_MIN_LENGTH_TO_EMIT ||
        snippet === lastEmittedSnippet
      ) {
        return;
      }

      lastEmitTime = now;
      lastEmittedSnippet = snippet;
      emitProgress?.({
        phase: "model",
        message: "Generating response...",
        status: "info",
        snippet
      });
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
