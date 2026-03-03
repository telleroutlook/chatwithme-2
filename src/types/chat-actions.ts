export type ChatMessageAction = "copy" | "edit" | "regenerate" | "delete";

export interface ChatActionItem {
  key: ChatMessageAction;
  label: string;
  enabled?: boolean;
}
