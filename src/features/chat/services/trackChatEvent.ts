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
  | "chat_export_pdf"
  | "chart_parse_success"
  | "chart_parse_failure"
  | "chart_render_success"
  | "chart_render_failure"
  | "chart_fix_attempt";

export function trackChatEvent(name: ChatEventName, payload: Record<string, unknown> = {}): void {
  trackChatBusEvent(name, payload);
}
