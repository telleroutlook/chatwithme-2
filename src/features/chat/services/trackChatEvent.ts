export type ChatEventName =
  | "composer_send"
  | "composer_stop"
  | "message_edit_open"
  | "message_edit_confirm"
  | "message_regenerate"
  | "scroll_back_bottom"
  | "mcp_toggle";

export function trackChatEvent(name: ChatEventName, payload: Record<string, unknown> = {}): void {
  if (typeof window === "undefined") {
    return;
  }

  window.dispatchEvent(
    new CustomEvent("chatwithme:event", {
      detail: {
        name,
        payload,
        timestamp: new Date().toISOString()
      }
    })
  );
}
