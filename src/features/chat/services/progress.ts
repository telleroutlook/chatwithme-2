import { nanoid } from "nanoid";

export type ProgressPhase = "context" | "model" | "thinking" | "tool" | "heartbeat" | "result" | "error";

export type ProgressStatus = "start" | "success" | "error" | "info";

export interface LiveProgressEntry {
  id: string;
  timestamp: string;
  phase: ProgressPhase;
  message: string;
  status: ProgressStatus;
  toolName?: string;
  snippet?: string;
  severity: "low" | "normal" | "high";
  groupKey: string;
}

export function isProgressStatus(value: unknown): value is ProgressStatus {
  return value === "start" || value === "success" || value === "error" || value === "info";
}

export function isProgressPhase(value: unknown): value is ProgressPhase {
  return (
    value === "context" ||
    value === "model" ||
    value === "thinking" ||
    value === "tool" ||
    value === "heartbeat" ||
    value === "result" ||
    value === "error"
  );
}

export function parseLiveProgressPart(part: unknown): LiveProgressEntry | null {
  if (!part || typeof part !== "object") return null;

  const candidate = part as { type?: unknown; data?: unknown };
  if (candidate.type !== "data-progress") return null;
  if (!candidate.data || typeof candidate.data !== "object") return null;

  const data = candidate.data as {
    id?: unknown;
    timestamp?: unknown;
    phase?: unknown;
    message?: unknown;
    status?: unknown;
    toolName?: unknown;
    snippet?: unknown;
  };

  if (!isProgressPhase(data.phase) || typeof data.message !== "string") {
    return null;
  }

  const status = isProgressStatus(data.status) ? data.status : "info";
  const severity: LiveProgressEntry["severity"] =
    status === "error" ? "high" : status === "success" ? "normal" : "low";

  return {
    id: typeof data.id === "string" ? data.id : nanoid(10),
    timestamp: typeof data.timestamp === "string" ? data.timestamp : new Date().toISOString(),
    phase: data.phase,
    message: data.message,
    status,
    toolName: typeof data.toolName === "string" ? data.toolName : undefined,
    snippet: typeof data.snippet === "string" ? data.snippet : undefined,
    severity,
    groupKey:
      typeof data.toolName === "string" && data.toolName.length > 0
        ? `${data.phase}:${data.toolName}`
        : String(data.phase)
  };
}
