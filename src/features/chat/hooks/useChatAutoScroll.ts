import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

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
  const lastManualScrollAtRef = useRef(0);
  const lastObservedScrollHeightRef = useRef(0);

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
    lastManualScrollAtRef.current = 0;
    setMode("follow");
    setUnreadCount(0);
  }, [scrollRef]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    if (isNearBottom()) {
      setMode("follow");
      setUnreadCount(0);
      return;
    }

    setMode("pause");
    setUnreadCount((count) => count + 1);
  }, [isNearBottom, messagesLength, scrollRef]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || mode !== "follow" || typeof ResizeObserver === "undefined") {
      return;
    }

    lastObservedScrollHeightRef.current = element.scrollHeight;
    let rafId = 0;
    const keepBottom = () => {
      const currentHeight = element.scrollHeight;
      const previousHeight = lastObservedScrollHeightRef.current;
      lastObservedScrollHeightRef.current = currentHeight;

      const hiddenHeight = element.scrollHeight - element.scrollTop - element.clientHeight;
      if (hiddenHeight <= 1) {
        return;
      }
      // Only auto-follow when content grows; ignore shrink/reflow jitter.
      if (currentHeight <= previousHeight + 1) {
        return;
      }
      // Respect recent manual upward scrolls and avoid snapping user back.
      if (Date.now() - lastManualScrollAtRef.current < 280) {
        return;
      }
      element.scrollTop = element.scrollHeight;
    };

    const observer = new ResizeObserver(() => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(keepBottom);
    });

    observer.observe(element);
    if (element.firstElementChild instanceof HTMLElement) {
      observer.observe(element.firstElementChild);
    }

    // Handle already queued late height changes (e.g. iframe postMessage).
    keepBottom();

    return () => {
      if (rafId) {
        cancelAnimationFrame(rafId);
      }
      observer.disconnect();
    };
  }, [messagesLength, mode, scrollRef]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const hiddenHeight = element.scrollHeight - element.scrollTop - element.clientHeight;
    // Only resume follow mode when user is effectively at the very bottom.
    if (hiddenHeight <= 4) {
      lastManualScrollAtRef.current = 0;
      setMode("follow");
      setUnreadCount(0);
      return;
    }

    lastManualScrollAtRef.current = Date.now();
    setMode("pause");
  }, [scrollRef]);

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
