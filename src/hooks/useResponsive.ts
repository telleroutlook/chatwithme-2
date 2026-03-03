import { useSyncExternalStore, useMemo, useEffect, useRef } from "react";

// ============ Types ============

export interface ResponsiveInfo {
  /** Mobile device (< 640px) */
  mobile: boolean;
  /** Tablet device (640px - 1024px) */
  tablet: boolean;
  /** Desktop device (> 1024px) */
  desktop: boolean;
  /** Current breakpoint name */
  breakpoint: "mobile" | "tablet" | "desktop";
  /** Current window width */
  width: number;
  /** Current window height */
  height: number;
  /** Whether device supports touch */
  touch: boolean;
  /** Whether device is in landscape orientation */
  landscape: boolean;
  /** Whether device is in portrait orientation */
  portrait: boolean;
}

// ============ Breakpoints ============

export const BREAKPOINTS = {
  sm: 640,
  md: 768,
  lg: 1024,
  xl: 1280,
  "2xl": 1536
} as const;

type BreakpointName = keyof typeof BREAKPOINTS;

// ============ SSR Defaults ============

const SSR_DEFAULTS: ResponsiveInfo = {
  mobile: false,
  tablet: false,
  desktop: true,
  breakpoint: "desktop",
  width: 1024,
  height: 768,
  touch: false,
  landscape: true,
  portrait: false
};

// ============ Singleton Responsive Store ============

type Listener = () => void;

/**
 * Global singleton store for responsive state
 *
 * Uses a single ResizeObserver and resize listener regardless of how many
 * components subscribe. Updates are throttled using requestAnimationFrame
 * to prevent excessive re-renders during orientation changes or keyboard events.
 */
class ResponsiveStore {
  private listeners = new Set<Listener>();
  private state: ResponsiveInfo;
  private resizeObserver: ResizeObserver | null = null;
  private rafId: number | null = null;
  private pendingUpdate = false;
  private initialized = false;

  constructor() {
    // Initialize with SSR defaults
    this.state = SSR_DEFAULTS;
  }

  private computeState(): ResponsiveInfo {
    if (typeof window === "undefined") return SSR_DEFAULTS;

    const width = window.innerWidth;
    const height = window.innerHeight;
    const touch = "ontouchstart" in window || navigator.maxTouchPoints > 0;

    const mobile = width < BREAKPOINTS.sm;
    const tablet = width >= BREAKPOINTS.sm && width < BREAKPOINTS.lg;
    const desktop = width >= BREAKPOINTS.lg;

    let breakpoint: "mobile" | "tablet" | "desktop";
    if (mobile) {
      breakpoint = "mobile";
    } else if (tablet) {
      breakpoint = "tablet";
    } else {
      breakpoint = "desktop";
    }

    return {
      mobile,
      tablet,
      desktop,
      breakpoint,
      width,
      height,
      touch,
      landscape: width > height,
      portrait: width <= height
    };
  }

  private scheduleUpdate = (): void => {
    // Throttle updates using rAF
    if (this.pendingUpdate) return;
    this.pendingUpdate = true;

    this.rafId = requestAnimationFrame(() => {
      this.pendingUpdate = false;
      const newState = this.computeState();

      // Only notify if state actually changed
      if (this.hasStateChanged(newState)) {
        this.state = newState;
        this.notify();
      }
    });
  };

  private hasStateChanged(newState: ResponsiveInfo): boolean {
    return (
      this.state.width !== newState.width ||
      this.state.height !== newState.height ||
      this.state.touch !== newState.touch
    );
  }

  private notify = (): void => {
    this.listeners.forEach((listener) => listener());
  };

  private setupListeners(): void {
    if (typeof window === "undefined" || this.initialized) return;

    this.initialized = true;

    // Initialize state
    this.state = this.computeState();

    // Single ResizeObserver for the document
    this.resizeObserver = new ResizeObserver(this.scheduleUpdate);
    this.resizeObserver.observe(document.documentElement);

    // Fallback resize listener
    window.addEventListener("resize", this.scheduleUpdate, { passive: true });

    // Touch detection (one-time)
    const handleTouch = () => {
      if (!this.state.touch) {
        this.state = { ...this.state, touch: true };
        this.notify();
      }
    };
    window.addEventListener("touchstart", handleTouch, { once: true, passive: true });
  }

  private cleanupListeners(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    if (this.resizeObserver) {
      this.resizeObserver.disconnect();
      this.resizeObserver = null;
    }
    window.removeEventListener("resize", this.scheduleUpdate);
    this.initialized = false;
  }

  subscribe = (listener: Listener): (() => void) => {
    // Setup listeners on first subscription
    if (this.listeners.size === 0) {
      this.setupListeners();
    }

    this.listeners.add(listener);

    // Return cleanup function
    return () => {
      this.listeners.delete(listener);

      // Cleanup when no more listeners
      if (this.listeners.size === 0) {
        this.cleanupListeners();
      }
    };
  };

  getSnapshot = (): ResponsiveInfo => {
    return this.state;
  };

  getServerSnapshot = (): ResponsiveInfo => {
    return SSR_DEFAULTS;
  };
}

// Global singleton instance
const responsiveStore = new ResponsiveStore();

// ============ Hook ============

