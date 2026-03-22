import { useEffect, useRef, useState, useCallback } from "react";

/**
 * Options for the `useInViewport` hook.
 */
interface UseInViewportOptions {
  /** Fraction of the element that must be visible to trigger (0–1). Default: 0.1 */
  threshold?: number;
  /** Margin around the root (CSS margin syntax). Default: "0px" */
  rootMargin?: string;
  /**
   * When true, skip the IntersectionObserver and immediately return inViewport=true.
   * Useful for off-screen rendering contexts like PDF export.
   */
  disabled?: boolean;
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
  const { threshold = 0.1, rootMargin = "0px", disabled = false } = options;
  const [inViewport, setInViewport] = useState(disabled);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const nodeRef = useRef<HTMLElement | null>(null);
  // Track triggered state in a ref to avoid re-creating the ref callback.
  const triggeredRef = useRef(disabled);

  // Disconnect any existing observer.
  const disconnect = useCallback(() => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
  }, []);

  // Ref callback — attaches the observer when the DOM node is available.
  // Does NOT include `inViewport` in deps to avoid re-creating on trigger,
  // which would cause React to call ref(null) → ref(node) and restart ECharts.
  const ref = useCallback(
    (node: HTMLElement | null) => {
      // Cleanup previous observer when the node changes.
      disconnect();
      nodeRef.current = node;

      // Already triggered — nothing to observe.
      if (triggeredRef.current || !node) return;

      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            if (entry.isIntersecting) {
              triggeredRef.current = true;
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
    [threshold, rootMargin, disconnect],
  );

  // Cleanup on unmount.
  useEffect(() => disconnect, [disconnect]);

  return { ref, inViewport };
}
