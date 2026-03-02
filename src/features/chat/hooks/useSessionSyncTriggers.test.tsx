import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionSyncTriggers } from "./useSessionSyncTriggers";
import { saveSessions, type SessionMeta } from "../services/sessionMeta";

const SESSION_STORAGE_VERSION_KEY = "chatwithme_session_storage_version";
const TEST_USER_ID = "test-user-123";

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

function seedSessions(sessions: SessionMeta[]): void {
  localStorage.setItem(SESSION_STORAGE_VERSION_KEY, "v4");
  saveSessions(TEST_USER_ID, sessions);
}

describe("useSessionSyncTriggers", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    localStorage.clear();
  });

  it("loads sessions and triggers startup sync once", () => {
    seedSessions([createLocalSession("s1")]);
    const enqueue = vi.fn();
    const setSessions = vi.fn();

    const { rerender } = renderHook(
      ({ currentSessionId }) =>
        useSessionSyncTriggers({
          userId: TEST_USER_ID,
          currentSessionId,
          enqueueSessionSync: enqueue,
          setSessions
        }),
      { initialProps: { currentSessionId: "s1" } }
    );

    expect(setSessions).toHaveBeenCalledTimes(1);
    expect(enqueue).toHaveBeenCalledWith("startup", 0);
    expect(enqueue).toHaveBeenCalledWith("session_switch");

    rerender({ currentSessionId: "s1" });
    expect(setSessions).toHaveBeenCalledTimes(1);
  });

  it("triggers session_switch when current session changes", () => {
    const enqueue = vi.fn();
    const setSessions = vi.fn();

    const { rerender } = renderHook(
      ({ currentSessionId }) =>
        useSessionSyncTriggers({
          userId: TEST_USER_ID,
          currentSessionId,
          enqueueSessionSync: enqueue,
          setSessions
        }),
      { initialProps: { currentSessionId: "s1" } }
    );

    enqueue.mockClear();
    rerender({ currentSessionId: "s2" });
    expect(enqueue).toHaveBeenCalledWith("session_switch");
  });

  it("triggers reconnect via exposed callback", () => {
    const enqueue = vi.fn();
    const setSessions = vi.fn();

    const { result } = renderHook(() =>
      useSessionSyncTriggers({
        userId: TEST_USER_ID,
        currentSessionId: "s1",
        enqueueSessionSync: enqueue,
        setSessions
      })
    );

    enqueue.mockClear();
    act(() => {
      result.current.triggerReconnectSync();
    });
    expect(enqueue).toHaveBeenCalledWith("reconnect", 0);
  });

  it("triggers interval and visibility sync when document is visible", async () => {
    vi.useFakeTimers();
    const enqueue = vi.fn();
    const setSessions = vi.fn();
    const originalVisibility = Object.getOwnPropertyDescriptor(document, "visibilityState");
    Object.defineProperty(document, "visibilityState", {
      configurable: true,
      get: () => "visible"
    });

    try {
      renderHook(() =>
        useSessionSyncTriggers({
          userId: TEST_USER_ID,
          currentSessionId: "s1",
          enqueueSessionSync: enqueue,
          setSessions,
          intervalMs: 1000
        })
      );

      enqueue.mockClear();
      await vi.advanceTimersByTimeAsync(1000);
      expect(enqueue).toHaveBeenCalledWith("interval", 0);

      act(() => {
        document.dispatchEvent(new Event("visibilitychange"));
      });
      expect(enqueue).toHaveBeenCalledWith("visibility", 0);
    } finally {
      if (originalVisibility) {
        Object.defineProperty(document, "visibilityState", originalVisibility);
      }
    }
  });
});