/**
 * Hook for responsive design breakpoints and device detection
 *
 * Features:
 * - Mobile/tablet/desktop detection
 * - Current breakpoint info
 * - Touch device detection
 * - Orientation detection
 * - SSR-safe
 * - Singleton pattern for optimal performance
 *
 * Uses useSyncExternalStore for concurrent-safe subscriptions.
 * All components share a single ResizeObserver and resize listener.
 *
 * @example
 * ```tsx
 * const { mobile, tablet, desktop, breakpoint } = useResponsive();
 *
 * if (mobile) {
 *   return <Drawer {...props} />;
 * }
 * return <Modal {...props} />;
 * ```
 */
export function useResponsive(): ResponsiveInfo {
  // useSyncExternalStore for concurrent-safe subscriptions
  const state = useSyncExternalStore(
    responsiveStore.subscribe,
    responsiveStore.getSnapshot,
    responsiveStore.getServerSnapshot
  );

  return state;
}

// ============ Media Query Hook ============

/**
 * Hook for checking if a media query matches
 *
 * @example
 * ```tsx
 * const isLargeScreen = useMediaQuery("(min-width: 1024px)");
 * const prefersDark = useMediaQuery("(prefers-color-scheme: dark)");
 * ```
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = useMemo(() => {
    return (callback: () => void) => {
      if (typeof window === "undefined") return () => {};

      const mediaQuery = window.matchMedia(query);
      mediaQuery.addEventListener("change", callback);
      return () => mediaQuery.removeEventListener("change", callback);
    };
  }, [query]);

  const getSnapshot = useMemo(() => {
    return () => {
      if (typeof window === "undefined") return false;
      return window.matchMedia(query).matches;
    };
  }, [query]);

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

// ============ Breakpoint Hook ============

/**
 * Hook for checking if viewport is at or above a breakpoint
 *
 * @example
 * ```tsx
 * const isMd = useBreakpoint("md"); // true if width >= 768px
 * ```
 */
export function useBreakpoint(breakpoint: BreakpointName): boolean {
  const minWidth = BREAKPOINTS[breakpoint];
  return useMediaQuery(`(min-width: ${minWidth}px)`);
}

// ============ Container Query Hook ============

interface UseContainerQueryOptions {
  /** Container ref to observe */
  ref: React.RefObject<HTMLElement | null>;
  /** Width threshold */
  width?: number;
  /** Height threshold */
  height?: number;
}

/**
 * Hook for container queries (element size detection)
 *
 * @example
 * ```tsx
 * const containerRef = useRef<HTMLDivElement>(null);
 * const { width, height, matches } = useContainerQuery({
 *   ref: containerRef,
 *   width: 400,
 * });
 * ```
 */
export function useContainerQuery(options: UseContainerQueryOptions): {
  width: number;
  height: number;
  matches: boolean;
} {
  const { ref, width: widthThreshold, height: heightThreshold } = options;

  // Use a unique store per container ref
  const storeRef = useRef<{
    listeners: Set<() => void>;
    size: { width: number; height: number };
    observer: ResizeObserver | null;
  } | null>(null);

  if (!storeRef.current) {
    storeRef.current = {
      listeners: new Set(),
      size: { width: 0, height: 0 },
      observer: null
    };
  }

  const store = storeRef.current;

  const subscribe = useMemo(() => {
    return (callback: () => void) => {
      store.listeners.add(callback);

      // Setup observer on first subscription
      if (store.listeners.size === 1 && ref.current) {
        store.observer = new ResizeObserver((entries) => {
          const entry = entries[0];
          if (entry) {
            const { inlineSize: width, blockSize: height } = entry.contentBoxSize[0] || {
              inlineSize: entry.contentRect.width,
              blockSize: entry.contentRect.height
            };
            store.size = { width, height };
            store.listeners.forEach((l) => l());
          }
        });
        store.observer.observe(ref.current);
      }

      return () => {
        store.listeners.delete(callback);
        if (store.listeners.size === 0 && store.observer) {
          store.observer.disconnect();
          store.observer = null;
        }
      };
    };
  }, [ref, store]);

  const getSnapshot = useMemo(() => {
    return () => store.size;
  }, [store]);

  const size = useSyncExternalStore(subscribe, getSnapshot, () => ({ width: 0, height: 0 }));

  const matches = useMemo(() => {
    if (widthThreshold !== undefined && size.width < widthThreshold) {
      return false;
    }
    if (heightThreshold !== undefined && size.height < heightThreshold) {
      return false;
    }
    return true;
  }, [size, widthThreshold, heightThreshold]);

  return { ...size, matches };
}

// ============ Utility Functions ============

/**
 * Check if device is mobile (no hooks, for one-time checks)
 */
export function isMobile(): boolean {
  if (typeof window === "undefined") return false;
  return window.innerWidth < BREAKPOINTS.sm;
}

/**
 * Check if device supports touch (no hooks, for one-time checks)
 */
export function isTouchDevice(): boolean {
  if (typeof window === "undefined") return false;
  return "ontouchstart" in window || navigator.maxTouchPoints > 0;
}

/**
 * Get current breakpoint name (no hooks, for one-time checks)
 */
export function getCurrentBreakpoint(): "mobile" | "tablet" | "desktop" {
  if (typeof window === "undefined") return "desktop";
  const width = window.innerWidth;

  if (width < BREAKPOINTS.sm) return "mobile";
  if (width < BREAKPOINTS.lg) return "tablet";
  return "desktop";
}
