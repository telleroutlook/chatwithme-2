import { describe, expect, it } from "vitest";
import { buildObservabilitySnapshot } from "./observability";

describe("buildObservabilitySnapshot", () => {
  it("aggregates event counts", () => {
    const snapshot = buildObservabilitySnapshot([
      { id: "1", name: "composer_send", timestamp: "2026-03-01T00:00:00.000Z", payload: {} },
      { id: "2", name: "composer_send", timestamp: "2026-03-01T00:00:01.000Z", payload: {} },
      { id: "3", name: "mcp_toggle", timestamp: "2026-03-01T00:00:02.000Z", payload: {} }
    ]);

    expect(snapshot.totalEvents).toBe(3);
    expect(snapshot.eventCounts.composer_send).toBe(2);
    expect(snapshot.eventCounts.mcp_toggle).toBe(1);
  });
});
