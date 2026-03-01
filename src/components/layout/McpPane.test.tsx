import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { McpPane } from "./McpPane";

const t = (key: string, vars?: Record<string, string>) => {
  const map: Record<string, string> = {
    mcp_info_title: "Pre-configured MCP Servers",
    mcp_info_desc: "Toggle servers",
    mcp_loading: "Loading servers...",
    mcp_available_servers: "Available Servers",
    mcp_available_tools: "Available Tools",
    mcp_status_active: "Active",
    mcp_status_inactive: "Inactive",
    mcp_toggle_server: `Toggle server ${vars?.name ?? ""}`,
    mcp_server: "Server",
    mcp_raw_payload: "Raw payload"
  };
  return map[key] ?? key;
};

describe("McpPane", () => {
  it("disables switch toggles when canEdit is false", () => {
    const onToggleServer = vi.fn();
    render(
      <McpPane
        isLoading={false}
        preconfiguredServerList={[
          [
            "web-reader",
            {
              config: {
                name: "web-reader",
                url: "https://example.com/mcp",
                description: "reader"
              },
              connected: false
            }
          ]
        ]}
        togglingServer={null}
        onToggleServer={onToggleServer}
        canEdit={false}
        mcpTools={[]}
        t={t as never}
      />
    );

    const switchEl = screen.getByRole("switch", { name: "Toggle server web-reader" });
    expect(switchEl).toBeDisabled();
    fireEvent.click(switchEl);
    expect(onToggleServer).not.toHaveBeenCalled();
  });
});

