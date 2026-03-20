import { useMemo } from "react";
import { WrenchIcon, DatabaseIcon } from "@phosphor-icons/react";

interface McpItemCardProps {
  name: string;
  serverId: string;
  data: Record<string, unknown>;
  serverLabel?: string;
  payloadLabel?: string;
}

export function McpItemCard({
  name,
  serverId,
  data,
  serverLabel = "Server",
  payloadLabel = "Raw payload"
}: McpItemCardProps) {
  // Memoize JSON serialization to avoid recalculation on every render
  const jsonContent = useMemo(() => JSON.stringify(data, null, 2), [data]);

  return (
    <div className="rounded-xl border border-border bg-surface-elevated app-panel rounded-2xl ring ring-border overflow-hidden">
      <div className="px-4 py-3 border-b border-border/80 bg-muted/25">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <WrenchIcon size={16} weight="bold" className="text-accent" />
              <span className="text-sm font-semibold text-foreground">
                {name}
              </span>
            </div>
            <div className="mt-1 flex items-center gap-1 text-foreground-muted">
              <DatabaseIcon size={14} />
              <span className="text-xs text-foreground-muted">
                {serverLabel}
              </span>
            </div>
          </div>
          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-foreground-muted">
            {serverId}
          </span>
        </div>
      </div>
      <div className="px-4 py-3">
        <span className="text-xs text-foreground-muted">
          {payloadLabel}
        </span>
        <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-muted/25 p-3 text-xs whitespace-pre-wrap break-words text-foreground-muted font-mono">
          {jsonContent}
        </pre>
      </div>
    </div>
  );
}
