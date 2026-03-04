import { describe, expect, it } from "vitest";
import { appendLiveProgressEntry, parseLiveProgressPart, type LiveProgressEntry } from "./progress";

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

  it("treats same message with different snippet as new entry", () => {
    const first = createEntry({
      id: "entry-a",
      phase: "model",
      message: "Generating response...",
      snippet: "Hello",
      groupKey: "model"
    });
    const updated = createEntry({
      id: "entry-b",
      phase: "model",
      message: "Generating response...",
      snippet: "Hello world",
      groupKey: "model",
      timestamp: "2026-03-01T10:00:05.000Z"
    });

    const next = appendLiveProgressEntry([first], updated);

    // Different snippet = new entry (not merged)
    expect(next).toHaveLength(2);
    expect(next[1]?.snippet).toBe("Hello world");
  });

  it("merges entries with same message and same snippet", () => {
    const first = createEntry({
      id: "entry-a",
      phase: "model",
      message: "Generating response...",
      snippet: "Hello world",
      groupKey: "model",
      timestamp: "2026-03-01T10:00:00.000Z"
    });
    const duplicate = createEntry({
      id: "entry-b",
      phase: "model",
      message: "Generating response...",
      snippet: "Hello world",
      groupKey: "model",
      timestamp: "2026-03-01T10:00:05.000Z"
    });

    const next = appendLiveProgressEntry([first], duplicate);

    // Same message + same snippet = merged (only timestamp updated)
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe("entry-a");
    expect(next[0]?.timestamp).toBe("2026-03-01T10:00:05.000Z");
  });

  it("handles undefined snippet in comparison", () => {
    const first = createEntry({
      id: "entry-a",
      phase: "context",
      message: "Loading context...",
      groupKey: "context"
    });
    const second = createEntry({
      id: "entry-b",
      phase: "context",
      message: "Loading context...",
      snippet: undefined,
      groupKey: "context",
      timestamp: "2026-03-01T10:00:05.000Z"
    });

    const next = appendLiveProgressEntry([first], second);

    // Both have undefined snippet = merged
    expect(next).toHaveLength(1);
    expect(next[0]?.timestamp).toBe("2026-03-01T10:00:05.000Z");
  });
});

describe("parseLiveProgressPart", () => {
  it("uses explicit groupKey from progress payload when provided", () => {
    const parsed = parseLiveProgressPart({
      type: "data-progress",
      data: {
        id: "entry-g1",
        timestamp: "2026-03-01T10:00:00.000Z",
        phase: "context",
        status: "info",
        message: "Connecting MCP server: web-search-prime",
        groupKey: "context:mcp-init:req123"
      }
    });

    expect(parsed).not.toBeNull();
    expect(parsed?.groupKey).toBe("context:mcp-init:req123");
  });
});
