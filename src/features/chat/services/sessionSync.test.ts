import { describe, expect, it } from "vitest";
import { markSessionsStaleFallback, mergeSessionsWithServer } from "./sessionSync";
import type { SessionMeta } from "./sessionMeta";
import type { ChatSessionSummary } from "./chatTransport";

const NOW = "2026-03-01T12:00:00.000Z";

function localSession(overrides: Partial<SessionMeta> = {}): SessionMeta {
  return {
    id: "s1",
    title: "Local Title",
    lastMessage: "local msg",
    timestamp: "2026-03-01T11:00:00.000Z",
    messageCount: 3,
    health: "healthy",
    mismatchCount: 0,
    source: "local-fallback",
    ...overrides
  };
}

function remoteSession(overrides: Partial<ChatSessionSummary> = {}): ChatSessionSummary {
  return {
    sessionId: "s1",
    title: "Remote Title",
    lastMessage: "remote msg",
    messageCount: 4,
    updatedAt: NOW,
    health: "healthy",
    ...overrides
  };
}

describe("mergeSessionsWithServer", () => {
  it("merges server values when remote session exists", () => {
    const merged = mergeSessionsWithServer([localSession()], [remoteSession()], NOW);
    expect(merged[0]).toMatchObject({
      title: "Remote Title",
      lastMessage: "remote msg",
      messageCount: 4,
      health: "healthy",
      mismatchCount: 0,
      source: "server",
      lastSyncedAt: NOW
    });
  });

  it("marks stale when remote session is missing", () => {
    const merged = mergeSessionsWithServer([localSession()], [], NOW);
    expect(merged[0]).toMatchObject({
      health: "stale",
      mismatchCount: 1,
      source: "local-fallback"
    });
  });

  it("auto-prunes session after repeated remote misses (3+)", () => {
    const merged = mergeSessionsWithServer([localSession({ mismatchCount: 2 })], [], NOW);
    expect(merged).toHaveLength(0);
  });

  it("auto-prunes session when remote payload is empty after repeated misses", () => {
    const merged = mergeSessionsWithServer(
      [localSession({ mismatchCount: 2, messageCount: 2, lastMessage: "non-empty" })],
      [remoteSession({ messageCount: 0, lastMessage: "" })],
      NOW
    );
    expect(merged).toHaveLength(0);
  });

  it("marks stale when remote payload is empty but local has content", () => {
    const merged = mergeSessionsWithServer(
      [localSession({ messageCount: 2, lastMessage: "non-empty" })],
      [remoteSession({ messageCount: 0, lastMessage: "" })],
      NOW
    );
    expect(merged[0]).toMatchObject({
      health: "stale",
      mismatchCount: 1,
      source: "server"
    });
  });
});

describe("markSessionsStaleFallback", () => {
  it("increments mismatch count and sets stale source", () => {
    const stale = markSessionsStaleFallback([localSession({ mismatchCount: 5 })], NOW);
    expect(stale[0]).toMatchObject({
      health: "stale",
      mismatchCount: 6,
      source: "local-fallback",
      lastSyncedAt: NOW
    });
  });
});
