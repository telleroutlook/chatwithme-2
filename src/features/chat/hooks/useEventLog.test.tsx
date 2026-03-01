import { act, renderHook } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useEventLog } from "./useEventLog";

describe("useEventLog", () => {
  it("captures dispatched client telemetry events", () => {
    const { result } = renderHook(() => useEventLog(5));

    act(() => {
      window.dispatchEvent(
        new CustomEvent("chatwithme:event", {
          detail: {
            name: "composer_send",
            payload: { sessionId: "abc" },
            timestamp: "2026-03-01T00:00:00.000Z"
          }
        })
      );
    });

    expect(result.current.events).toHaveLength(1);
    expect(result.current.events[0]?.type).toBe("composer_send");
    expect(result.current.events[0]?.source).toBe("client");
  });

  it("clears existing events", () => {
    const { result } = renderHook(() => useEventLog(5));

    act(() => {
      result.current.addEvent({
        source: "system",
        level: "info",
        type: "connection_open",
        message: "opened"
      });
    });

    expect(result.current.events).toHaveLength(1);

    act(() => {
      result.current.clear();
    });

    expect(result.current.events).toHaveLength(0);
  });
});
