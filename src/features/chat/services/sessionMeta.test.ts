import { beforeEach, describe, expect, it } from "vitest";
import {
  loadCurrentSessionId,
  loadSessions,
  migrateSessionsBetweenUsers,
  saveCurrentSessionId,
  saveSessions,
  type SessionMeta
} from "./sessionMeta";

function makeSession(id: string, timestamp: string, title = id): SessionMeta {
  return {
    id,
    title,
    lastMessage: "msg",
    timestamp,
    messageCount: 1
  };
}

describe("migrateSessionsBetweenUsers", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("merges source sessions into target and prefers latest timestamp on duplicates", () => {
    saveSessions("guest-1", [
      makeSession("s-1", "2026-03-01T00:00:00.000Z", "guest old"),
      makeSession("s-2", "2026-03-02T00:00:00.000Z")
    ]);
    saveSessions("user-1", [
      makeSession("s-1", "2026-03-03T00:00:00.000Z", "user new"),
      makeSession("s-3", "2026-03-01T12:00:00.000Z")
    ]);
    saveCurrentSessionId("guest-1", "s-2");

    const result = migrateSessionsBetweenUsers("guest-1", "user-1");

    expect(result.mergedCount).toBe(3);
    expect(result.currentSessionId).toBe("s-2");
    expect(loadCurrentSessionId("user-1")).toBe("s-2");

    const merged = loadSessions("user-1");
    expect(merged.map((session) => session.id)).toEqual(["s-1", "s-2", "s-3"]);
    expect(merged.find((session) => session.id === "s-1")?.title).toBe("user new");
  });

  it("does nothing when source and target are identical", () => {
    saveSessions("user-1", [makeSession("s-1", "2026-03-01T00:00:00.000Z")]);
    saveCurrentSessionId("user-1", "s-1");

    const result = migrateSessionsBetweenUsers("user-1", "user-1");

    expect(result.mergedCount).toBe(0);
    expect(result.currentSessionId).toBe("s-1");
    expect(loadSessions("user-1")).toHaveLength(1);
  });
});
