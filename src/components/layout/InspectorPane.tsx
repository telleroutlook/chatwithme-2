import { Badge, Surface, Text } from "@cloudflare/kumo";

interface ProgressEntry {
  id: string;
  phase: string;
  message: string;
  timestamp: string;
}

interface TelemetryEntry {
  id: string;
  name: string;
  timestamp: string;
}

interface InspectorPaneProps {
  toolsCount: number;
  sourcesCount: number;
  liveProgress: ProgressEntry[];
  telemetry: TelemetryEntry[];
  telemetrySummary: { totalEvents: number; eventCounts: Record<string, number> };
  eventLogs: Array<{
    id: string;
    timestamp: string;
    source: string;
    level: "info" | "success" | "error";
    type: string;
    message: string;
  }>;
  pendingApprovals: Array<{
    id: string;
    toolName: string;
    argsSnippet: string;
    createdAt: string;
  }>;
  onApproveToolCall: (approvalId: string) => void;
  onRejectToolCall: (approvalId: string) => void;
  onClearEventLogs: () => void;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

export function InspectorPane({
  toolsCount,
  sourcesCount,
  liveProgress,
  telemetry,
  telemetrySummary,
  eventLogs,
  pendingApprovals,
  onApproveToolCall,
  onRejectToolCall,
  onClearEventLogs,
  t
}: InspectorPaneProps) {
  const latest = liveProgress.slice(-4).reverse();

  return (
    <aside className="hidden w-80 shrink-0 border-l border-kumo-line/80 bg-kumo-base/65 p-3 xl:block">
      <div className="space-y-3">
        <Surface className="app-panel-soft rounded-xl p-3 ring ring-kumo-line">
          <Text size="sm" bold>
            {t("inspector_overview")}
          </Text>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="primary">{t("tabs_tools_count", { count: String(toolsCount) })}</Badge>
            <Badge variant="secondary">
              {t("inspector_sources", { count: String(sourcesCount) })}
            </Badge>
          </div>
        </Surface>

        <Surface className="app-panel-soft rounded-xl p-3 ring ring-kumo-line">
          <Text size="sm" bold>
            {t("inspector_live")}
          </Text>
          <div className="mt-2 space-y-1.5">
            {latest.length === 0 ? (
              <Text size="xs" variant="secondary">
                {t("inspector_live_empty")}
              </Text>
            ) : (
              latest.map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-kumo-line bg-kumo-base/70 px-2 py-1.5"
                >
                  <Text size="xs" bold>
                    {entry.phase}
                  </Text>
                  <span className="block">
                    <Text size="xs" variant="secondary">
                      {entry.message}
                    </Text>
                  </span>
                </div>
              ))
            )}
          </div>
        </Surface>

        <Surface className="app-panel-soft rounded-xl p-3 ring ring-kumo-line">
          <Text size="sm" bold>
            {t("inspector_telemetry")}
          </Text>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge variant="secondary">
              {t("inspector_telemetry_events", {
                count: String(telemetrySummary.totalEvents)
              })}
            </Badge>
            {Object.entries(telemetrySummary.eventCounts)
              .slice(0, 3)
              .map(([name, count]) => (
                <Badge key={name} variant="secondary">
                  {name}: {count}
                </Badge>
              ))}
          </div>
          <div className="mt-2 space-y-1.5">
            {telemetry.length === 0 ? (
              <Text size="xs" variant="secondary">
                {t("inspector_telemetry_empty")}
              </Text>
            ) : (
              telemetry.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-kumo-line bg-kumo-base/70 px-2 py-1.5"
                >
                  <Text size="xs" bold>
                    {item.name}
                  </Text>
                  <span className="block">
                    <Text size="xs" variant="secondary">
                      {new Date(item.timestamp).toLocaleTimeString()}
                    </Text>
                  </span>
                </div>
              ))
            )}
          </div>
        </Surface>

        <Surface className="app-panel-soft rounded-xl p-3 ring ring-kumo-line">
          <Text size="sm" bold>
            {t("inspector_approvals")}
          </Text>
          <div className="mt-2 space-y-1.5">
            {pendingApprovals.length === 0 ? (
              <Text size="xs" variant="secondary">
                {t("inspector_approvals_empty")}
              </Text>
            ) : (
              pendingApprovals.slice(0, 4).map((item) => (
                <div
                  key={item.id}
                  className="rounded-lg border border-kumo-line bg-kumo-base/70 px-2 py-1.5"
                >
                  <Text size="xs" bold>
                    {item.toolName}
                  </Text>
                  <span className="block">
                    <Text size="xs" variant="secondary">
                      {item.argsSnippet}
                    </Text>
                  </span>
                  <div className="mt-1 flex gap-1">
                    <button
                      type="button"
                      onClick={() => onApproveToolCall(item.id)}
                      className="rounded border border-kumo-line px-2 py-0.5 text-[11px] text-kumo-subtle hover:bg-kumo-control"
                    >
                      {t("inspector_approvals_approve")}
                    </button>
                    <button
                      type="button"
                      onClick={() => onRejectToolCall(item.id)}
                      className="rounded border border-kumo-line px-2 py-0.5 text-[11px] text-kumo-subtle hover:bg-kumo-control"
                    >
                      {t("inspector_approvals_reject")}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </Surface>

        <Surface className="app-panel-soft rounded-xl p-3 ring ring-kumo-line">
          <div className="flex items-center justify-between">
            <Text size="sm" bold>
              {t("inspector_event_log")}
            </Text>
            <button
              type="button"
              onClick={onClearEventLogs}
              className="rounded border border-kumo-line px-2 py-0.5 text-[11px] text-kumo-subtle hover:bg-kumo-control"
            >
              {t("inspector_event_log_clear")}
            </button>
          </div>
          <div className="mt-2 space-y-1.5">
            {eventLogs.length === 0 ? (
              <Text size="xs" variant="secondary">
                {t("inspector_event_log_empty")}
              </Text>
            ) : (
              eventLogs.slice(0, 6).map((entry) => (
                <div
                  key={entry.id}
                  className="rounded-lg border border-kumo-line bg-kumo-base/70 px-2 py-1.5"
                >
                  <div className="flex items-center justify-between gap-2">
                    <Text size="xs" bold>
                      {entry.type}
                    </Text>
                    <Badge variant={entry.level === "error" ? "secondary" : "primary"}>
                      {entry.source}
                    </Badge>
                  </div>
                  <span className="block">
                    <Text size="xs" variant="secondary">
                      {entry.message}
                    </Text>
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
