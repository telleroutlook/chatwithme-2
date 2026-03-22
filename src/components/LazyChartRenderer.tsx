import { lazy, Suspense, memo, type ReactNode } from "react";
import { ChartSkeleton, Skeleton } from "./skeletons";
import type { EChartsOption } from "../utils/ecSpecParser";
import type { VegaLiteSpec } from "../utils/vegaLiteParser";
import type { StatCardItem } from "../utils/statCardParser";
import type { DashboardSpec } from "../utils/dashboardParser";
import type { ExcalidrawData } from "../utils/excalidrawParser";

// Lazy load the heavy chart components (these include the actual rendering logic)
const MermaidRendererLazy = lazy(() =>
  import("./ChartRenderer").then((m) => ({ default: m.MermaidRenderer }))
);

const EChartsRendererLazy = lazy(() =>
  import("./EChartsRenderer").then((m) => ({ default: m.LazyEChartsRenderer }))
);

const VegaLiteRendererLazy = lazy(() =>
  import("./VegaLiteRenderer").then((m) => ({ default: m.LazyVegaLiteRenderer }))
);

const StatCardLazy = lazy(() =>
  import("./StatCard").then((m) => ({ default: m.StatCard }))
);

const MarkmapRendererLazy = lazy(() =>
  import("./MarkmapRenderer").then((m) => ({ default: m.MarkmapRenderer }))
);

const DashboardRendererLazy = lazy(() =>
  import("./DashboardRenderer").then((m) => ({ default: m.DashboardRenderer }))
);

const ExcalidrawRendererLazy = lazy(() =>
  import("./ExcalidrawRenderer").then((m) => ({ default: m.ExcalidrawRenderer }))
);

const ReactSandboxLazy = lazy(() =>
  import("./ReactSandbox").then((m) => ({ default: m.ReactSandbox }))
);

interface LazyMermaidRendererProps {
  code: string;
  animated?: boolean;
}

/**
 * Lazy-loaded Mermaid renderer with skeleton fallback
 */
export const LazyMermaidRenderer = memo(function LazyMermaidRenderer({
  code,
  animated = false,
}: LazyMermaidRendererProps): ReactNode {
  return (
    <Suspense fallback={<ChartSkeleton type="mermaid" />}>
      <MermaidRendererLazy code={code} animated={animated} />
    </Suspense>
  );
});

interface LazyEChartsRendererProps {
  spec: EChartsOption;
  animated?: boolean;
}

/**
 * Lazy-loaded ECharts renderer with skeleton fallback
 */
export const LazyEChartsRenderer = memo(function LazyEChartsRenderer({
  spec,
  animated = false,
}: LazyEChartsRendererProps): ReactNode {
  return (
    <Suspense fallback={<ChartSkeleton type="echarts" />}>
      <EChartsRendererLazy spec={spec} animated={animated} />
    </Suspense>
  );
});

// ============ Vega-Lite Renderer ============

interface LazyVegaLiteRendererProps {
  spec: VegaLiteSpec;
  animated?: boolean;
}

/**
 * Lazy-loaded Vega-Lite renderer with skeleton fallback
 */
export const LazyVegaLiteRenderer = memo(function LazyVegaLiteRenderer({
  spec,
}: LazyVegaLiteRendererProps): ReactNode {
  return (
    <Suspense fallback={<ChartSkeleton type="echarts" />}>
      <VegaLiteRendererLazy spec={spec} />
    </Suspense>
  );
});

// ============ Stat Card Skeleton ============

