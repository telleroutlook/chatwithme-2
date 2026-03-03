/**
 * Model execution runtime module for ChatAgent
 *
 * Handles:
 * - Model candidate selection logic
 * - Timeout handling
 * - Streaming with snippet emission
 * - requestModelText / streamModelText helpers
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
  thinkingType: "enabled" | "disabled";
  streamEnabled: boolean;
}

// ============ Model Execution Functions ============

/**
 * Request model text with optional streaming support
 */
export async function requestModelText(params: ModelExecutionOptions): Promise<string> {
  const callOptions = {
    model: params.model,
    system: params.system,
    messages: params.messages,
    temperature: params.temperature,
    tools: params.tools,
    stopWhen: stepCountIs(6),
    abortSignal: params.abortSignal,
    ...(params.maxOutputTokens ? { maxOutputTokens: params.maxOutputTokens } : {}),
    providerOptions: {
      glm: {
        thinking: {
          type: params.thinkingType
        }
      }
    }
  };

  if (params.streamEnabled) {
    return await streamModelText(callOptions, params.emitProgress);
  }

  const { text } = await generateText(callOptions);
  return text;
}

/**
 * Stream model text with throttled snippet emission
 */
async function streamModelText(
  callOptions: {
    model: LanguageModel;
    system: string;
    messages: ModelMessage[];
    temperature: number;
    tools?: ToolSet;
    stopWhen: ReturnType<typeof stepCountIs>;
    abortSignal?: AbortSignal;
    maxOutputTokens?: number;
    providerOptions: { glm: { thinking: { type: string } } };
  },
  emitProgress?: ProgressEmitter
): Promise<string> {
  // Throttle state for snippet emission
  let lastEmittedSnippet = "";
  let lastEmitTime = 0;
  let accumulatedText = "";

  const result = streamText({
    ...callOptions,
    onChunk: ({ chunk }) => {
      // Accumulate text from text deltas
      if (chunk.type === "text-delta") {
        accumulatedText += chunk.text;
      }

      const now = Date.now();
      const snippet = extractSnippet(accumulatedText);

      // Throttle: skip if too soon, too short, or duplicate
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
  args: Record<string, unknown>
): string | null {
  if (toolName === "webSearchPrime") {
    const searchQuery = args.search_query;
    if (typeof searchQuery !== "string" || searchQuery.trim().length === 0) {
      return 'Tool "webSearchPrime" requires a non-empty "search_query" field.';
    }
  }
  return null;
}
