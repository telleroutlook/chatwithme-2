import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useSessionHistoryHydration } from "./useSessionHistoryHydration";
import type { ChatHistoryItem } from "../services/chatTransport";

function sampleHistory(): ChatHistoryItem[] {
  return [
    { id: "m1", role: "user", content: "hello" },
    { id: "m2", role: "assistant", content: "world" }
  ];
}

describe("useSessionHistoryHydration", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("hydrates chat messages when status is ready and connected", async () => {
    const loadHistory = vi.fn(async () => sampleHistory());
    const setChatMessages = vi.fn();

    renderHook(() =>
      useSessionHistoryHydration({
        connectionStatus: "connected",
        currentSessionId: "s1",
        status: "ready",
        loadHistory,
        setChatMessages
      })
    );

    await waitFor(() => {
      expect(loadHistory).toHaveBeenCalledTimes(1);
      expect(setChatMessages).toHaveBeenCalledTimes(1);
    });
  });

  it("skips hydration when disconnected", async () => {
    const loadHistory = vi.fn(async () => sampleHistory());
    const setChatMessages = vi.fn();

    renderHook(() =>
      useSessionHistoryHydration({
        connectionStatus: "disconnected",
        currentSessionId: "s1",
        status: "ready",
        loadHistory,
        setChatMessages
      })
    );

    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(loadHistory).not.toHaveBeenCalled();
    expect(setChatMessages).not.toHaveBeenCalled();
  });

  it("does not set messages again for identical signature in same session", async () => {
    let now = 1_000_000;
    vi.spyOn(Date, "now").mockImplementation(() => {
      now += 4000;
      return now;
    });
    const loadHistory = vi.fn(async () => sampleHistory());
    const setChatMessages = vi.fn();

    const { rerender } = renderHook(
      ({ status }) =>
        useSessionHistoryHydration({
          connectionStatus: "connected",
          currentSessionId: "s1",
          status,
          loadHistory,
          setChatMessages
        }),
      { initialProps: { status: "ready" } }
    );

    await waitFor(() => {
      expect(setChatMessages).toHaveBeenCalledTimes(1);
    });

    rerender({ status: "streaming" });
    rerender({ status: "ready" });

    await waitFor(() => {
      expect(loadHistory).toHaveBeenCalledTimes(2);
    });
    expect(setChatMessages).toHaveBeenCalledTimes(1);
  });
});
