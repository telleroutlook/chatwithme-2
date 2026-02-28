import { Text } from "@cloudflare/kumo";
import { ListIcon, PlugsConnectedIcon } from "@phosphor-icons/react";
import { ConnectionIndicator, type ConnectionStatus } from "../AgentsUiCompat";

interface TopBarProps {
  mobile: boolean;
  onToggleSidebar: () => void;
  connectionStatus: ConnectionStatus;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

export function TopBar({ mobile, onToggleSidebar, connectionStatus, t }: TopBarProps) {
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
