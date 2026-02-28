import { Badge, Surface, Text } from "@cloudflare/kumo";

interface ProgressEntry {
  id: string;
  phase: string;
  message: string;
  timestamp: string;
}

interface InspectorPaneProps {
  toolsCount: number;
  sourcesCount: number;
  liveProgress: ProgressEntry[];
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

export function InspectorPane({ toolsCount, sourcesCount, liveProgress, t }: InspectorPaneProps) {
  const latest = liveProgress.slice(-4).reverse();

  return (
    <aside className="hidden w-80 shrink-0 border-l border-kumo-line/80 bg-kumo-base/65 p-3 xl:block">
      <div className="space-y-3">
        <Surface className="app-panel-soft rounded-xl p-3 ring ring-kumo-line">
          <Text size="sm" bold>{t("inspector_overview")}</Text>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="primary">{t("tabs_tools_count", { count: String(toolsCount) })}</Badge>
            <Badge variant="secondary">{t("inspector_sources", { count: String(sourcesCount) })}</Badge>
          </div>
        </Surface>

        <Surface className="app-panel-soft rounded-xl p-3 ring ring-kumo-line">
          <Text size="sm" bold>{t("inspector_live")}</Text>
          <div className="mt-2 space-y-1.5">
            {latest.length === 0 ? (
              <Text size="xs" variant="secondary">{t("inspector_live_empty")}</Text>
            ) : (
              latest.map((entry) => (
                <div key={entry.id} className="rounded-lg border border-kumo-line bg-kumo-base/70 px-2 py-1.5">
                  <Text size="xs" bold>{entry.phase}</Text>
                  <span className="block">
                    <Text size="xs" variant="secondary">{entry.message}</Text>
                  </span>
                </div>
              ))
            )}
          </div>
        </Surface>
      </div>
    </aside>
  );
}
