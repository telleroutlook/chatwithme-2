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

interface ToolCallCardProps {
  toolName: string;
  state: ToolCallState;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
  duration?: number;
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
    color: "text-green-500",
    label: "Completed",
    badgeClass: "bg-green-500/15 text-green-600",
    panelClass: "ring-green-500/40"
  },
  error: {
    icon: WarningIcon,
    color: "text-red-500",
    label: "Error",
    badgeClass: "bg-red-500/15 text-red-600",
    panelClass: "ring-red-500/40"
  },
  "approval-requested": {
    icon: ShieldCheckIcon,
    color: "text-amber-500",
    label: "Awaiting Approval",
    badgeClass: "bg-amber-500/15 text-amber-600",
    panelClass: "ring-amber-500/40"
  }
};

export function ToolCallCard({
  toolName,
  state,
  input,
  output,
  errorText,
  duration
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
            <div className="text-sm font-medium text-kumo-default">
              {formatToolName(toolName)}
            </div>
            {toolNamespace && (
              <div className="text-xs text-kumo-subtle font-mono mt-0.5">
                {toolNamespace}
              </div>
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
        <div className="px-4 py-2 bg-green-500/5">
          <div className="text-xs text-green-600 mb-1 font-medium">
            Result
          </div>
          <pre className="text-xs text-kumo-default font-mono overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-kumo-control/20 p-2.5">
            {formatOutput(output)}
          </pre>
        </div>
      )}

      {/* Error Section */}
      {state === "error" && errorText && (
        <div className="px-4 py-2 bg-red-500/5">
          <div className="text-xs text-red-600 mb-1 font-medium">
            Error
          </div>
          <pre className="text-xs text-red-600 font-mono overflow-x-auto whitespace-pre-wrap break-words rounded-lg bg-red-500/5 p-2.5">
            {errorText}
          </pre>
        </div>
      )}
    </Surface>
  );
}

// Helper to extract tool calls from message parts
export function extractToolCalls(
  parts: Array<{ type: string; [key: string]: unknown }>
): Array<{
  toolName: string;
  state: ToolCallState;
  input?: Record<string, unknown>;
  output?: unknown;
  errorText?: string;
}> {
  const toolCalls: Array<{
    toolName: string;
    state: ToolCallState;
    input?: Record<string, unknown>;
    output?: unknown;
    errorText?: string;
  }> = [];

  for (const part of parts) {
    // Handle dynamic-tool type
    if (part.type === "dynamic-tool") {
      const dynamicPart = part as unknown as {
        toolName?: unknown;
        state?: unknown;
        input?: unknown;
        output?: unknown;
        errorText?: unknown;
      };
      if (typeof dynamicPart.toolName !== "string") {
        continue;
      }
      const state = isToolCallState(dynamicPart.state)
        ? dynamicPart.state
        : "error";

      toolCalls.push({
        toolName: dynamicPart.toolName,
        state,
        input: dynamicPart.input as Record<string, unknown> | undefined,
        output: dynamicPart.output,
        errorText:
          typeof dynamicPart.errorText === "string"
            ? dynamicPart.errorText
            : undefined
      });
    }

    // Handle typed tool (tool-xxx pattern)
    if (part.type.startsWith("tool-") && part.type !== "dynamic-tool") {
      const toolPart = part as {
        type: string;
        toolCallId?: string;
        state: unknown;
        input?: unknown;
        output?: unknown;
        errorText?: unknown;
      };

      const toolName = part.type.replace("tool-", "");
      const state = isToolCallState(toolPart.state) ? toolPart.state : "error";
      toolCalls.push({
        toolName,
        state,
        input: toolPart.input as Record<string, unknown> | undefined,
        output: toolPart.output,
        errorText: typeof toolPart.errorText === "string" ? toolPart.errorText : undefined
      });
    }
  }

  return toolCalls;
}
