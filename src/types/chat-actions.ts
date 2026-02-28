export type ChatMessageAction = "copy" | "edit" | "regenerate" | "delete" | "fork";

export interface ChatActionItem {
  key: ChatMessageAction;
  label: string;
  enabled?: boolean;
}
