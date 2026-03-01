import { describe, expect, it } from "vitest";
import { getNextSessionAfterDelete } from "./sessionSelection";
import type { SessionMeta } from "./sessionMeta";

const baseSessions: SessionMeta[] = [
  {
    id: "s1",
    title: "Session 1",
    lastMessage: "one",
    timestamp: "2026-03-01T00:00:00.000Z",
    messageCount: 1
  },
  {
    id: "s2",
    title: "Session 2",
    lastMessage: "two",
    timestamp: "2026-03-01T00:01:00.000Z",
    messageCount: 2
  }
];

describe("getNextSessionAfterDelete", () => {
  it("keeps current session when deleting a different session", () => {
    const result = getNextSessionAfterDelete(baseSessions, "s2", "s1");
    expect(result).toEqual({ action: "keep-current" });
  });

  it("switches to another session when deleting current session with fallback", () => {
    const result = getNextSessionAfterDelete(baseSessions, "s1", "s1");
    expect(result).toEqual({ action: "switch", sessionId: "s2" });
  });

  it("creates new session when deleting the last session", () => {
    const result = getNextSessionAfterDelete(baseSessions.slice(0, 1), "s1", "s1");
    expect(result).toEqual({ action: "create-new" });
  });
});
