/**
 * Skeleton components for sidebar and MCP panels
 */

import { memo } from "react";
import { Skeleton } from "./MessageSkeleton";

interface SessionListSkeletonProps {
  count?: number;
  animate?: boolean;
}

/**
 * Skeleton for session list in sidebar
 */
export const SessionListSkeleton = memo(function SessionListSkeleton({
  count = 5,
  animate = true,
}: SessionListSkeletonProps) {
  // Vary the widths for session titles
  const titleWidths = ["w-32", "w-40", "w-28", "w-36", "w-24", "w-38", "w-30"];
  const messageWidths = ["w-48", "w-52", "w-44", "w-56", "w-40", "w-50", "w-46"];

  return (
    <div className="flex-1 space-y-2 overflow-y-auto p-2.5" aria-busy="true">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-kumo-line p-2.5 cursor-wait"
        >
          {/* Session title */}
          <div className="flex items-center justify-between mb-1.5">
            <Skeleton
              className={`h-4 ${titleWidths[i % titleWidths.length]}`}
              animate={animate}
            />
            <Skeleton className="h-3 w-10" animate={animate} />
          </div>
          {/* Last message preview */}
          <Skeleton
            className={`h-3 ${messageWidths[i % messageWidths.length]}`}
            animate={animate}
          />
        </div>
      ))}
    </div>
  );
});

interface McpPaneSkeletonProps {
  count?: number;
  animate?: boolean;
}

/**
 * Skeleton for MCP tools/resources panel
 */
export const McpPaneSkeleton = memo(function McpPaneSkeleton({
  count = 4,
  animate = true,
}: McpPaneSkeletonProps) {
  const nameWidths = ["w-24", "w-32", "w-28", "w-20", "w-36", "w-26"];
  const descWidths = ["w-48", "w-40", "w-52", "w-44", "w-36", "w-50"];

  return (
    <div className="space-y-2 p-2" aria-busy="true">
      {/* Server status header */}
      <div className="flex items-center justify-between px-2 py-1">
        <div className="flex items-center gap-2">
          <Skeleton className="h-3 w-3 rounded-full" animate={animate} />
          <Skeleton className="h-4 w-20" animate={animate} />
        </div>
        <Skeleton className="h-4 w-12 rounded" animate={animate} />
      </div>

      {/* Tool/Resource items */}
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="rounded-lg border border-kumo-line/60 p-2.5"
        >
          <div className="flex items-center gap-2 mb-1.5">
            <Skeleton className="h-4 w-4 rounded" animate={animate} />
            <Skeleton
              className={`h-4 ${nameWidths[i % nameWidths.length]}`}
              animate={animate}
            />
          </div>
          <Skeleton
            className={`h-3 ${descWidths[i % descWidths.length]}`}
            animate={animate}
          />
        </div>
      ))}
    </div>
  );
});

interface SidebarSkeletonProps {
  animate?: boolean;
}

/**
 * Full sidebar skeleton including header and sections
 */
export const SidebarSkeleton = memo(function SidebarSkeleton({
  animate = true,
}: SidebarSkeletonProps) {
  return (
    <aside className="w-72 flex flex-col border-r border-kumo-line bg-kumo-base/95 overflow-hidden shrink-0">
      {/* Header */}
      <div className="space-y-3 border-b border-kumo-line/80 bg-kumo-base/60 p-3">
        <Skeleton className="h-4 w-20" animate={animate} />
        {/* Section tabs */}
        <div className="grid grid-cols-2 gap-1.5">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton
              key={i}
              className="h-8 rounded-lg"
              animate={animate}
            />
          ))}
        </div>
        {/* New session button */}
        <Skeleton className="h-9 w-full rounded-lg" animate={animate} />
      </div>
      {/* Session list */}
      <SessionListSkeleton count={5} animate={animate} />
    </aside>
  );
});
