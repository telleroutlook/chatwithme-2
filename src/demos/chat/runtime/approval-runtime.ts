/**
 * Approval runtime module for ChatAgent
 *
 * Handles:
 * - Approval queue management
 * - Signature building and verification
 * - Approve/reject state transitions
 */

import {
  type ChatAgentState,
  type ToolApprovalRequest
} from "./state-runtime";

// ============ Constants ============

const MAX_APPROVALS = 120;
const MAX_APPROVED_SIGNATURES = 200;

// ============ Approval State Helpers ============

/**
 * Prune expired approvals and signatures
 */
export function pruneApprovalState(state: ChatAgentState): ChatAgentState {
  const now = Date.now();
  const keptApprovals = state.runtime.approvals
    .filter((item) => {
      if (item.status === "pending") return true;
      if (!item.resolvedAt) return true;
      return now - new Date(item.resolvedAt).getTime() < 1000 * 60 * 60 * 24;
    })
    .slice(-MAX_APPROVALS);
  const approvedSignatures = state.runtime.approvedSignatures.filter(
    (entry) => new Date(entry.expiresAt).getTime() > now
  );
  return {
    ...state,
    runtime: {
      ...state.runtime,
      approvals: keptApprovals,
      approvedSignatures
    }
  };
}

/**
 * Check if a signature has been approved and consume it
 */
export function hasApprovedSignature(
  state: ChatAgentState,
  signature: string
): { found: boolean; nextState: ChatAgentState } {
  const now = Date.now();
  // Combine check and consumption in a single pass to avoid TOCTOU race.
  const remaining: typeof state.runtime.approvedSignatures = [];
  let found = false;
  for (const entry of state.runtime.approvedSignatures) {
    const isMatch = entry.signature === signature && new Date(entry.expiresAt).getTime() > now;
    if (isMatch && !found) {
      // Consume the first matching signature (skip it from remaining)
      found = true;
    } else {
      remaining.push(entry);
    }
  }
  if (!found) {
    return { found: false, nextState: state };
  }
  const nextState = {
    ...state,
    runtime: {
      ...state.runtime,
      approvedSignatures: remaining
    }
  };
  return { found: true, nextState };
}

/**
 * Queue a new approval request
 */
export function queueApproval(
  state: ChatAgentState,
  params: {
    signature: string;
    toolName: string;
    serverId?: string;
    argsSnippet: string;
  }
): { approval: ToolApprovalRequest; nextState: ChatAgentState } {
  const existing = state.runtime.approvals.find(
    (item) => item.signature === params.signature && item.status === "pending"
  );
  if (existing) {
    return { approval: existing, nextState: state };
  }
  const nextApproval: ToolApprovalRequest = {
    id: crypto.randomUUID(),
    signature: params.signature,
    toolName: params.toolName,
    serverId: params.serverId,
    argsSnippet: params.argsSnippet,
    status: "pending",
    createdAt: new Date().toISOString()
  };
  const nextState = {
    ...state,
    runtime: {
      ...state.runtime,
      approvals: [...state.runtime.approvals, nextApproval].slice(-MAX_APPROVALS)
    }
  };
  return { approval: nextApproval, nextState };
}

/**
 * Approve a pending tool call request
 */
export function approveToolCallState(
  state: ChatAgentState,
  approvalId: string
): { success: boolean; error?: string; nextState: ChatAgentState } {
  const target = state.runtime.approvals.find((item) => item.id === approvalId);
  if (!target || target.status !== "pending") {
    return {
      success: false,
      error: "Approval request not found or already resolved",
      nextState: state
    };
  }

  const resolvedAt = new Date().toISOString();
  const nextState = {
    ...state,
    runtime: {
      ...state.runtime,
      approvals: state.runtime.approvals.map((item) =>
        item.id === approvalId ? { ...item, status: "approved" as const, resolvedAt } : item
      ),
      approvedSignatures: [
        ...state.runtime.approvedSignatures,
        {
          signature: target.signature,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString()
        }
      ].slice(-MAX_APPROVED_SIGNATURES)
    }
  };
  return { success: true, nextState };
}

/**
 * Reject a pending tool call request
 */
export function rejectToolCallState(
  state: ChatAgentState,
  approvalId: string,
  reason?: string
): { success: boolean; error?: string; nextState: ChatAgentState } {
  const target = state.runtime.approvals.find((item) => item.id === approvalId);
  if (!target || target.status !== "pending") {
    return {
      success: false,
      error: "Approval request not found or already resolved",
      nextState: state
    };
  }

  const resolvedAt = new Date().toISOString();
  const nextState = {
    ...state,
    runtime: {
      ...state.runtime,
      approvals: state.runtime.approvals.map((item) =>
        item.id === approvalId
          ? { ...item, status: "rejected" as const, resolvedAt, reason: reason || "Rejected by operator" }
          : item
      )
    }
  };
  return { success: true, nextState };
}
