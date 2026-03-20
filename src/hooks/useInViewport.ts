import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Options for the `useInViewport` hook.
 */
interface UseInViewportOptions {
  /** Fraction of the element that must be visible to trigger (0–1). Default: 0.1 */
  threshold?: number;
  /** Margin around the root (CSS margin syntax). Default: "0px" */
  rootMargin?: string;
}

/**
 * One-shot IntersectionObserver hook.
 *
 * Returns a `ref` callback to attach to the target element and a boolean
 * `inViewport` that flips to `true` once the element enters the viewport.
 * After triggering it never reverts — the observer disconnects immediately
 * to avoid unnecessary work.
 */
export function useInViewport(options: UseInViewportOptions = {}): {
  ref: (node: HTMLElement | null) => void;
  inViewport: boolean;
} {
  const { threshold = 0.1, rootMargin = "0px" } = options;
  const [inViewport, setInViewport] = useState(false);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);

  // Disconnect any existing observer.
  const disconnect = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  }, []);

  // Ref callback — attaches the observer when the DOM node is available.
  const ref = useCallback(
    (node: HTMLElement | null) => {
      // Cleanup previous observer when the node changes.
      disconnect();
      nodeRef.current = node;

      // Already triggered — nothing to observe.
      if (inViewport || !node) return;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              setInViewport(true);
              observer.disconnect();
              observerRef.current = null;
              return;
            }
          }
        },
        { threshold, rootMargin },
      );

      observer.observe(node);
      observerRef.current = observer;
    },
    // `inViewport` is intentionally in the dep list so we stop observing
    // once triggered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [threshold, rootMargin, inViewport, disconnect],
  );

  // Cleanup on unmount.
  useEffect(() => disconnect, [disconnect]);

  return { ref, inViewport };
}