function StatCardSkeleton() {
  return (
    <div className="w-full my-3">
      <div className="flex flex-wrap gap-3">
        {[1, 2, 3].map((i) => (
          <div key={i} className="flex-1 min-w-[140px] rounded-lg border border-border bg-surface-elevated p-4">
            <Skeleton className="h-3 w-16 mb-2" />
            <Skeleton className="h-7 w-24 mb-1" />
            <Skeleton className="h-3 w-12" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ Lazy Stat Card Renderer ============

interface LazyStatCardRendererProps {
  data: StatCardItem[];
}

/**
 * Lazy-loaded Stat Card renderer with skeleton fallback
 */
export const LazyStatCardRenderer = memo(function LazyStatCardRenderer({
  data,
}: LazyStatCardRendererProps): ReactNode {
  return (
    <Suspense fallback={<StatCardSkeleton />}>
      <StatCardLazy data={data} />
    </Suspense>
  );
});

// ============ Lazy Markmap Renderer ============

interface LazyMarkmapRendererProps {
  code: string;
}

/**
 * Lazy-loaded Markmap (interactive mind map) renderer with skeleton fallback
 */
export const LazyMarkmapRenderer = memo(function LazyMarkmapRenderer({
  code,
}: LazyMarkmapRendererProps): ReactNode {
  return (
    <Suspense fallback={<ChartSkeleton type="mermaid" />}>
      <MarkmapRendererLazy code={code} />
    </Suspense>
  );
});

// Re-export the parser functions for immediate use (they are pure functions, no side effects)
export { parseEChartsSpecFromCode } from "../utils/ecSpecParser";
export { parseVegaLiteSpecFromCode } from "../utils/vegaLiteParser";
export { parseStatCardData } from "../utils/statCardParser";
export { parseDashboardSpec } from "../utils/dashboardParser";
export { parseExcalidrawData } from "../utils/excalidrawParser";

// ============ Dashboard Skeleton ============

function DashboardSkeleton() {
  return (
    <div className="w-full my-3">
      <Skeleton className="h-4 w-48 mb-3" />
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-surface-elevated p-4">
            <Skeleton className="h-3 w-20 mb-2" />
            <Skeleton className="h-32 w-full" />
          </div>
        ))}
      </div>
    </div>
  );
}

// ============ Lazy Dashboard Renderer ============

interface LazyDashboardRendererProps {
  spec: DashboardSpec;
}

/**
 * Lazy-loaded Dashboard renderer with skeleton fallback
 */
export const LazyDashboardRenderer = memo(function LazyDashboardRenderer({
  spec,
}: LazyDashboardRendererProps): ReactNode {
  return (
    <Suspense fallback={<DashboardSkeleton />}>
      <DashboardRendererLazy spec={spec} />
    </Suspense>
  );
});

// ============ Excalidraw Skeleton ============

function ExcalidrawSkeleton() {
  return (
    <div className="w-full my-3 rounded-xl ring ring-border overflow-hidden bg-surface-elevated">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
        <Skeleton className="h-3.5 w-3.5" />
        <Skeleton className="h-3 w-28" />
      </div>
      <div className="flex items-center justify-center" style={{ height: 400 }}>
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <Skeleton className="h-3 w-32" />
        </div>
      </div>
    </div>
  );
}

// ============ Lazy Excalidraw Renderer ============

interface LazyExcalidrawRendererProps {
  data: ExcalidrawData;
}

/**
 * Lazy-loaded Excalidraw renderer with skeleton fallback
 */
export const LazyExcalidrawRenderer = memo(function LazyExcalidrawRenderer({
  data,
}: LazyExcalidrawRendererProps): ReactNode {
  return (
    <Suspense fallback={<ExcalidrawSkeleton />}>
      <ExcalidrawRendererLazy data={data} />
    </Suspense>
  );
});

// ============ React Sandbox Skeleton ============

function ReactSandboxSkeleton() {
  return (
    <div className="w-full my-3 rounded-xl ring ring-border overflow-hidden bg-surface-elevated">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-border bg-muted/50">
        <Skeleton className="h-3.5 w-3.5" />
        <Skeleton className="h-3 w-32" />
      </div>
      <div className="flex items-center justify-center" style={{ height: 200 }}>
        <div className="flex flex-col items-center gap-2">
          <div className="h-8 w-8 rounded-full border-2 border-accent border-t-transparent animate-spin" />
          <Skeleton className="h-3 w-36" />
        </div>
      </div>
    </div>
  );
}

// ============ Lazy React Sandbox ============

interface LazyReactSandboxProps {
  code: string;
}

/**
 * Lazy-loaded React component sandbox with skeleton fallback
 */
export const LazyReactSandbox = memo(function LazyReactSandbox({
  code,
}: LazyReactSandboxProps): ReactNode {
  return (
    <Suspense fallback={<ReactSandboxSkeleton />}>
      <ReactSandboxLazy code={code} />
    </Suspense>
  );
});
