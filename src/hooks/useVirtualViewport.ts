import { useState, useEffect, useCallback, useMemo } from "react";

// ============ Types ============

export interface VirtualViewportInfo {
  /** Current visual viewport height (excludes keyboard when visible) */
  viewportHeight: number;
  /** Current visual viewport width */
  viewportWidth: number;
  /** Offset from top of layout viewport to visual viewport */
  offsetTop: number;
  /** Whether the virtual keyboard is visible */
  keyboardVisible: boolean;
  /** Height of the virtual keyboard (0 if not visible) */
  keyboardHeight: number;
  /** Current pinch-zoom scale */
  scale: number;
}

export interface UseVirtualViewportOptions {
  /** Minimum height difference to consider keyboard visible (default: 120) */
  keyboardThreshold?: number;
  /** Debounce time in ms for resize events (default: 50) */
  debounceMs?: number;
}

// ============ Constants ============

const SSR_DEFAULTS: VirtualViewportInfo = {
  viewportHeight: 768,
  viewportWidth: 1024,
  offsetTop: 0,
  keyboardVisible: false,
  keyboardHeight: 0,
  scale: 1
};

// ============ Hook ============

/**
 * Hook for tracking the visual viewport with keyboard detection
 *
 * Uses the Visual Viewport API when available, with fallback to window dimensions.
 * Essential for mobile UX where the virtual keyboard affects available space.
 *
 * @example
 * ```tsx
 * const { viewportHeight, keyboardVisible, keyboardHeight } = useVirtualViewport();
 *
 * // Adjust layout when keyboard is visible
 * const bottomPadding = keyboardVisible ? keyboardHeight : 0;
 * ```
 */
export function useVirtualViewport(
  options: UseVirtualViewportOptions = {}
): VirtualViewportInfo {
  const { keyboardThreshold = 120, debounceMs = 50 } = options;

  // Track layout viewport dimensions
  const [layoutHeight, setLayoutHeight] = useState<number>(() =>
    typeof window !== "undefined" ? window.innerHeight : SSR_DEFAULTS.viewportHeight
  );

  // Track visual viewport dimensions
  const [visualHeight, setVisualHeight] = useState<number>(() => {
    if (typeof window === "undefined") return SSR_DEFAULTS.viewportHeight;
    // visualViewport may not be available in all browsers
    if ("visualViewport" in window && window.visualViewport) {
      return window.visualViewport.height;
    }
    return window.innerHeight;
  });

  const [visualWidth, setVisualWidth] = useState<number>(() => {
    if (typeof window === "undefined") return SSR_DEFAULTS.viewportWidth;
    if ("visualViewport" in window && window.visualViewport) {
      return window.visualViewport.width;
    }
    return window.innerWidth;
  });

  const [offsetTop, setOffsetTop] = useState<number>(() => {
    if (typeof window === "undefined") return 0;
    if ("visualViewport" in window && window.visualViewport) {
      return window.visualViewport.offsetTop;
    }
    return 0;
  });

  const [scale, setScale] = useState<number>(() => {
    if (typeof window === "undefined") return 1;
    if ("visualViewport" in window && window.visualViewport) {
      return window.visualViewport.scale;
    }
    return 1;
  });

  // Debounce timer ref
  const [debounceTimer, setDebounceTimer] = useState<ReturnType<typeof setTimeout> | null>(null);

  // Handle visual viewport changes
  const handleVisualViewportChange = useCallback(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;

    const vv = window.visualViewport;

    // Clear existing timer
    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    // Debounce the update
    const timer = setTimeout(() => {
      setVisualHeight(vv.height);
      setVisualWidth(vv.width);
      setOffsetTop(vv.offsetTop);
      setScale(vv.scale);
    }, debounceMs);

    setDebounceTimer(timer);
  }, [debounceMs, debounceTimer]);

  // Handle window resize (fallback)
  const handleWindowResize = useCallback(() => {
    if (typeof window === "undefined") return;

    if (debounceTimer) {
      clearTimeout(debounceTimer);
    }

    const timer = setTimeout(() => {
      setLayoutHeight(window.innerHeight);

      // If visualViewport is not available, use window dimensions
      if (!("visualViewport" in window && window.visualViewport)) {
        setVisualHeight(window.innerHeight);
        setVisualWidth(window.innerWidth);
      }
    }, debounceMs);

    setDebounceTimer(timer);
  }, [debounceMs, debounceTimer]);

  // Set up event listeners
  useEffect(() => {
    if (typeof window === "undefined") return;

    // Initial values
    setLayoutHeight(window.innerHeight);

    if ("visualViewport" in window && window.visualViewport) {
      const vv = window.visualViewport;
      setVisualHeight(vv.height);
      setVisualWidth(vv.width);
      setOffsetTop(vv.offsetTop);
      setScale(vv.scale);

      // Visual Viewport API events
      vv.addEventListener("resize", handleVisualViewportChange);
      vv.addEventListener("scroll", handleVisualViewportChange);

      return () => {
        vv.removeEventListener("resize", handleVisualViewportChange);
        vv.removeEventListener("scroll", handleVisualViewportChange);
        if (debounceTimer) clearTimeout(debounceTimer);
      };
    }

    // Fallback to window resize
    window.addEventListener("resize", handleWindowResize);
    return () => {
      window.removeEventListener("resize", handleWindowResize);
      if (debounceTimer) clearTimeout(debounceTimer);
    };
  }, [handleVisualViewportChange, handleWindowResize, debounceTimer]);

  // Calculate keyboard state
  const { keyboardVisible, keyboardHeight } = useMemo(() => {
    // Keyboard is considered visible when visual viewport is significantly smaller
    // than layout viewport (accounting for threshold to avoid false positives)
    const heightDiff = layoutHeight - visualHeight - offsetTop;
    const visible = heightDiff > keyboardThreshold;
    return {
      keyboardVisible: visible,
      keyboardHeight: visible ? heightDiff : 0
    };
  }, [layoutHeight, visualHeight, offsetTop, keyboardThreshold]);

  return useMemo(
    () => ({
      viewportHeight: visualHeight,
      viewportWidth: visualWidth,
      offsetTop,
      keyboardVisible,
      keyboardHeight,
      scale
    }),
    [visualHeight, visualWidth, offsetTop, keyboardVisible, keyboardHeight, scale]
  );
}

// ============ Utility Functions ============

/**
 * Check if visual viewport API is supported (no hooks, for one-time checks)
 */
export function isVisualViewportSupported(): boolean {
  if (typeof window === "undefined") return false;
  return "visualViewport" in window && window.visualViewport !== null;
}
