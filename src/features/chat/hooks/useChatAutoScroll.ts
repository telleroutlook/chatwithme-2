import { useCallback, useEffect, useRef, useState, type RefObject } from "react";

export type AutoScrollMode = "follow" | "pause";

interface UseChatAutoScrollOptions {
  scrollRef: RefObject<HTMLDivElement | null>;
  messagesLength: number;
  visibilityThreshold?: number;
  nearBottomThreshold?: number;
  showTopThreshold?: number;
  /** Additional bottom offset (e.g., keyboard height + safe-area) */
  bottomInset?: number;
  /** Whether the virtual keyboard is visible (from useVirtualViewport) */
  keyboardVisible?: boolean;
  /** Time to suspend follow mode after keyboard visibility change (default: 250ms) */
  suspendFollowMsAfterKeyboard?: number;
}

interface UseChatAutoScrollResult {
  mode: AutoScrollMode;
  unreadCount: number;
  showBackToBottom: boolean;
  showBackToTop: boolean;
  onScroll: () => void;
  scrollToBottom: () => void;
  scrollToTop: () => void;
}

export function useChatAutoScroll({
  scrollRef,
  messagesLength,
  visibilityThreshold = 240,
  nearBottomThreshold = 80,
  showTopThreshold = 200,
  bottomInset = 0,
  keyboardVisible = false,
  suspendFollowMsAfterKeyboard = 250
}: UseChatAutoScrollOptions): UseChatAutoScrollResult {
  const [mode, setMode] = useState<AutoScrollMode>("follow");
  const [unreadCount, setUnreadCount] = useState(0);
  const modeRef = useRef<AutoScrollMode>("follow");
  const lastManualScrollAtRef = useRef(0);
  const lastObservedScrollHeightRef = useRef(0);
  const keyboardSuspendUntilRef = useRef(0);
  const prevKeyboardVisibleRef = useRef(keyboardVisible);

  const setModeIfChanged = useCallback((nextMode: AutoScrollMode) => {
    if (modeRef.current === nextMode) {
      return;
    }
    modeRef.current = nextMode;
    setMode(nextMode);
  }, []);

  const resetUnreadIfNeeded = useCallback(() => {
    setUnreadCount((count) => (count === 0 ? count : 0));
  }, []);

  // Suspend follow mode when keyboard visibility changes
  useEffect(() => {
    if (keyboardVisible !== prevKeyboardVisibleRef.current) {
      prevKeyboardVisibleRef.current = keyboardVisible;
      keyboardSuspendUntilRef.current = Date.now() + suspendFollowMsAfterKeyboard;
    }
  }, [keyboardVisible, suspendFollowMsAfterKeyboard]);

  const isNearBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return true;
    }
    // Include bottomInset in the threshold calculation
    const effectiveThreshold = nearBottomThreshold + bottomInset;
    return element.scrollHeight - element.scrollTop - element.clientHeight < effectiveThreshold;
  }, [nearBottomThreshold, bottomInset, scrollRef]);

  const scrollToBottom = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    element.scrollTo({ top: element.scrollHeight, behavior: "smooth" });
    lastManualScrollAtRef.current = 0;
    setModeIfChanged("follow");
    resetUnreadIfNeeded();
  }, [resetUnreadIfNeeded, scrollRef, setModeIfChanged]);

  const scrollToTop = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }
    element.scrollTo({ top: 0, behavior: "smooth" });
    lastManualScrollAtRef.current = Date.now();
    setModeIfChanged("pause");
  }, [scrollRef, setModeIfChanged]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    if (isNearBottom()) {
      setModeIfChanged("follow");
      resetUnreadIfNeeded();
      return;
    }

    setModeIfChanged("pause");
    setUnreadCount((count) => count + 1);
  }, [isNearBottom, messagesLength, resetUnreadIfNeeded, scrollRef, setModeIfChanged]);

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
      // Respect keyboard suspend period to avoid jump during keyboard animation
      if (Date.now() < keyboardSuspendUntilRef.current) {
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
  }, [mode, scrollRef]);

  const onScroll = useCallback(() => {
    const element = scrollRef.current;
    if (!element) {
      return;
    }

    const hiddenHeight = element.scrollHeight - element.scrollTop - element.clientHeight;
    // Only resume follow mode when user is effectively at the very bottom.
    if (hiddenHeight <= 4) {
      lastManualScrollAtRef.current = 0;
      setModeIfChanged("follow");
      resetUnreadIfNeeded();
      return;
    }

    lastManualScrollAtRef.current = Date.now();
    setModeIfChanged("pause");
  }, [resetUnreadIfNeeded, scrollRef, setModeIfChanged]);

  // Calculate visibility for both buttons
  const { showBackToBottom, showBackToTop } = (() => {
    const element = scrollRef.current;
    if (!element) {
      return { showBackToBottom: false, showBackToTop: false };
    }

    const hiddenHeight = element.scrollHeight - element.scrollTop - element.clientHeight;
    const scrollTop = element.scrollTop;
    return {
      showBackToBottom: hiddenHeight > visibilityThreshold,
      showBackToTop: scrollTop > showTopThreshold
    };
  })();

  return {
    mode,
    unreadCount,
    showBackToBottom,
    showBackToTop,
    onScroll,
    scrollToBottom,
    scrollToTop
  };
}
