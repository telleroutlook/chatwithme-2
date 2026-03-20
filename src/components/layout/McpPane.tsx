import {
  CheckCircleIcon,
  InfoIcon,
  PlugIcon,
  SpinnerIcon,
  WarningIcon,
  WrenchIcon
} from "@phosphor-icons/react";
import { McpItemCard } from "../McpItemCard";
import { cn } from "../ui/utils";

interface PreconfiguredServer {
  config: {
    name: string;
    url: string;
    description: string;
  };
  connected: boolean;
  error?: string;
}

interface McpPaneProps {
  isLoading: boolean;
  preconfiguredServerList: Array<[string, PreconfiguredServer]>;
  togglingServer: string | null;
  onToggleServer: (name: string) => void;
  canEdit: boolean;
  mcpTools: Array<{ name: string; serverId?: string; [key: string]: unknown }>;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

export function McpPane({
  isLoading,
  preconfiguredServerList,
  togglingServer,
  onToggleServer,
  canEdit,
  mcpTools,
  t
}: McpPaneProps) {
  return (
    <section className="h-full overflow-y-auto px-3 py-5 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-8">
        <div className="rounded-xl border border-border bg-surface-elevated app-panel rounded-2xl p-4 ring ring-border">
          <div className="flex gap-3">
            <InfoIcon size={20} weight="bold" className="mt-0.5 shrink-0 text-accent" />
            <div>
              <span className="text-sm font-semibold text-foreground">
                {t("mcp_info_title")}
              </span>
              <span className="mt-1 block">
                <span className="text-xs text-foreground-muted">
                  {t("mcp_info_desc")}
                </span>
              </span>
            </div>
          </div>
        </div>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <SpinnerIcon size={24} className="animate-spin text-accent" />
            <span className="ml-2">
              <span className="text-sm text-foreground">{t("mcp_loading")}</span>
            </span>
          </div>
        )}

        {!isLoading && preconfiguredServerList.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <PlugIcon size={18} weight="bold" className="text-foreground-muted" />
              <span className="text-base font-semibold text-foreground">
                {t("mcp_available_servers")}
              </span>
            </div>
            <div className="space-y-2">
              {preconfiguredServerList.map(([name, server]) => (
                <div key={name} className="rounded-xl border border-border bg-surface-elevated app-panel-soft rounded-2xl p-4 ring ring-border">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-foreground">
                          {server.config.name}
                        </span>
                        {server.connected ? (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-accent/20 text-accent">
                            <CheckCircleIcon size={12} weight="fill" className="mr-1" />
                            {t("mcp_status_active")}
                          </span>
                        ) : (
                          <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-foreground-muted">
                            {t("mcp_status_inactive")}
                          </span>
                        )}
                      </div>
                      <span className="mt-1 block">
                        <span className="text-xs text-foreground-muted">
                          {server.config.description}
                        </span>
                      </span>
                      <span className="mt-0.5 block font-mono">
                        <span className="text-xs text-foreground-muted">
                          {server.config.url}
                        </span>
                      </span>
                      {server.error && (
                        <div className="mt-2 flex items-center gap-1 app-text-danger">
                          <WarningIcon size={14} weight="fill" />
                          <span className="text-xs">{server.error}</span>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {togglingServer === name ? (
                        <SpinnerIcon size={20} className="animate-spin text-accent" />
                      ) : (
                        <button
                          role="switch"
                          aria-checked={server.connected}
                          onClick={() => onToggleServer(name)}
                          disabled={!canEdit}
                          aria-label={t("mcp_toggle_server", { name })}
                          className={cn(
                            "relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors",
                            server.connected ? "bg-accent" : "bg-border",
                            !canEdit && "cursor-not-allowed opacity-50"
                          )}
                        >
                          <span className={cn(
                            "pointer-events-none block h-4 w-4 rounded-full bg-white shadow-sm transition-transform",
                            server.connected ? "translate-x-4" : "translate-x-0"
                          )} />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {mcpTools.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <WrenchIcon size={18} weight="bold" className="text-foreground-muted" />
              <span className="text-base font-semibold text-foreground">
                {t("mcp_available_tools")}
              </span>
              <span className="inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium bg-muted text-foreground-muted">
                {mcpTools.length}
              </span>
            </div>
            <div className="space-y-2">
              {mcpTools.map((tool) => (
                <McpItemCard
                  key={`${tool.name}-${tool.serverId}`}
                  name={tool.name}
                  serverId={tool.serverId ?? "unknown"}
                  data={tool}
                  serverLabel={t("mcp_server")}
                  payloadLabel={t("mcp_raw_payload")}
                />
              ))}
            </div>
          </section>
        )}
      </div>
    </section>
  );
}
