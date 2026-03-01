import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it, vi } from "vitest";
import { useChatAutoScroll } from "./useChatAutoScroll";

function createScrollElement() {
  const div = document.createElement("div");

  Object.defineProperty(div, "scrollHeight", {
    configurable: true,
    get: () => 1000
  });
  Object.defineProperty(div, "clientHeight", {
    configurable: true,
    get: () => 300
  });

  div.scrollTop = 700;
  div.scrollTo = ((arg1?: ScrollToOptions | number, arg2?: number) => {
    if (typeof arg1 === "number") {
      div.scrollTop = arg2 ?? div.scrollTop;
      return;
    }
    div.scrollTop = arg1?.top ?? div.scrollTop;
  }) as HTMLDivElement["scrollTo"];

  return div;
}

describe("useChatAutoScroll", () => {
  it("starts in follow mode and stays near bottom", () => {
    const ref = createRef<HTMLDivElement>();
    ref.current = createScrollElement() as HTMLDivElement;

    const { result, rerender } = renderHook(
      ({ messagesLength }) =>
        useChatAutoScroll({
          scrollRef: ref,
          messagesLength
        }),
      { initialProps: { messagesLength: 1 } }
    );

    expect(result.current.mode).toBe("follow");
    expect(result.current.unreadCount).toBe(0);

    rerender({ messagesLength: 2 });

    expect(result.current.mode).toBe("follow");
    expect(result.current.unreadCount).toBe(0);
  });

  it("tracks paused mode and unread count when user scrolls up", () => {
    const ref = createRef<HTMLDivElement>();
    ref.current = createScrollElement() as HTMLDivElement;

    const { result, rerender } = renderHook(
      ({ messagesLength }) =>
        useChatAutoScroll({
          scrollRef: ref,
          messagesLength
        }),
      { initialProps: { messagesLength: 1 } }
    );

    act(() => {
      if (ref.current) {
        ref.current.scrollTop = 200;
      }
      result.current.onScroll();
    });

    expect(result.current.mode).toBe("pause");

    rerender({ messagesLength: 2 });
    expect(result.current.unreadCount).toBeGreaterThan(0);

    act(() => {
      result.current.scrollToBottom();
    });

    expect(result.current.mode).toBe("follow");
    expect(result.current.unreadCount).toBe(0);
  });

  it("does not force follow mode when user scrolls up with small distance from bottom", () => {
    const ref = createRef<HTMLDivElement>();
    ref.current = createScrollElement() as HTMLDivElement;

    const { result } = renderHook(() =>
      useChatAutoScroll({
        scrollRef: ref,
        messagesLength: 1
      })
    );

    act(() => {
      if (ref.current) {
        // 50px away from bottom should still be treated as user reviewing history.
        ref.current.scrollTop = 650;
      }
      result.current.onScroll();
    });

    expect(result.current.mode).toBe("pause");
  });

  it("keeps bottom pinned on late content resize when follow mode is active", () => {
    const ref = createRef<HTMLDivElement>();
    const element = createScrollElement() as HTMLDivElement;
    ref.current = element;

    const callbacks: Array<ResizeObserverCallback> = [];
    class ResizeObserverMock {
      constructor(cb: ResizeObserverCallback) {
        callbacks.push(cb);
      }
      observe() {}
      disconnect() {}
    }

    vi.stubGlobal("ResizeObserver", ResizeObserverMock);
    vi.stubGlobal("requestAnimationFrame", (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal("cancelAnimationFrame", vi.fn());

    renderHook(() =>
      useChatAutoScroll({
        scrollRef: ref,
        messagesLength: 1
      })
    );

    act(() => {
      Object.defineProperty(element, "scrollHeight", {
        configurable: true,
        get: () => 1400
      });
      callbacks.forEach((cb) => cb([], {} as ResizeObserver));
    });

    expect(element.scrollTop).toBe(1400);
    vi.unstubAllGlobals();
  });
});
