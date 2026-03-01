import { createContext, useContext } from "react";

interface ApprovalContextValue {
  pendingApprovalIds: Set<string>;
  approvingApprovalId: string | null;
  onApproveToolCall: (approvalId: string) => void;
  onRejectToolCall: (approvalId: string) => void;
}

export const ApprovalContext = createContext<ApprovalContextValue | null>(null);

export function useApprovalContext(): ApprovalContextValue | null {
  return useContext(ApprovalContext);
}
