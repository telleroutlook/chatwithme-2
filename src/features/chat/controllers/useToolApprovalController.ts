import { useCallback, useMemo } from "react";
import type { EventLogEntry } from "../hooks/useEventLog";
import type { UiMessageKey } from "../../../i18n/ui";
import type { TranslateParams } from "../../../hooks/useI18n";

const DEFAULT_APPROVAL_REJECTION_REASON = "Rejected in chat message card";

interface RuntimeApprovalItem {
  id: string;
  toolName: string;
  argsSnippet: string;
  status: "pending" | "approved" | "rejected";
  createdAt: string;
}

interface UseToolApprovalControllerParams {
  pendingApprovals: RuntimeApprovalItem[];
  setPendingApprovals: React.Dispatch<React.SetStateAction<RuntimeApprovalItem[]>>;
  approvingApprovalId: string | null;
  setApprovingApprovalId: React.Dispatch<React.SetStateAction<string | null>>;
  chatTransport: {
    decideApproval: (approvalId: string, decision: "approve" | "reject", reason?: string) => Promise<boolean>;
  };
  addEventLog: (event: Omit<EventLogEntry, "id" | "timestamp"> & { timestamp?: string }) => void;
  addToast: (message: string, type: "success" | "error" | "info") => void;
  t: (key: UiMessageKey, params?: TranslateParams) => string;
}

export interface UseToolApprovalControllerResult {
  pendingApprovalIds: Set<string>;
  approvingApprovalId: string | null;
  handleApproveToolCall: (approvalId: string) => Promise<void>;
  handleRejectToolCall: (approvalId: string) => Promise<void>;
}

export function useToolApprovalController(
  params: UseToolApprovalControllerParams
): UseToolApprovalControllerResult {
  const {
    pendingApprovals,
    setPendingApprovals,
    approvingApprovalId,
    setApprovingApprovalId,
    chatTransport,
    addEventLog,
    addToast,
    t
  } = params;

  const pendingApprovalIds = useMemo(
    () => new Set(pendingApprovals.map((item) => item.id)),
    [pendingApprovals]
  );

  const handleApproveToolCall = useCallback(
    async (approvalId: string) => {
      if (!pendingApprovals.some((item) => item.id === approvalId)) return;
      setApprovingApprovalId(approvalId);
      try {
        const success = await chatTransport.decideApproval(approvalId, "approve");
        if (!success) {
          addEventLog({
            level: "error",
            source: "client",
            type: "tool_approval_failed",
            message: `Approval failed for ${approvalId}`
          });
          addToast(t("approval_failed", { reason: "Approval failed" }), "error");
          return;
        }
        setPendingApprovals((prev) => prev.filter((item) => item.id !== approvalId));
        addEventLog({
          level: "success",
          source: "client",
          type: "tool_approval_succeeded",
          message: `Approval succeeded for ${approvalId}`
        });
        addToast(t("inspector_approvals_approve"), "success");
      } catch (error) {
        addEventLog({
          level: "error",
          source: "client",
          type: "tool_approval_failed",
          message: error instanceof Error ? error.message : "Unknown error",
          data: { approvalId }
        });
        addToast(
          t("approval_failed", {
            reason: error instanceof Error ? error.message : "Unknown error"
          }),
          "error"
        );
      } finally {
        setApprovingApprovalId((prev) => (prev === approvalId ? null : prev));
      }
    },
    [addEventLog, addToast, chatTransport, pendingApprovals, t, setPendingApprovals, setApprovingApprovalId]
  );

  const handleRejectToolCall = useCallback(
    async (approvalId: string) => {
      if (!pendingApprovals.some((item) => item.id === approvalId)) return;
      setApprovingApprovalId(approvalId);
      try {
        const success = await chatTransport.decideApproval(
          approvalId,
          "reject",
          DEFAULT_APPROVAL_REJECTION_REASON
        );
        if (!success) {
          addEventLog({
            level: "error",
            source: "client",
            type: "tool_rejection_failed",
            message: `Rejection failed for ${approvalId}`
          });
          addToast(t("approval_failed", { reason: "Rejection failed" }), "error");
          return;
        }
        setPendingApprovals((prev) => prev.filter((item) => item.id !== approvalId));
        addEventLog({
          level: "success",
          source: "client",
          type: "tool_rejection_succeeded",
          message: `Rejection succeeded for ${approvalId}`
        });
        addToast(t("inspector_approvals_reject"), "success");
      } catch (error) {
        addEventLog({
          level: "error",
          source: "client",
          type: "tool_rejection_failed",
          message: error instanceof Error ? error.message : "Unknown error",
          data: { approvalId }
        });
        addToast(
          t("approval_failed", {
            reason: error instanceof Error ? error.message : "Unknown error"
          }),
          "error"
        );
      } finally {
        setApprovingApprovalId((prev) => (prev === approvalId ? null : prev));
      }
    },
    [addEventLog, addToast, chatTransport, pendingApprovals, t, setPendingApprovals, setApprovingApprovalId]
  );

  return {
    pendingApprovalIds,
    approvingApprovalId,
    handleApproveToolCall,
    handleRejectToolCall
  };
}
