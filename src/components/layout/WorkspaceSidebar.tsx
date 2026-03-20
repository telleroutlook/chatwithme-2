import { useState } from "react";
import {
  ChatCircleDotsIcon,
  PlusIcon,
  TrashIcon,
  WrenchIcon,
  FolderOpenIcon,
  GearSixIcon,
  XIcon,
  GlobeHemisphereWestIcon,
  CaretRightIcon
} from "@phosphor-icons/react";
import { useResponsive } from "../../hooks/useResponsive";
import type { UiLang } from "../../i18n/ui";
import { confirm } from "../modal";
import { cn } from "../ui/utils";

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
  onDeleteSession: (sessionId: string) => Promise<void> | void;
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

// ---------------------------------------------------------------------------
// Inline micro-components (no kumo dependencies)
// ---------------------------------------------------------------------------

function SmallBadge({
  children,
  variant = "secondary"
}: {
  children: React.ReactNode;
  variant?: "primary" | "secondary" | "danger";
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium leading-none",
        variant === "primary" && "bg-white/10 text-white/70",
        variant === "secondary" && "bg-white/8 text-sidebar-text-muted",
        variant === "danger" && "bg-red-500/20 text-red-400"
      )}
    >
      {children}
    </span>
  );
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

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
  const [deletingSessionId, setDeletingSessionId] = useState<string | null>(null);
  const [bottomOpen, setBottomOpen] = useState(false);
  const { touch } = useResponsive();

  const isTouchDevice = mobile || touch;

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

  // Determine which main content panel to render
  const isSettings = section === "settings";
  const isTools = section === "tools";
  const isResources = section === "resources";
  const isChats = section === "chats";

  return (
    <>
      {/* Mobile overlay backdrop */}
      {mobile && sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      <aside
        className={cn(
          // Base styles
          "flex flex-col overflow-hidden shrink-0",
          // Dark sidebar background — semantic token, falls back to literal
          "bg-sidebar border-r border-white/[0.06]",
          // Mobile: slide-in overlay
          mobile
            ? cn(
                "fixed inset-y-0 left-0 z-50 w-[260px]",
                "transform transition-transform duration-300 ease-in-out",
                sidebarOpen ? "translate-x-0" : "-translate-x-full"
              )
            : cn(
                "transition-all duration-300",
                sidebarOpen ? "w-[260px]" : "w-0"
              )
        )}
        // Fallback inline style for the #171717 bg in case CSS var is not set
        style={{ backgroundColor: "var(--sidebar, #171717)" }}
      >
        {/* ----------------------------------------------------------------
            TOP HEADER
        ---------------------------------------------------------------- */}
        <div className="flex items-center justify-between px-3 pt-4 pb-2">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-sidebar-text-muted select-none"
            style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}>
            {t("sidebar_workspace")}
          </span>
          {mobile && (
            <button
              type="button"
              onClick={onClose}
              className={cn(
                "flex items-center justify-center rounded-md transition-colors",
                "text-sidebar-text-muted hover:text-white hover:bg-white/8",
                isTouchDevice ? "min-h-[44px] min-w-[44px]" : "h-7 w-7"
              )}
              style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}
              aria-label={t("sidebar_close")}
            >
              <XIcon size={16} />
            </button>
          )}
        </div>

        {/* ----------------------------------------------------------------
            NEW CHAT BUTTON
        ---------------------------------------------------------------- */}
        <div className="px-3 pb-3">
          <button
            type="button"
            onClick={() => {
              onSectionChange("chats");
              onNewSession();
            }}
            className={cn(
              "flex w-full items-center justify-center gap-2 rounded-lg border border-white/20",
              "text-sm font-medium text-white/90",
              "transition-colors hover:bg-white/8 active:scale-[0.98]",
              isTouchDevice ? "h-11" : "h-9"
            )}
          >
            <PlusIcon size={16} weight="bold" />
            {t("session_new")}
          </button>
        </div>

        {/* ----------------------------------------------------------------
            SESSION LIST — scrollable middle area
        ---------------------------------------------------------------- */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden px-2 pb-2">
          {/* Sessions heading */}
          <p
            className="mb-1 px-2 text-[11px] font-semibold uppercase tracking-widest select-none"
            style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}
          >
            {t("sidebar_domain_chats")}
          </p>

          {sessions.length === 0 ? (
            <div className="flex flex-col items-center py-10 opacity-40">
              <ChatCircleDotsIcon size={28} className="mb-2 text-white" />
              <span className="text-xs" style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}>
                {t("session_empty")}
              </span>
            </div>
          ) : (
            <ul className="space-y-0.5">
              {sessions.map((session) => {
                const isActive = currentSessionId === session.id;
                const isDeleting = deletingSessionId === session.id;

                return (
                  <li key={session.id}>
                    <div
                      role="button"
                      tabIndex={0}
                      aria-current={isActive ? "page" : undefined}
                      onClick={() => onSelectSession(session.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSelectSession(session.id);
                        }
                      }}
                      className={cn(
                        "group relative flex w-full cursor-pointer items-center rounded-lg px-2 transition-colors",
                        isTouchDevice ? "min-h-[52px] py-2.5" : "py-2",
                        isActive
                          ? "bg-sidebar-active"
                          : "hover:bg-sidebar-hover",
                        // Inline fallbacks
                      )}
                      style={{
                        backgroundColor: isActive
                          ? "var(--sidebar-active, #2a2a2a)"
                          : undefined
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLDivElement).style.backgroundColor =
                            "var(--sidebar-hover, #212121)";
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          (e.currentTarget as HTMLDivElement).style.backgroundColor = "";
                        }
                      }}
                    >
                      {/* Active indicator bar */}
                      {isActive && (
                        <span
                          className="absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-white/70"
                          aria-hidden="true"
                        />
                      )}

                      <div className="min-w-0 flex-1 pl-1">
                        <p
                          className={cn(
                            "truncate text-sm leading-tight",
                            isActive ? "font-medium text-white" : "text-white/80"
                          )}
                        >
                          {session.title}
                        </p>
                        <p
                          className="mt-0.5 truncate text-xs leading-tight"
                          style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}
                        >
                          {formatTime(session.timestamp)}
                        </p>
                      </div>

                      {/* Delete button — visible on hover (always visible on touch) */}
                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={async (e) => {
                          e.stopPropagation();
                          const confirmed = await confirm({
                            title: t("session_delete_confirm_title"),
                            content: t("session_delete_confirm_message"),
                            okText: t("session_delete_confirm_ok"),
                            cancelText: t("session_delete_confirm_cancel"),
                            danger: true
                          });
                          if (!confirmed) return;
                          setDeletingSessionId(session.id);
                          try {
                            await onDeleteSession(session.id);
                          } finally {
                            setDeletingSessionId((prev) =>
                              prev === session.id ? null : prev
                            );
                          }
                        }}
                        className={cn(
                          "ml-1 flex shrink-0 items-center justify-center rounded-md transition-all",
                          "text-white/30 hover:bg-red-500/20 hover:text-red-400",
                          "focus-visible:opacity-100 disabled:cursor-not-allowed",
                          isTouchDevice
                            ? "min-h-[44px] min-w-[44px] opacity-100"
                            : "h-6 w-6 opacity-0 group-hover:opacity-100",
                          isDeleting && "opacity-50"
                        )}
                        aria-label={t("session_delete")}
                      >
                        <TrashIcon size={13} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {/* ----------------------------------------------------------------
            BOTTOM COLLAPSED SECTION — tools / resources / settings
        ---------------------------------------------------------------- */}
        <div
          className="shrink-0 border-t px-2 py-2"
          style={{ borderColor: "var(--sidebar-border, rgba(255,255,255,0.06))" }}
        >
          {/* Collapsed toggle row */}
          <button
            type="button"
            onClick={() => setBottomOpen((v) => !v)}
            className={cn(
              "flex w-full items-center gap-2 rounded-lg px-2 transition-colors",
              "text-xs hover:bg-white/8",
              isTouchDevice ? "min-h-[44px]" : "h-9"
            )}
            style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}
            aria-expanded={bottomOpen}
          >
            <GearSixIcon size={15} />
            <span className="flex-1 text-left font-medium">
              {t("sidebar_domain_settings")}
            </span>
            <CaretRightIcon
              size={12}
              className={cn(
                "transition-transform duration-200",
                bottomOpen && "rotate-90"
              )}
            />
          </button>

          {/* Expanded section */}
          {bottomOpen && (
            <div className="mt-1 space-y-0.5 pb-1">
              {/* Tools */}
              <button
                type="button"
                onClick={() => onSectionChange("tools")}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 text-xs transition-colors",
                  isTouchDevice ? "min-h-[44px]" : "h-8",
                  isTools
                    ? "bg-sidebar-active text-white"
                    : "text-white/60 hover:bg-white/8 hover:text-white/90"
                )}
                style={isTools ? { backgroundColor: "var(--sidebar-active, #2a2a2a)" } : {}}
              >
                <WrenchIcon size={14} />
                <span className="flex-1 text-left">{t("sidebar_domain_tools")}</span>
                {toolsCount > 0 && (
                  <SmallBadge variant="primary">{toolsCount}</SmallBadge>
                )}
              </button>

              {/* Resources */}
              <button
                type="button"
                onClick={() => onSectionChange("resources")}
                className={cn(
                  "flex w-full items-center gap-2 rounded-lg px-2 text-xs transition-colors",
                  isTouchDevice ? "min-h-[44px]" : "h-8",
                  isResources
                    ? "bg-sidebar-active text-white"
                    : "text-white/60 hover:bg-white/8 hover:text-white/90"
                )}
                style={isResources ? { backgroundColor: "var(--sidebar-active, #2a2a2a)" } : {}}
              >
                <FolderOpenIcon size={14} />
                <span className="flex-1 text-left">{t("sidebar_domain_resources")}</span>
                {resourcesCount > 0 && (
                  <SmallBadge variant="primary">{resourcesCount}</SmallBadge>
                )}
              </button>

              {/* Language */}
              <div
                className="rounded-lg px-2 py-2"
                style={{ backgroundColor: "var(--sidebar-hover, #212121)" }}
              >
                <p
                  className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider"
                  style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}
                >
                  <GlobeHemisphereWestIcon size={12} />
                  {t("lang_group")}
                </p>
                <div className="flex gap-1">
                  {langOptions.map((option) => {
                    const active = option.value === lang;
                    return (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setLang(option.value)}
                        aria-pressed={active}
                        className={cn(
                          "flex-1 rounded-md px-2 py-1 text-xs font-medium transition-colors active:scale-[0.98]",
                          active
                            ? "bg-white/15 text-white"
                            : "text-white/50 hover:bg-white/8 hover:text-white/80"
                        )}
                      >
                        {option.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Observability */}
              <details className="rounded-lg">
                <summary
                  className={cn(
                    "flex cursor-pointer select-none items-center gap-2 rounded-lg px-2 text-xs",
                    "text-white/60 hover:bg-white/8 hover:text-white/90 transition-colors list-none",
                    isTouchDevice ? "min-h-[44px]" : "h-8"
                  )}
                >
                  <span className="flex-1">{t("settings_panel_observability")}</span>
                  {observabilityEventCount > 0 && (
                    <SmallBadge variant="primary">{observabilityEventCount}</SmallBadge>
                  )}
                </summary>

                <div
                  className="mt-1 space-y-1 rounded-lg p-2 text-xs"
                  style={{ backgroundColor: "var(--sidebar-hover, #212121)" }}
                >
                  {hasTools || hasSourceGroups ? (
                    <div className="space-y-1">
                      <p
                        className="font-semibold"
                        style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}
                      >
                        {t("inspector_overview")}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        {hasTools && (
                          <SmallBadge variant="primary">
                            {t("tabs_tools_count", {
                              count: String(observability.toolsCount)
                            })}
                          </SmallBadge>
                        )}
                        {hasSourceGroups && (
                          <SmallBadge variant="secondary">
                            {t("inspector_sources", {
                              count: String(observability.sourcesCount)
                            })}
                          </SmallBadge>
                        )}
                      </div>
                    </div>
                  ) : null}

                  {hasLiveEvents ? (
                    <div className="space-y-1">
                      <p
                        className="font-semibold"
                        style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}
                      >
                        {t("inspector_live")}
                      </p>
                      {observability.liveProgress
                        .slice(-4)
                        .reverse()
                        .map((entry) => (
                          <div
                            key={entry.id}
                            className="rounded border border-white/8 px-2 py-1"
                            style={{ backgroundColor: "var(--sidebar, #171717)" }}
                          >
                            <p className="font-medium text-white/80">{entry.phase}</p>
                            <p style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}>
                              {entry.message}
                            </p>
                          </div>
                        ))}
                    </div>
                  ) : null}

                  {hasTelemetryEvents ? (
                    <div className="space-y-1">
                      <p
                        className="font-semibold"
                        style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}
                      >
                        {t("inspector_telemetry")}
                      </p>
                      <div className="flex flex-wrap gap-1">
                        <SmallBadge variant="secondary">
                          {t("inspector_telemetry_events", {
                            count: String(observability.telemetrySummary.totalEvents)
                          })}
                        </SmallBadge>
                        {Object.entries(observability.telemetrySummary.eventCounts)
                          .slice(0, 3)
                          .map(([name, count]) => (
                            <SmallBadge key={name} variant="secondary">
                              {name}: {count}
                            </SmallBadge>
                          ))}
                      </div>
                      <div className="space-y-1">
                        {observability.telemetry.slice(0, 4).map((item) => (
                          <div
                            key={item.id}
                            className="rounded border border-white/8 px-2 py-1"
                            style={{ backgroundColor: "var(--sidebar, #171717)" }}
                          >
                            <p className="font-medium text-white/80">{item.name}</p>
                            <p style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}>
                              {new Date(item.timestamp).toLocaleTimeString()}
                            </p>
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : null}

                  {!hasTools &&
                    !hasSourceGroups &&
                    !hasLiveEvents &&
                    !hasTelemetryEvents && (
                      <p
                        className="py-2 text-center"
                        style={{ color: "var(--sidebar-text-muted, #8e8ea0)" }}
                      >
                        {t("sidebar_coming_soon_desc")}
                      </p>
                    )}
                </div>
              </details>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
