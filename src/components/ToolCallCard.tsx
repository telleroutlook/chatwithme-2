import { Surface } from "@cloudflare/kumo";
import {
  WrenchIcon,
  SpinnerIcon,
  CheckCircleIcon,
  WarningIcon,
  ClockIcon,
  ShieldCheckIcon
} from "@phosphor-icons/react";

// Tool call states
type ToolCallState =
  | "input-streaming"
  | "input-available"
  | "output-available"
  | "error"
  | "approval-requested";

function isToolCallState(value: unknown): value is ToolCallState {
  return (
    value === "input-streaming" ||
    value === "input-available" ||
    value === "output-available" ||
    value === "error" ||
    value === "approval-requested"
  );
}

const APPROVAL_ID_REGEX = /^[A-Za-z0-9_-]{1,64}$/;
const APPROVAL_ID_FROM_ERROR_REGEX = /\(id:\s*([A-Za-z0-9_-]{1,64})\)/i;

interface BaseToolPart {
  toolCallId?: unknown;
  state?: unknown;
  input?: unknown;
  output?: unknown;
  errorText?: unknown;
}

type RawToolPart = { type: string; [key: string]: unknown };

interface DynamicToolPart extends BaseToolPart, RawToolPart {
  type: "dynamic-tool";
  toolName: unknown;
}

interface TypedToolPart extends BaseToolPart, RawToolPart {
  type: `tool-${string}`;
}

type ToolPart = DynamicToolPart | TypedToolPart;

