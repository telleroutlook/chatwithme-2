/**
 * useDelayedTransition Hook
 * Prevents visual jitter during state transitions
 * Inspired by lobe-ui's useDelayedAnimated
 */

import { useEffect, useState, useRef } from "react";

/**
 * Delays the transition to a non-streaming state to prevent visual jitter
 */
export function useDelayedTransition(isStreaming: boolean, delay = 500): boolean {
  const [shouldAnimate, setShouldAnimate] = useState(isStreaming);

  useEffect(() => {
    if (isStreaming) {
      setShouldAnimate(true);
    } else {
      // Delay turning off animation to prevent flicker
      const timer = setTimeout(() => setShouldAnimate(false), delay);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, delay]);

  return shouldAnimate;
}

/**
 * Delays showing content until it's stable
 */
export function useDelayedContent(content: string, delay = 100): string {
  const [stableContent, setStableContent] = useState(content);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    const timer = setTimeout(() => {
      setStableContent(content);
    }, delay);

    timeoutRef.current = timer;

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
    };
  }, [content, delay]);

  return stableContent
}
