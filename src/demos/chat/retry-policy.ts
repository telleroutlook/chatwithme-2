export type RetryKind = "tool" | "mcp_connection";

const BASE_RETRYABLE_TOKENS = [
  "timeout", "network", "fetch", "econnreset", "econnrefused",
  "temporar", "503", "429", "502", "504", "rate limit", "too many requests"
];
const MCP_EXTRA_RETRYABLE_TOKENS = ["connection", "socket hang up", "aborted"];

export function classifyRetryableError(kind: RetryKind, error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();
  const tokens =
    kind === "mcp_connection" ? [...BASE_RETRYABLE_TOKENS, ...MCP_EXTRA_RETRYABLE_TOKENS] : BASE_RETRYABLE_TOKENS;
  return tokens.some((token) => lowered.includes(token));
}
