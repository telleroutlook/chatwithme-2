/**
 * Runtime modules for ChatAgent
 *
 * Re-exports all runtime functionality:
 * - State management
 * - Approval handling
 * - Model execution
 * - Tool execution
 * - MCP server management
 */

// State runtime
export {
  type McpServerConnectionState,
  type ToolRunRecord,
  type AgentRuntimeEvent,
  type RetryStats,
  type ToolApprovalRequest,
  type ChatAgentState,
  type ProgressPhase,
  type LiveProgressEvent,
  type ProgressEmitter,
  createInitialRuntimeState,
  appendRuntimeEvent,
  updateLastErrorState,
  updateRetryStatsState,
  upsertToolRunState,
  setServerConnectionState,
  getRuntimeSnapshot
} from "./state-runtime";

// Approval runtime
export {
  pruneApprovalState,
  hasApprovedSignature,
  queueApproval,
  approveToolCallState,
  rejectToolCallState
} from "./approval-runtime";

// Model execution
export {
  type ModelExecutionOptions,
  requestModelText,
  validateToolArguments
} from "./model-execution";

// Tool runtime
export {
  type ToolExecutionContext,
  type ToolExecutionResult,
  isRetryableToolError,
  isRetryableMcpConnectionError,
  callMcpToolWithRetry,
  buildAiTools,
  getMessageText
} from "./tool-runtime";

// MCP server runtime
export {
  type McpServerContext,
  activateMcpServer,
  deactivateMcpServer,
  toggleMcpServer,
  getMcpTools
} from "./mcp-server-runtime";

// Chat methods
export {
  getHistory,
  clearChat,
  deleteMessage,
  editUserMessage,
  regenerateFrom,
  seedHistory
} from "./chat-methods";
