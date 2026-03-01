import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";
import { subscribeChatBus } from "../services/chatEventBus";

export interface EventLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "error";
  source: "client" | "agent" | "system";
  type: string;
  message: string;
  data?: Record<string, unknown>;
}

export function useEventLog(limit = 120) {
  const [events, setEvents] = useState<EventLogEntry[]>([]);

  const addEvent = useCallback(
    (event: Omit<EventLogEntry, "id" | "timestamp"> & { timestamp?: string }) => {
      const next: EventLogEntry = {
        id: nanoid(10),
        timestamp: event.timestamp || new Date().toISOString(),
        ...event
      };
      setEvents((prev) => [next, ...prev].slice(0, limit));
    },
    [limit]
  );

  const clear = useCallback(() => {
    setEvents([]);
  }, []);

  useEffect(() => {
    return subscribeChatBus((detail) => {
      addEvent({
        level: "info",
        source: "client",
        type: detail.name,
        message: detail.name,
        data: detail.payload,
        timestamp: detail.timestamp
      });
    });
  }, [addEvent]);

  return {
    events,
    addEvent,
    clear
  };
}
