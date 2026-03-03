import { Text } from "@cloudflare/kumo";
import {
  DownloadSimpleIcon,
  ListIcon,
  MoonIcon,
  PlusIcon,
  PlugsConnectedIcon,
  SunIcon
} from "@phosphor-icons/react";
import { ConnectionIndicator, type ConnectionStatus, useThemeMode } from "../AgentsUiCompat";
import { useResponsive } from "../../hooks/useResponsive";

interface TopBarProps {
  mobile: boolean;
  onToggleSidebar: () => void;
  onNewSession: () => void;
  onExportAllMarkdown: () => void;
  disableExportAllMarkdown?: boolean;
  connectionStatus: ConnectionStatus;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

export function TopBar({
  mobile,
  onToggleSidebar,
  onNewSession,
  onExportAllMarkdown,
  disableExportAllMarkdown = false,
  connectionStatus,
  t
}: TopBarProps) {
  const { mode, setMode } = useThemeMode();
  const { touch } = useResponsive();
  const resolvedMode =
    mode === "system" ? (document.documentElement.getAttribute("data-mode") ?? "light") : mode;
  const isDark = resolvedMode === "dark";

  // Apply touch feedback on mobile or touch devices
  const isTouchDevice = mobile || touch;

  const handleToggleTheme = () => {
    setMode(isDark ? "light" : "dark");
  };

  return (
    <header
      className="app-glass border-b border-kumo-line/80 bg-kumo-base/70 px-3 py-3 sm:px-5"
      style={{
        paddingTop: mobile ? "calc(0.75rem + var(--safe-area-inset-top))" : undefined
      }}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className={`rounded-lg p-2 transition-colors hover:bg-kumo-control focus-visible:outline-none ${
              isTouchDevice ? "active:scale-95" : ""
            }`}
            style={{ minHeight: 44, minWidth: 44 }}
            aria-label={mobile ? t("sidebar_open") : t("sidebar_toggle")}
          >
            <ListIcon size={20} className="text-kumo-subtle" />
          </button>
          <div className="flex items-center gap-2 sm:gap-3">
            <PlugsConnectedIcon size={22} className="shrink-0 text-kumo-accent" weight="bold" />
            <div>
              <h1 className="text-base font-semibold leading-tight text-kumo-default sm:text-lg">
                {t("app_title")}
              </h1>
              <Text size="xs" variant="secondary">
                {t("app_subtitle")}
              </Text>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 sm:gap-3">
          <button
            type="button"
            onClick={onNewSession}
            className={`inline-flex items-center justify-center gap-1.5 rounded-lg border border-kumo-line px-2.5 py-2 text-xs font-medium text-kumo-subtle transition-colors hover:bg-kumo-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-accent/40 sm:justify-start ${
              isTouchDevice ? "active:scale-95" : ""
            }`}
            style={{ minHeight: 44, minWidth: 44 }}
            aria-label={t("session_new")}
            title={t("session_new")}
          >
            <PlusIcon size={16} />
            <span className="hidden sm:inline">{t("session_new")}</span>
          </button>
          <button
            type="button"
            onClick={onExportAllMarkdown}
            disabled={disableExportAllMarkdown}
            className={`inline-flex items-center justify-center rounded-lg border border-kumo-line p-2 text-kumo-subtle transition-colors hover:bg-kumo-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-accent/40 ${
              isTouchDevice ? "active:scale-95" : ""
            } ${disableExportAllMarkdown ? "cursor-not-allowed opacity-50" : ""}`}
            style={{ minHeight: 44, minWidth: 44 }}
            aria-label={t("topbar_export_markdown")}
            title={t("topbar_export_markdown")}
          >
            <DownloadSimpleIcon size={18} />
          </button>
          <button
            type="button"
            onClick={handleToggleTheme}
            className={`inline-flex items-center justify-center rounded-lg border border-kumo-line p-2 text-kumo-subtle transition-colors hover:bg-kumo-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-accent/40 ${
              isTouchDevice ? "active:scale-95" : ""
            }`}
            style={{ minHeight: 44, minWidth: 44 }}
            aria-label={t("theme_toggle")}
            title={t("theme_toggle")}
          >
            {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
          {!mobile ? (
            <ConnectionIndicator
              status={connectionStatus}
              labels={{
                connecting: t("connection_connecting"),
                connected: t("connection_connected"),
                disconnected: t("connection_disconnected")
              }}
            />
          ) : null}
        </div>
      </div>
    </header>
  );
}
