import { useCallback, useEffect, useState } from "react";
import { nanoid } from "nanoid";

export interface EventLogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "error";
  source: "client" | "agent" | "system";
  type: string;
  message: string;
  data?: Record<string, unknown>;
}

interface TrackEventDetail {
  name?: unknown;
  payload?: unknown;
  timestamp?: unknown;
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
    const onTrackedEvent = (event: Event) => {
      const custom = event as CustomEvent<TrackEventDetail>;
      const detail = custom.detail;
      if (!detail || typeof detail !== "object" || typeof detail.name !== "string") {
        return;
      }
      addEvent({
        level: "info",
        source: "client",
        type: detail.name,
        message: detail.name,
        data: detail.payload && typeof detail.payload === "object" ? (detail.payload as Record<string, unknown>) : undefined,
        timestamp: typeof detail.timestamp === "string" ? detail.timestamp : new Date().toISOString()
      });
    };

    window.addEventListener("chatwithme:event", onTrackedEvent);
    return () => window.removeEventListener("chatwithme:event", onTrackedEvent);
  }, [addEvent]);

  return {
    events,
    addEvent,
    clear
  };
}
