import { useMemo } from "react";
import { Surface, Text, Badge } from "@cloudflare/kumo";
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
  const jsonContent = useMemo(
    () => JSON.stringify(data, null, 2),
    [data]
  );

  return (
    <Surface className="app-panel rounded-2xl ring ring-kumo-line overflow-hidden">
      <div className="px-4 py-3 border-b border-kumo-line/80 bg-kumo-control/25">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <WrenchIcon size={16} weight="bold" className="text-kumo-accent" />
              <Text size="sm" bold>
                {name}
              </Text>
            </div>
            <div className="mt-1 flex items-center gap-1 text-kumo-subtle">
              <DatabaseIcon size={14} />
              <Text size="xs" variant="secondary">
                {serverLabel}
              </Text>
            </div>
          </div>
          <Badge variant="secondary">{serverId}</Badge>
        </div>
      </div>
      <div className="px-4 py-3">
        <Text size="xs" variant="secondary">
          {payloadLabel}
        </Text>
        <pre className="mt-2 max-h-64 overflow-auto rounded-xl bg-kumo-control/25 p-3 text-xs whitespace-pre-wrap break-words text-kumo-subtle font-mono">
          {jsonContent}
        </pre>
      </div>
    </Surface>
  );
}
