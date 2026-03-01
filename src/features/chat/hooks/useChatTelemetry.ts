import { useEffect, useState } from "react";
import { subscribeChatBus } from "../services/chatEventBus";

export interface ChatTelemetryEvent {
  id: string;
  name: string;
  timestamp: string;
  payload: Record<string, unknown>;
}

export function useChatTelemetry(limit = 24): ChatTelemetryEvent[] {
  const [events, setEvents] = useState<ChatTelemetryEvent[]>([]);

  useEffect(() => {
    return subscribeChatBus((detail) => {
      const telemetryEvent: ChatTelemetryEvent = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        name: detail.name,
        timestamp: detail.timestamp,
        payload: detail.payload
      };

      setEvents((prev) => [telemetryEvent, ...prev].slice(0, limit));
    });
  }, [limit]);

  return events;
}
