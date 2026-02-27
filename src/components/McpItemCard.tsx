import { useMemo } from "react";
import { Surface, Text, Badge } from "@cloudflare/kumo";

interface McpItemCardProps {
  name: string;
  serverId: string;
  data: Record<string, unknown>;
}

export function McpItemCard({ name, serverId, data }: McpItemCardProps) {
  // Memoize JSON serialization to avoid recalculation on every render
  const jsonContent = useMemo(
    () => JSON.stringify(data, null, 2),
    [data]
  );

  return (
    <Surface className="p-3 rounded-xl ring ring-kumo-line">
      <div className="flex items-center gap-2">
        <Text size="sm" bold>
          {name}
        </Text>
        <Badge variant="secondary">{serverId}</Badge>
      </div>
      <pre className="text-xs mt-1 whitespace-pre-wrap break-words text-kumo-subtle font-mono">
        {jsonContent}
      </pre>
    </Surface>
  );
}
