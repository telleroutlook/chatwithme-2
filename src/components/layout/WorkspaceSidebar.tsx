import { Badge, Button, Text } from "@cloudflare/kumo";
import {
  ChatCircleDotsIcon,
  PlusIcon,
  TrashIcon,
  WrenchIcon,
  FolderOpenIcon,
  GearSixIcon,
  XIcon,
  GlobeHemisphereWestIcon
} from "@phosphor-icons/react";
import type { UiLang } from "../../i18n/ui";

export type WorkspaceSection = "chats" | "tools" | "resources" | "settings";

interface SessionMeta {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: string;
  messageCount: number;
}

interface WorkspaceSidebarProps {
  mobile: boolean;
  sidebarOpen: boolean;
  sessions: SessionMeta[];
  currentSessionId: string;
  section: WorkspaceSection;
  onSectionChange: (section: WorkspaceSection) => void;
  onClose: () => void;
  onNewSession: () => void;
  onSelectSession: (sessionId: string) => void;
  onDeleteSession: (sessionId: string) => void;
  formatTime: (timestamp: string) => string;
  toolsCount: number;
  resourcesCount: number;
  observability: {
    toolsCount: number;
    sourcesCount: number;
    liveProgress: Array<{
      id: string;
      phase: string;
      message: string;
    }>;
    telemetry: Array<{
      id: string;
      name: string;
      timestamp: string;
    }>;
    telemetrySummary: { totalEvents: number; eventCounts: Record<string, number> };
  };
  lang: UiLang;
  setLang: (lang: UiLang) => void;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

export function WorkspaceSidebar({
  mobile,
  sidebarOpen,
  sessions,
  currentSessionId,
  section,
  onSectionChange,
  onClose,
  onNewSession,
  onSelectSession,
  onDeleteSession,
  formatTime,
  toolsCount,
  resourcesCount,
  observability,
  lang,
  setLang,
  t
}: WorkspaceSidebarProps) {
  const sections: Array<{
    id: WorkspaceSection;
    label: string;
    icon: React.ReactNode;
    count?: number;
  }> = [
    { id: "chats", label: t("sidebar_domain_chats"), icon: <ChatCircleDotsIcon size={14} /> },
    {
      id: "tools",
      label: t("sidebar_domain_tools"),
      icon: <WrenchIcon size={14} />,
      count: toolsCount
    },
    {
      id: "resources",
      label: t("sidebar_domain_resources"),
      icon: <FolderOpenIcon size={14} />,
      count: resourcesCount
    },
    { id: "settings", label: t("sidebar_domain_settings"), icon: <GearSixIcon size={14} /> }
  ];

  const langOptions: Array<{ value: UiLang; label: string }> = [
    { value: "en", label: t("lang_en") },
    { value: "zh", label: t("lang_zh") }
  ];
  const hasLiveEvents = observability.liveProgress.length > 0;
  const hasTelemetryEvents =
    observability.telemetrySummary.totalEvents > 0 || observability.telemetry.length > 0;
  const hasSourceGroups = observability.sourcesCount > 0;
  const hasTools = observability.toolsCount > 0;
  const observabilityEventCount =
    observability.liveProgress.length + observability.telemetrySummary.totalEvents;

  return (
    <aside
      className={`
        ${
          mobile
            ? `fixed inset-y-0 left-0 z-50 w-72 transform transition-transform duration-300 ease-in-out ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`
            : `${sidebarOpen ? "w-72" : "w-0"} transition-all duration-300`
        }
        app-panel flex flex-col border-r border-kumo-line bg-kumo-base/95 app-glass overflow-hidden shrink-0
      `}
    >
      <div className="space-y-3 border-b border-kumo-line/80 bg-kumo-base/60 p-3">
        <div className="flex items-center justify-between">
          <Text size="xs" variant="secondary">
            {t("sidebar_workspace")}
          </Text>
          {mobile && (
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 transition-colors hover:bg-kumo-control focus-visible:outline-none"
              aria-label={t("sidebar_close")}
            >
              <XIcon size={20} className="text-kumo-subtle" />
            </button>
          )}
        </div>

        <div className="grid grid-cols-2 gap-1.5">
          {sections.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onSectionChange(item.id)}
              className={`flex items-center justify-between rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                section === item.id
                  ? "border-kumo-accent bg-kumo-accent/12 text-kumo-accent"
                  : "border-kumo-line text-kumo-subtle hover:bg-kumo-control"
              }`}
            >
              <span className="inline-flex items-center gap-1.5">
                {item.icon}
                {item.label}
              </span>
              {typeof item.count === "number" && item.count > 0 ? (
                <span className="rounded-full bg-kumo-control px-1.5 py-0.5 text-[10px]">
                  {item.count}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {section === "chats" && (
          <Button
            variant="primary"
            className="w-full justify-center text-white hover:text-white"
            style={{ color: "#fff" }}
            icon={<PlusIcon size={16} />}
            onClick={onNewSession}
          >
            {t("session_new")}
          </Button>
        )}
      </div>

      {section === "chats" ? (
        <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
          {sessions.length === 0 ? (
            <div className="py-8 text-center text-kumo-subtle">
              <ChatCircleDotsIcon size={32} className="mx-auto mb-2 opacity-50" />
              <Text size="xs">{t("session_empty")}</Text>
            </div>
          ) : (
            sessions.map((session) => (
              <div
                key={session.id}
                onClick={() => onSelectSession(session.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectSession(session.id);
                  }
                }}
                role="button"
                tabIndex={0}
                aria-current={currentSessionId === session.id ? "page" : undefined}
                className={`group w-full rounded-xl p-3 text-left transition-all duration-200 ${
                  currentSessionId === session.id
                    ? "bg-kumo-accent/10 ring-1 ring-kumo-accent shadow-[var(--app-shadow-soft)]"
                    : "ring-1 ring-transparent hover:bg-kumo-control/75 hover:ring-kumo-line"
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0 flex-1">
                    <span className="block truncate">
                      <Text size="sm" bold={currentSessionId === session.id}>
                        {session.title}
                      </Text>
                    </span>
                    <span className="mt-0.5 block truncate">
                      <Text size="xs" variant="secondary">
                        {session.lastMessage || t("session_no_messages")}
                      </Text>
                    </span>
                    <div className="mt-1 flex items-center gap-2">
                      <Text size="xs" variant="secondary">
                        {formatTime(session.timestamp)}
                      </Text>
                      {session.messageCount > 0 && (
                        <Badge variant="secondary" className="text-xs">
                          {session.messageCount}
                        </Badge>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    className="rounded p-1 text-kumo-subtle opacity-0 transition-all hover:bg-kumo-danger/20 hover:text-kumo-danger group-hover:opacity-100 focus-visible:opacity-100"
                    aria-label={t("session_delete")}
                  >
                    <TrashIcon size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : section === "settings" ? (
        <div className="flex-1 space-y-2 overflow-y-auto p-2.5">
          <div className="rounded-xl border border-kumo-line bg-kumo-control/50 p-3">
            <Text size="sm" bold>
              {t("lang_group")}
            </Text>
            <div className="mt-2 space-y-1">
              {langOptions.map((option) => {
                const active = option.value === lang;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setLang(option.value)}
                    className={`flex w-full items-center rounded-lg border px-2 py-1.5 text-left text-xs transition-colors ${
                      active
                        ? "border-kumo-accent bg-kumo-accent/12 text-kumo-accent"
                        : "border-kumo-line text-kumo-subtle hover:bg-kumo-control"
                    }`}
                    aria-pressed={active}
                  >
                    <span className="inline-flex items-center gap-1.5">
                      <GlobeHemisphereWestIcon size={14} />
                      {option.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="rounded-xl border border-kumo-line bg-kumo-control/50 p-3">
            <Text size="sm" bold>
              {t("settings_section_advanced")}
            </Text>
            <Text size="xs" variant="secondary">
              {t("settings_section_advanced_desc")}
            </Text>

            <details className="mt-2 rounded-lg border border-kumo-line bg-kumo-base/60 p-2">
              <summary className="flex cursor-pointer items-center justify-between text-xs font-medium text-kumo-default">
                <span>{t("settings_panel_observability")}</span>
                {observabilityEventCount > 0 ? (
                  <Badge variant="primary">{observabilityEventCount}</Badge>
                ) : null}
              </summary>
              <div className="mt-2 space-y-2">
                {hasTools || hasSourceGroups ? (
                  <div className="rounded-lg border border-kumo-line bg-kumo-base/70 p-2">
                    <Text size="xs" bold>
                      {t("inspector_overview")}
                    </Text>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {hasTools ? (
                        <Badge variant="primary">
                          {t("tabs_tools_count", { count: String(observability.toolsCount) })}
                        </Badge>
                      ) : null}
                      {hasSourceGroups ? (
                        <Badge variant="secondary">
                          {t("inspector_sources", { count: String(observability.sourcesCount) })}
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {hasLiveEvents ? (
                  <div className="rounded-lg border border-kumo-line bg-kumo-base/70 p-2">
                    <Text size="xs" bold>
                      {t("inspector_live")}
                    </Text>
                    <div className="mt-1 space-y-1">
                      {observability.liveProgress
                        .slice(-4)
                        .reverse()
                        .map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded border border-kumo-line bg-kumo-base/70 px-2 py-1"
                          >
                            <Text size="xs" bold>
                              {entry.phase}
                            </Text>
                            <Text size="xs" variant="secondary">
                              {entry.message}
                            </Text>
                          </div>
                        ))}
                    </div>
                  </div>
                ) : null}

                {hasTelemetryEvents ? (
                  <div className="rounded-lg border border-kumo-line bg-kumo-base/70 p-2">
                    <Text size="xs" bold>
                      {t("inspector_telemetry")}
                    </Text>
                    <div className="mt-1 flex flex-wrap gap-2">
                      <Badge variant="secondary">
                        {t("inspector_telemetry_events", {
                          count: String(observability.telemetrySummary.totalEvents)
                        })}
                      </Badge>
                      {Object.entries(observability.telemetrySummary.eventCounts)
                        .slice(0, 3)
                        .map(([name, count]) => (
                          <Badge key={name} variant="secondary">
                            {name}: {count}
                          </Badge>
                        ))}
                    </div>
                    <div className="mt-1 space-y-1">
                      {observability.telemetry.slice(0, 4).map((item) => (
                        <div
                          key={item.id}
                          className="rounded border border-kumo-line bg-kumo-base/70 px-2 py-1"
                        >
                          <Text size="xs" bold>
                            {item.name}
                          </Text>
                          <Text size="xs" variant="secondary">
                            {new Date(item.timestamp).toLocaleTimeString()}
                          </Text>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            </details>
          </div>
        </div>
      ) : (
        <div className="flex-1 p-3">
          <div className="rounded-xl border border-kumo-line bg-kumo-control/50 p-3">
            <Text size="sm" bold>
              {t("sidebar_coming_soon_title")}
            </Text>
            <span className="mt-1 block">
              <Text size="xs" variant="secondary">
                {t("sidebar_coming_soon_desc")}
              </Text>
            </span>
          </div>
        </div>
      )}
    </aside>
  );
}
