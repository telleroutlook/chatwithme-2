import { useCallback, useEffect, useState, type RefObject } from "react";

export type AutoScrollMode = "follow" | "pause";

interface UseChatAutoScrollOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  messagesLength: number;
  visibilityThreshold?: number;
  nearBottomThreshold?: number;
}

interface UseChatAutoScrollResult {
  mode: AutoScrollMode;
  unreadCount: number;
  showBackToBottom: boolean;
  onScroll: () => void;
  scrollToBottom: () => void;
}

export function useChatAutoScroll({
  scrollRef,
  messagesLength,
  visibilityThreshold = 240,
  nearBottomThreshold = 80
}: UseChatAutoScrollOptions): UseChatAutoScrollResult {
  const [mode, setMode] = useState<AutoScrollMode>("follow");
  const [unreadCount, setUnreadCount] = useState(0);

  const isNearBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return true;
    }
    return element.scrollHeight - element.scrollTop - element.clientHeight < nearBottomThreshold;
  }, [nearBottomThreshold, scrollRef]);

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    setMode("follow");
    setUnreadCount(0);
  }, [scrollRef]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    if (mode === "follow" || isNearBottom()) {
      element.scrollTop = element.scrollHeight;
      setMode("follow");
      setUnreadCount(0);
      return;
    }

    setUnreadCount((count) => count + 1);
  }, [isNearBottom, messagesLength, mode, scrollRef]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const nearBottom = isNearBottom();
    if (nearBottom) {
      setMode("follow");
      setUnreadCount(0);
      return;
    }

    setMode("pause");
  }, [isNearBottom, scrollRef]);

  const showBackToBottom = (() => {
    const element = scrollRef.current;
    if (!element) {
      return false;
    }

    const hiddenHeight = element.scrollHeight - element.scrollTop - element.clientHeight;
    return hiddenHeight > visibilityThreshold;
  })();

  return {
    mode,
    unreadCount,
    showBackToBottom,
    onScroll,
    scrollToBottom
  };
}
