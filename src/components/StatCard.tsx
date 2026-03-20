import { memo, useMemo } from "react";
import type { StatCardItem } from "../utils/statCardParser";

// ============ Trend Arrow SVGs ============

function TrendArrowUp({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 2L10 7H2L6 2Z" fill="currentColor" />
    </svg>
  );
}

function TrendArrowDown({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M6 10L2 5H10L6 10Z" fill="currentColor" />
    </svg>
  );
}

function TrendNeutral({ className }: { className?: string }) {
  return (
    <svg
      width="12"
      height="12"
      viewBox="0 0 12 12"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <path d="M2 6H10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// ============ Single KPI Card ============

interface SingleStatCardProps {
  item: StatCardItem;
}

const SingleStatCard = memo(function SingleStatCard({ item }: SingleStatCardProps) {
  const trendColor = useMemo(() => {
    switch (item.trend) {
      case "up":
        return "text-emerald-500 dark:text-emerald-400";
      case "down":
        return "text-red-500 dark:text-red-400";
      case "neutral":
      default:
        return "text-foreground-muted";
    }
  }, [item.trend]);

  const TrendIcon = useMemo(() => {
    switch (item.trend) {
      case "up":
        return TrendArrowUp;
      case "down":
        return TrendArrowDown;
      case "neutral":
        return TrendNeutral;
      default:
        return null;
    }
  }, [item.trend]);

  return (
    <div className="flex-1 min-w-[140px] rounded-lg border border-border bg-surface-elevated p-4 transition-colors">
      {/* Title */}
      <p className="text-xs font-medium text-foreground-muted truncate mb-1">
        {item.title}
      </p>
      {/* Value */}
      <p className="text-2xl font-bold text-foreground leading-tight tracking-tight mb-1">
        {item.value}
      </p>
      {/* Change + Trend */}
      {(item.change || item.trend) && (
        <div className={`flex items-center gap-1 ${trendColor}`}>
          {TrendIcon && <TrendIcon className={trendColor} />}
          {item.change && (
            <span className="text-xs font-medium">{item.change}</span>
          )}
        </div>
      )}
    </div>
  );
});

// ============ StatCard Grid ============

export interface StatCardProps {
  data: StatCardItem[];
}

export const StatCard = memo(function StatCard({ data }: StatCardProps) {
  if (!data || data.length === 0) return null;

  return (
    <div
      className="w-full my-3 not-prose"
      role="region"
      aria-label="Key metrics"
    >
      <div className="flex flex-wrap gap-3">
        {data.map((item, index) => (
          <SingleStatCard key={`${item.title}-${index}`} item={item} />
        ))}
      </div>
    </div>
  );
});
