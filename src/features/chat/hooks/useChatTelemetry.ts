import { useEffect, useState } from "react";

export interface ChatTelemetryEvent {
  id: string;
  name: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export function useChatTelemetry(limit = 24): ChatTelemetryEvent[] {
  const [events, setEvents] = useState<ChatTelemetryEvent[]>([]);

  useEffect(() => {
    const onEvent = (event: Event) => {
      const custom = event as CustomEvent<{
        name?: unknown;
        payload?: unknown;
        timestamp?: unknown;
      }>;
      const detail = custom.detail;
      if (!detail || typeof detail !== "object" || typeof detail.name !== "string") {
        return;
      }

      const telemetryEvent: ChatTelemetryEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: detail.name,
        timestamp: typeof detail.timestamp === "string" ? detail.timestamp : new Date().toISOString(),
        payload: detail.payload && typeof detail.payload === "object" ? (detail.payload as Record<string, unknown>) : {}
      };

      setEvents((prev) => [telemetryEvent, ...prev].slice(0, limit));
    };

    window.addEventListener("chatwithme:event", onEvent);
    return () => window.removeEventListener("chatwithme:event", onEvent);
  }, [limit]);

  return events;
}
