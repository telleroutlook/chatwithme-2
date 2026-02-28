import { Surface } from "@cloudflare/kumo";
import {
  WrenchIcon,
  SpinnerIcon,
  CheckCircleIcon,
  WarningIcon,
  ClockIcon
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
  { icon: typeof WrenchIcon; color: string; label: string }
> = {
  "input-streaming": {
    icon: SpinnerIcon,
    color: "text-kumo-accent",
    label: "Running"
  },
  "input-available": {
    icon: ClockIcon,
    color: "text-kumo-subtle",
    label: "Pending"
  },
  "output-available": {
    icon: CheckCircleIcon,
    color: "text-green-500",
    label: "Completed"
  },
  error: {
    icon: WarningIcon,
    color: "text-red-500",
    label: "Error"
  },
  "approval-requested": {
    icon: ClockIcon,
    color: "text-amber-500",
    label: "Awaiting Approval"
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

  return (
    <Surface className="my-2 rounded-xl ring ring-kumo-line overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-kumo-control/30 border-b border-kumo-line">
        <div className="flex items-center gap-2">
          <StatusIcon
            size={16}
            weight="fill"
            className={`${config.color} ${isRunning ? "animate-spin" : ""}`}
          />
          <span className="text-sm font-medium text-kumo-default">
            {formatToolName(toolName)}
          </span>
          <span className={`text-xs ${config.color}`}>{config.label}</span>
        </div>
        {duration !== undefined && (
          <span className="text-xs text-kumo-subtle">{duration}ms</span>
        )}
      </div>

      {/* Input Section */}
      {input && Object.keys(input).length > 0 && (
        <div className="px-4 py-2 border-b border-kumo-line/50">
          <div className="text-xs text-kumo-subtle mb-1">Input</div>
          <pre className="text-xs text-kumo-default font-mono overflow-x-auto">
            {JSON.stringify(input, null, 2)}
          </pre>
        </div>
      )}

      {/* Output Section */}
      {state === "output-available" && output !== undefined && (
        <div className="px-4 py-2 bg-green-50/50 dark:bg-green-900/10">
          <div className="text-xs text-green-600 dark:text-green-400 mb-1">
            Result
          </div>
          <pre className="text-xs text-kumo-default font-mono overflow-x-auto whitespace-pre-wrap">
            {formatOutput(output)}
          </pre>
        </div>
      )}

      {/* Error Section */}
      {state === "error" && errorText && (
        <div className="px-4 py-2 bg-red-50/50 dark:bg-red-900/10">
          <div className="text-xs text-red-600 dark:text-red-400 mb-1">
            Error
          </div>
          <pre className="text-xs text-red-600 dark:text-red-400 font-mono overflow-x-auto whitespace-pre-wrap">
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
