import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionSync } from "./useSessionSync";
import type { ChatSessionSummary } from "../services/chatTransport";
import { saveSessions, type SessionMeta } from "../services/sessionMeta";

const SESSION_STORAGE_VERSION_KEY = "chatwithme_session_storage_version";

function seedSessions(sessions: SessionMeta[]): void {
  localStorage.setItem(SESSION_STORAGE_VERSION_KEY, "v3");
  saveSessions(sessions);
}

function createLocalSession(id: string): SessionMeta {
  return {
    id,
    title: "Local",
    lastMessage: "local",
    timestamp: "2026-03-01T12:00:00.000Z",
    messageCount: 1,
    health: "healthy",
    mismatchCount: 0,
    source: "local-fallback"
  };
}

function createRemoteSession(id: string): ChatSessionSummary {
  return {
    sessionId: id,
    title: "Remote",
    lastMessage: "remote",
    messageCount: 2,
    updatedAt: "2026-03-01T12:01:00.000Z",
    health: "healthy"
  };
}

describe("useSessionSync", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("deduplicates concurrent syncSessionsNow calls", async () => {
    seedSessions([createLocalSession("s1")]);

    let resolveRemote: ((value: ChatSessionSummary[]) => void) | null = null;
    const getSessions = vi.fn(
      () =>
        new Promise<ChatSessionSummary[]>((resolve) => {
          resolveRemote = resolve;
        })
    );
    const setSessions = vi.fn();
    const { result } = renderHook(() =>
      useSessionSync({
        chatTransport: { getSessions },
        setSessions
      })
    );

    const p1 = result.current.syncSessionsNow("manual");
    const p2 = result.current.syncSessionsNow("manual");
    expect(getSessions).toHaveBeenCalledTimes(1);

    expect(resolveRemote).not.toBeNull();
    resolveRemote!([createRemoteSession("s1")]);
    await Promise.all([p1, p2]);
    expect(setSessions).toHaveBeenCalledTimes(1);
  });

  it("does not call transport when local session list is empty", async () => {
    const getSessions = vi.fn(async () => []);
    const setSessions = vi.fn();
    const { result } = renderHook(() =>
      useSessionSync({
        chatTransport: { getSessions },
        setSessions
      })
    );

    await result.current.syncSessionsNow("manual");
    expect(getSessions).not.toHaveBeenCalled();
    expect(setSessions).toHaveBeenCalledWith([]);
  });

  it("debounces rapid enqueueSessionSync calls", async () => {
    vi.useFakeTimers();
    seedSessions([createLocalSession("s1")]);

    const getSessions = vi.fn(async () => [createRemoteSession("s1")]);
    const setSessions = vi.fn();
    const { result } = renderHook(() =>
      useSessionSync({
        chatTransport: { getSessions },
        setSessions
      })
    );

    act(() => {
      result.current.enqueueSessionSync("startup", 100);
      result.current.enqueueSessionSync("startup", 100);
    });
    expect(getSessions).toHaveBeenCalledTimes(0);

    await vi.advanceTimersByTimeAsync(100);
    expect(getSessions).toHaveBeenCalledTimes(1);
  });

  it("enforces min interval between scheduled syncs", async () => {
    vi.useFakeTimers();
    seedSessions([createLocalSession("s1")]);

    const getSessions = vi.fn(async () => [createRemoteSession("s1")]);
    const setSessions = vi.fn();
    const { result } = renderHook(() =>
      useSessionSync({
        chatTransport: { getSessions },
        setSessions,
        minIntervalMs: 5000
      })
    );

    act(() => {
      result.current.enqueueSessionSync("startup", 0);
    });
    await vi.advanceTimersByTimeAsync(1);
    expect(getSessions).toHaveBeenCalledTimes(1);

    act(() => {
      result.current.enqueueSessionSync("interval", 0);
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(getSessions).toHaveBeenCalledTimes(1);

    await vi.advanceTimersByTimeAsync(5000);
    expect(getSessions).toHaveBeenCalledTimes(2);
  });
});
