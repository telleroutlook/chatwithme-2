import { trackChatBusEvent } from "./chatEventBus";

export type ChatEventName =
  | "composer_send"
  | "composer_stop"
  | "message_edit_open"
  | "message_edit_confirm"
  | "message_regenerate"
  | "scroll_back_bottom"
  | "mcp_toggle";

export function trackChatEvent(name: ChatEventName, payload: Record<string, unknown> = {}): void {
  trackChatBusEvent(name, payload);
}
