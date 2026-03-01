export type RetryKind = "tool" | "mcp_connection";

const BASE_RETRYABLE_TOKENS = ["timeout", "network", "fetch", "econnreset", "temporar", "503", "429"];
const MCP_EXTRA_RETRYABLE_TOKENS = ["connection"];

export function classifyRetryableError(kind: RetryKind, error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const lowered = message.toLowerCase();
  const tokens =
    kind === "mcp_connection" ? [...BASE_RETRYABLE_TOKENS, ...MCP_EXTRA_RETRYABLE_TOKENS] : BASE_RETRYABLE_TOKENS;
  return tokens.some((token) => lowered.includes(token));
}
