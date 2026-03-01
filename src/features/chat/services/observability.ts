import type { ChatTelemetryEvent } from "../hooks/useChatTelemetry";

export interface ObservabilitySnapshot {
  totalEvents: number;
  eventCounts: Record<string, number>;
}

export function buildObservabilitySnapshot(events: ChatTelemetryEvent[]): ObservabilitySnapshot {
  const eventCounts: Record<string, number> = {};
  for (const event of events) {
    eventCounts[event.name] = (eventCounts[event.name] ?? 0) + 1;
  }

  return {
    totalEvents: events.length,
    eventCounts
  };
}
