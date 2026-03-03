import { trackChatBusEvent } from "./chatEventBus";

export type ChatEventName =
  | "composer_send"
  | "composer_stop"
  | "message_edit_open"
  | "message_edit_confirm"
  | "message_regenerate"
  | "scroll_back_bottom"
  | "scroll_back_top"
  | "mcp_toggle"
  | "connection_open"
  | "connection_close"
  | "connection_error"
  | "history_fetch_deduped"
  | "sessions_sync"
  | "chat_export_markdown"
  | "chat_export_pdf";

export function trackChatEvent(name: ChatEventName, payload: Record<string, unknown> = {}): void {
  trackChatBusEvent(name, payload);
}
