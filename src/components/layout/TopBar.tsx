import { Text } from "@cloudflare/kumo";
import { ListIcon, MoonIcon, PlusIcon, PlugsConnectedIcon, SunIcon } from "@phosphor-icons/react";
import { ConnectionIndicator, type ConnectionStatus, useThemeMode } from "../AgentsUiCompat";

interface TopBarProps {
  mobile: boolean;
  onToggleSidebar: () => void;
  onNewSession: () => void;
  connectionStatus: ConnectionStatus;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

export function TopBar({ mobile, onToggleSidebar, onNewSession, connectionStatus, t }: TopBarProps) {
  const { mode, setMode } = useThemeMode();
  const resolvedMode =
    mode === "system" ? (document.documentElement.getAttribute("data-mode") ?? "light") : mode;
  const isDark = resolvedMode === "dark";

  const handleToggleTheme = () => {
    setMode(isDark ? "light" : "dark");
  };

  return (
    <header className="app-glass border-b border-kumo-line/80 bg-kumo-base/70 px-3 py-3 sm:px-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleSidebar}
            className="rounded-lg p-2 transition-colors hover:bg-kumo-control focus-visible:outline-none"
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
            className="inline-flex items-center gap-1.5 rounded-lg border border-kumo-line px-2.5 py-2 text-xs font-medium text-kumo-subtle transition-colors hover:bg-kumo-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-accent/40"
            aria-label={t("session_new")}
            title={t("session_new")}
          >
            <PlusIcon size={16} />
            <span className="hidden sm:inline">{t("session_new")}</span>
          </button>
          <button
            type="button"
            onClick={handleToggleTheme}
            className="rounded-lg border border-kumo-line p-2 text-kumo-subtle transition-colors hover:bg-kumo-control focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-kumo-accent/40"
            aria-label={t("theme_toggle")}
            title={t("theme_toggle")}
          >
            {isDark ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
          <ConnectionIndicator
            status={connectionStatus}
            labels={{
              connecting: t("connection_connecting"),
              connected: t("connection_connected"),
              disconnected: t("connection_disconnected")
            }}
          />
        </div>
      </div>
    </header>
  );
}
