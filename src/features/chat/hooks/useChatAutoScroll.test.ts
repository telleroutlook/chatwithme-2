import { act, renderHook } from "@testing-library/react";
import { createRef } from "react";
import { describe, expect, it } from "vitest";
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
});
