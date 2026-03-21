import type { PreconfiguredServer } from "./chatTransport";

export interface RuntimeApprovalItem {
  id: string;
  toolName: string;
  argsSnippet: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

export function readPreconfiguredServersFromState(
  state: unknown
): Record<string, PreconfiguredServer> | null {
  if (!state || typeof state !== "object") return null;
  const candidate = state as {
    mcp?: { preconfiguredServers?: Record<string, PreconfiguredServer> };
  };
  const servers = candidate.mcp?.preconfiguredServers;
  if (!servers || typeof servers !== "object") return null;
  return servers;
}

export function readPendingApprovalsFromState(state: unknown): RuntimeApprovalItem[] | null {
  if (!state || typeof state !== "object") return null;
  const candidate = state as {
    runtime?: {
      approvals?: Array<{
        id?: unknown;
        toolName?: unknown;
        argsSnippet?: unknown;
        status?: unknown;
        createdAt?: unknown;
      }>;
    };
  };
  const approvals = candidate.runtime?.approvals;
  if (!Array.isArray(approvals)) return null;

  return approvals
    .filter((item): item is RuntimeApprovalItem => {
      return (
        typeof item.id === "string" &&
        typeof item.toolName === "string" &&
        typeof item.argsSnippet === "string" &&
        (item.status === "pending" || item.status === "approved" || item.status === "rejected") &&
        typeof item.createdAt === "string"
      );
    })
    .filter((item) => item.status === "pending");
}

export function readDeepResearchFromState(state: unknown): boolean | null {
  if (!state || typeof state !== "object") return null;
  const candidate = state as { deepResearch?: unknown };
  if (typeof candidate.deepResearch !== "boolean") return null;
  return candidate.deepResearch;
}

export function isReadonlyModeQueryEnabled(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("mode") === "view";
}
