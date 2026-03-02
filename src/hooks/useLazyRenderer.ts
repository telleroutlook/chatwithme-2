import { useState, useEffect, useRef } from "react";

interface UseLazyRendererOptions {
  type: string;
  enabled?: boolean;
}

interface UseLazyRendererResult<T = unknown> {
  renderer: T | null;
  isLoading: boolean;
  error: Error | null;
}

// Map of renderer loaders - simplified version
const RENDERER_LOADERS: Record<string, () => Promise<unknown>> = {
  mermaid: () => import("mermaid").then((m) => m.default || m),
  g2: () => import("@antv/g2").then((m) => ({ Chart: m.Chart })),
  katex: () => import("katex").then((m) => m.default || m),
  shiki: () => import("shiki").then((m) => m),
};

export function useLazyRenderer<T = unknown>({
  type,
  enabled = true,
}: UseLazyRendererOptions): UseLazyRendererResult<T> {
  const [renderer, setRenderer] = useState<T | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    if (!enabled || !type) return;

    const loader = RENDERER_LOADERS[type];
    if (!loader) {
      setError(new Error(`Unknown renderer type: ${type}`));
      return;
    }

    setIsLoading(true);

    loader()
      .then((module) => {
        setRenderer(module as T);
        setError(null);
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
      })
      .finally(() => {
        setIsLoading(false);
      });
  }, [type, enabled]);

  return { renderer, isLoading, error };
}
