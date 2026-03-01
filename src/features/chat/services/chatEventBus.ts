export interface ChatBusEvent {
  name: string;
  payload: Record<string, unknown>;
  timestamp: string;
}

type ChatBusListener = (event: ChatBusEvent) => void;

const CHAT_EVENT_NAME = "chatwithme:event";
const listeners = new Set<ChatBusListener>();

let bridgeInitialized = false;

function normalizeBusEvent(input: unknown): ChatBusEvent | null {
  if (!input || typeof input !== "object") return null;

  const candidate = input as {
    name?: unknown;
    payload?: unknown;
    timestamp?: unknown;
  };

  if (typeof candidate.name !== "string") return null;

  return {
    name: candidate.name,
    payload:
      candidate.payload && typeof candidate.payload === "object"
        ? (candidate.payload as Record<string, unknown>)
        : {},
    timestamp:
      typeof candidate.timestamp === "string"
        ? candidate.timestamp
        : new Date().toISOString()
  };
}

function publishToSubscribers(event: ChatBusEvent): void {
  for (const listener of listeners) {
    listener(event);
  }
}

function initWindowBridge(): void {
  if (bridgeInitialized || typeof window === "undefined") return;
  bridgeInitialized = true;

  window.addEventListener(CHAT_EVENT_NAME, (event) => {
    const custom = event as CustomEvent<unknown>;
    const next = normalizeBusEvent(custom.detail);
    if (!next) return;
    publishToSubscribers(next);
  });
}

export function emitChatBusEvent(event: ChatBusEvent): void {
  publishToSubscribers(event);
}

export function trackChatBusEvent(name: string, payload: Record<string, unknown> = {}): void {
  emitChatBusEvent({
    name,
    payload,
    timestamp: new Date().toISOString()
  });
}

export function subscribeChatBus(listener: ChatBusListener): () => void {
  initWindowBridge();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