function isToolInput(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isDynamicToolPart(part: RawToolPart): part is DynamicToolPart {
  return part.type === "dynamic-tool";
}

function isTypedToolPart(part: RawToolPart): part is TypedToolPart {
  return part.type.startsWith("tool-") && part.type !== "dynamic-tool";
}

function getToolState(part: BaseToolPart): ToolCallState {
  return isToolCallState(part.state) ? part.state : "error";
}

function parseApprovalId(candidate: unknown): string | undefined {
  if (typeof candidate !== "string") {
    return undefined;
  }
  const value = candidate.trim();
  if (!APPROVAL_ID_REGEX.test(value)) {
    return undefined;
  }
  return value;
}

function parseApprovalIdFromOutput(candidate: unknown): string | undefined {
  if (!candidate || typeof candidate !== "object") {
    return undefined;
  }
  return parseApprovalId((candidate as { approvalId?: unknown }).approvalId);
}

function parseApprovalIdFromError(candidate: unknown): string | undefined {
  if (typeof candidate !== "string") {
    return undefined;
  }
  const match = candidate.match(APPROVAL_ID_FROM_ERROR_REGEX);
  if (!match) {
    return undefined;
  }
  return parseApprovalId(match[1]);
}

interface ToolCallCardProps {
  toolName: string;
  state: ToolCallState;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
  duration?: number;
  approvalId?: string;
  canApprove?: boolean;
  approvalBusy?: boolean;
  onApprove?: (approvalId: string) => void;
  onReject?: (approvalId: string) => void;
}

// Status icon and color mapping
const statusConfig: Record<
  ToolCallState,
  {
    icon: typeof WrenchIcon;
    color: string;
    label: string;
    badgeClass: string;
    panelClass: string;
  }
> = {
  "input-streaming": {
    icon: SpinnerIcon,
    color: "text-kumo-accent",
    label: "Running",
    badgeClass: "bg-kumo-accent/15 text-kumo-accent",
    panelClass: "ring-kumo-accent/40"
  },
  "input-available": {
    icon: ClockIcon,
    color: "text-kumo-subtle",
    label: "Pending",
    badgeClass: "bg-kumo-control text-kumo-subtle",
    panelClass: "ring-kumo-line"
  },
  "output-available": {
    icon: CheckCircleIcon,
    color: "text-[var(--app-color-success)]",
    label: "Completed",
    badgeClass:
      "bg-[color-mix(in_oklab,var(--app-color-success)_16%,transparent)] text-[var(--app-color-success)]",
    panelClass: "app-border-success-soft"
  },
  error: {
    icon: WarningIcon,
    color: "text-[var(--app-color-danger)]",
    label: "Error",
    badgeClass:
      "bg-[color-mix(in_oklab,var(--app-color-danger)_16%,transparent)] text-[var(--app-color-danger)]",
    panelClass: "app-border-danger-soft"
  },
  "approval-requested": {
    icon: ShieldCheckIcon,
    color: "text-[var(--app-color-warning)]",
    label: "Awaiting Approval",
    badgeClass:
      "bg-[color-mix(in_oklab,var(--app-color-warning)_16%,transparent)] text-[var(--app-color-warning)]",
    panelClass: "app-border-warning-soft"
  }
};

export function ToolCallCard({
  toolName,
  state,
  input,
  output,
  errorText,
  duration,
  approvalId,
  canApprove = false,
  approvalBusy = false,
  onApprove,
  onReject
}: ToolCallCardProps) {
  const config = statusConfig[state];
  const StatusIcon = config.icon;
  const isRunning = state === "input-streaming";

  // Format output for display
  const formatOutput = (data: unknown): string => {
    if (typeof data === "string") {
      return data.length > 500 ? data.slice(0, 500) + "..." : data;
    }
    try {
      const json = JSON.stringify(data, null, 2);
      return json.length > 500 ? json.slice(0, 500) + "..." : json;
    } catch {
      return String(data);
    }
  };

  // Format tool name for display
  const formatToolName = (name: string): string => {
    // Handle namespaced tool names (e.g., "web-search.search")
    const parts = name.split(".");
    return parts.length > 1 ? parts[parts.length - 1] : name;
  };

  const toolNamespace = toolName.includes(".")
    ? toolName.slice(0, toolName.lastIndexOf("."))
    : null;

  return (
    <Surface className={`app-panel my-2 rounded-2xl ring overflow-hidden ${config.panelClass}`}>
      {/* Header */}
      <div className="flex items-start justify-between gap-2 px-4 py-3 bg-kumo-control/20 border-b border-kumo-line/80">
        <div className="flex items-center gap-2">
          <StatusIcon
            size={16}
            weight="fill"
            className={`${config.color} ${isRunning ? "animate-spin" : ""}`}
          />
          <div>
            <div className="text-sm font-medium text-kumo-default">{formatToolName(toolName)}</div>
            {toolNamespace && (
              <div className="text-xs text-kumo-subtle font-mono mt-0.5">{toolNamespace}</div>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-1 rounded-full font-medium ${config.badgeClass}`}>
            {config.label}
          </span>
          {duration !== undefined && (
            <span className="text-xs text-kumo-subtle tabular-nums">{duration}ms</span>
          )}
        </div>
      </div>

      {/* Input Section */}
      {input && Object.keys(input).length > 0 && (
        <div className="px-4 py-2 border-b border-kumo-line/50">
          <div className="text-xs text-kumo-subtle mb-1 font-medium">Input</div>
          <pre className="text-xs text-kumo-default font-mono overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-kumo-control/20 p-2.5">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
      )}

      {/* Output Section */}
      {state === "output-available" && output !== undefined && (
        <div className="px-4 py-2 app-bg-success-soft">
          <div className="mb-1 text-xs font-medium app-text-success">Result</div>
          <pre className="text-xs text-kumo-default font-mono overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-kumo-control/20 p-2.5">
            {formatOutput(output)}
          </pre>
        </div>
      )}

      {/* Error Section */}
      {state === "error" && errorText && (
        <div className="px-4 py-2 app-bg-danger-soft">
          <div className="mb-1 text-xs font-medium app-text-danger">Error</div>
          <pre className="text-xs font-mono overflow-x-auto whitespace-pre-wrap break-words rounded-lg app-bg-danger-soft app-text-danger p-2.5">
            {errorText}
          </pre>
        </div>
      )}

      {state === "approval-requested" && approvalId && onApprove && onReject && (
        <div className="flex items-center gap-2 border-t border-kumo-line/50 px-4 py-2">
          <button
            type="button"
            onClick={() => onApprove(approvalId)}
            disabled={!canApprove || approvalBusy}
            className="rounded border border-kumo-line px-2 py-1 text-xs text-kumo-subtle hover:bg-kumo-control disabled:cursor-not-allowed disabled:opacity-60"
          >
            Approve
          </button>
          <button
            type="button"
            onClick={() => onReject(approvalId)}
            disabled={!canApprove || approvalBusy}
            className="rounded border border-kumo-line px-2 py-1 text-xs text-kumo-subtle hover:bg-kumo-control disabled:cursor-not-allowed disabled:opacity-60"
          >
            Reject
          </button>
        </div>
      )}

      {state === "approval-requested" && !approvalId && (
        <div className="border-t border-kumo-line/50 px-4 py-2">
          <div className="text-xs app-text-danger">
            Approval request is invalid: missing or malformed approval ID.
          </div>
        </div>
      )}
    </Surface>
  );
}

// Helper to extract tool calls from message parts
export function extractToolCalls(parts: RawToolPart[]): Array<{
  toolName: string;
  state: ToolCallState;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
  approvalId?: string;
}> {
  const toolCalls: Array<{
    toolName: string;
    state: ToolCallState;
    input?: Record<string, unknown>;
    output?: unknown;
    errorText?: string;
    approvalId?: string;
  }> = [];

  for (const part of parts) {
    if (isDynamicToolPart(part)) {
      if (typeof part.toolName !== "string") {
        continue;
      }
      const dynamicPart: ToolPart = part;
      const state = getToolState(dynamicPart);

      toolCalls.push({
        toolName: part.toolName,
        state,
        input: isToolInput(dynamicPart.input) ? dynamicPart.input : undefined,
        output: dynamicPart.output,
        errorText: typeof dynamicPart.errorText === "string" ? dynamicPart.errorText : undefined,
        approvalId:
          parseApprovalId(dynamicPart.toolCallId) ??
          parseApprovalIdFromOutput(dynamicPart.output) ??
          parseApprovalIdFromError(dynamicPart.errorText)
      });
    }

    if (isTypedToolPart(part)) {
      const toolPart: ToolPart = part;
      const toolName = toolPart.type.replace("tool-", "");
      const state = getToolState(toolPart);
      toolCalls.push({
        toolName,
        state,
        input: isToolInput(toolPart.input) ? toolPart.input : undefined,
        output: toolPart.output,
        errorText: typeof toolPart.errorText === "string" ? toolPart.errorText : undefined,
        approvalId:
          parseApprovalId(toolPart.toolCallId) ??
          parseApprovalIdFromOutput(toolPart.output) ??
          parseApprovalIdFromError(toolPart.errorText)
      });
    }
  }

  return toolCalls;
}
