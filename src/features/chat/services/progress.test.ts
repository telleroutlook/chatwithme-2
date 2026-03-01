import { describe, expect, it } from "vitest";
import { appendLiveProgressEntry, type LiveProgressEntry } from "./progress";

function createEntry(overrides: Partial<LiveProgressEntry> = {}): LiveProgressEntry {
  return {
    id: "entry-1",
    timestamp: "2026-03-01T10:00:00.000Z",
    phase: "heartbeat",
    message: "Still thinking...",
    status: "info",
    severity: "low",
    groupKey: "heartbeat",
    ...overrides
  };
}

describe("appendLiveProgressEntry", () => {
  it("deduplicates adjacent repeated messages and only refreshes timestamp", () => {
    const first = createEntry({ id: "entry-a", timestamp: "2026-03-01T10:00:00.000Z" });
    const duplicate = createEntry({ id: "entry-b", timestamp: "2026-03-01T10:00:05.000Z" });

    const next = appendLiveProgressEntry([first], duplicate);

    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("entry-a");
    expect(next[0]?.timestamp).toBe("2026-03-01T10:00:05.000Z");
  });

  it("keeps non-adjacent duplicates as separate entries", () => {
    const first = createEntry({ id: "entry-a" });
    const middle = createEntry({
      id: "entry-mid",
      phase: "model",
      message: "Model is generating the response.",
      groupKey: "model"
    });
    const repeated = createEntry({ id: "entry-c", timestamp: "2026-03-01T10:00:06.000Z" });

    const next = appendLiveProgressEntry([first, middle], repeated);

    expect(next).toHaveLength(3);
    expect(next[2]?.id).toBe("entry-c");
  });
});
