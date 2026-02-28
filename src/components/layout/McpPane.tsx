import { Badge, Surface, Switch, Text } from "@cloudflare/kumo";
import { CheckCircleIcon, InfoIcon, PlugIcon, SpinnerIcon, WarningIcon, WrenchIcon } from "@phosphor-icons/react";
import { McpItemCard } from "../McpItemCard";

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
  mcpTools: Array<{ name: string; serverId?: string; [key: string]: unknown }>;
  t: (key: import("../../i18n/ui").UiMessageKey, vars?: Record<string, string>) => string;
}

export function McpPane({
  isLoading,
  preconfiguredServerList,
  togglingServer,
  onToggleServer,
  mcpTools,
  t,
}: McpPaneProps) {
  return (
    <section className="h-full overflow-y-auto px-3 py-5 sm:px-5">
      <div className="mx-auto max-w-4xl space-y-8">
        <Surface className="app-panel rounded-2xl p-4 ring ring-kumo-line">
          <div className="flex gap-3">
            <InfoIcon size={20} weight="bold" className="mt-0.5 shrink-0 text-kumo-accent" />
            <div>
              <Text size="sm" bold>{t("mcp_info_title")}</Text>
              <span className="mt-1 block">
                <Text size="xs" variant="secondary">{t("mcp_info_desc")}</Text>
              </span>
            </div>
          </div>
        </Surface>

        {isLoading && (
          <div className="flex items-center justify-center py-8">
            <SpinnerIcon size={24} className="animate-spin text-kumo-accent" />
            <span className="ml-2"><Text size="sm">{t("mcp_loading")}</Text></span>
          </div>
        )}

        {!isLoading && preconfiguredServerList.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <PlugIcon size={18} weight="bold" className="text-kumo-subtle" />
              <Text size="base" bold>{t("mcp_available_servers")}</Text>
            </div>
            <div className="space-y-2">
              {preconfiguredServerList.map(([name, server]) => (
                <Surface key={name} className="app-panel-soft rounded-2xl p-4 ring ring-kumo-line">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <Text size="sm" bold>{server.config.name}</Text>
                        {server.connected ? (
                          <Badge variant="primary">
                            <CheckCircleIcon size={12} weight="fill" className="mr-1" />
                            {t("mcp_status_active")}
                          </Badge>
                        ) : (
                          <Badge variant="secondary">{t("mcp_status_inactive")}</Badge>
                        )}
                      </div>
                      <span className="mt-1 block"><Text size="xs" variant="secondary">{server.config.description}</Text></span>
                      <span className="mt-0.5 block font-mono"><Text size="xs" variant="secondary">{server.config.url}</Text></span>
                      {server.error && (
                        <div className="mt-2 flex items-center gap-1 app-text-danger">
                          <WarningIcon size={14} weight="fill" />
                          <Text size="xs">{server.error}</Text>
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      {togglingServer === name ? (
                        <SpinnerIcon size={20} className="animate-spin text-kumo-accent" />
                      ) : (
                        <Switch
                          checked={server.connected}
                          onChange={() => onToggleServer(name)}
                          aria-label={t("mcp_toggle_server", { name })}
                        />
                      )}
                    </div>
                  </div>
                </Surface>
              ))}
            </div>
          </section>
        )}

        {mcpTools.length > 0 && (
          <section>
            <div className="mb-3 flex items-center gap-2">
              <WrenchIcon size={18} weight="bold" className="text-kumo-subtle" />
              <Text size="base" bold>{t("mcp_available_tools")}</Text>
              <Badge variant="secondary">{mcpTools.length}</Badge>
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
