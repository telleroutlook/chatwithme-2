import { lazy, Suspense, memo, type ReactNode } from "react";
import { ChartSkeleton } from "./skeletons";

// Lazy load the heavy chart components (these include the actual rendering logic)
const MermaidRendererLazy = lazy(() =>
  import("./ChartRenderer").then((m) => ({ default: m.MermaidRenderer }))
);

const G2ChartRendererLazy = lazy(() =>
  import("./ChartRenderer").then((m) => ({ default: m.G2ChartRenderer }))
);

interface LazyMermaidRendererProps {
  code: string;
  animated?: boolean;
}

interface LazyG2ChartRendererProps {
  spec: {
    type?: string;
    data?: Record<string, unknown>[] | Record<string, unknown>;
    encode?: Record<string, string | number>;
    axis?: Record<string, unknown>;
    legend?: Record<string, unknown>;
    scale?: Record<string, unknown>;
    style?: Record<string, unknown>;
    children?: unknown[];
    marks?: unknown[];
  };
  animated?: boolean;
}

/**
 * Lazy-loaded Mermaid renderer with skeleton fallback
 */
export const LazyMermaidRenderer = memo(function LazyMermaidRenderer({
  code,
  animated = true,
}: LazyMermaidRendererProps): ReactNode {
  return (
    <Suspense fallback={<ChartSkeleton type="mermaid" />}>
      <MermaidRendererLazy code={code} animated={animated} />
    </Suspense>
  );
});

/**
 * Lazy-loaded G2 chart renderer with skeleton fallback
 */
export const LazyG2ChartRenderer = memo(function LazyG2ChartRenderer({
  spec,
  animated = true,
}: LazyG2ChartRendererProps): ReactNode {
  return (
    <Suspense fallback={<ChartSkeleton type="g2" />}>
      <G2ChartRendererLazy spec={spec} animated={animated} />
    </Suspense>
  );
});

// Re-export the parser function for immediate use (it's a pure function, no side effects)
export { parseG2SpecFromCode } from "../utils/g2SpecParser";
