import { callable } from "agents";
import { BaseAgent } from "../../shared/base-agent";
import { MCP_SERVERS, getApiKey, type McpServerConfig } from "../../mcp-config";

export interface McpClientState {
  // Pre-configured servers with their activation status
  preconfiguredServers: Record<string, {
    config: McpServerConfig;
    serverId?: string;
    connected: boolean;
    error?: string;
  }>;
  // Custom servers added by user
  customServers: Record<string, { name: string; url: string }>;
}

/**
 * MCP Client Agent - Manages connections to external MCP servers
 *
 * Features:
 * - Pre-configured servers that can be toggled on/off
 * - Custom servers that users can add manually
 */
export class McpClientAgent extends BaseAgent<McpClientState> {
  initialState: McpClientState = {
    preconfiguredServers: {},
    customServers: {}
  };

  async onStart() {
    // Call parent onStart for OAuth callback
    super.onStart();

    // Initialize pre-configured servers
    const preconfiguredServers: McpClientState["preconfiguredServers"] = {};
    for (const config of MCP_SERVERS) {
      preconfiguredServers[config.name] = {
        config,
        connected: false
      };
    }
    this.setState({ preconfiguredServers, customServers: {} });

    // Auto-connect to active servers
    for (const config of MCP_SERVERS) {
      if (config.active) {
        await this.activateServer(config.name);
      }
    }
  }

  @callable({ description: "Get list of pre-configured MCP servers" })
  async getPreconfiguredServers(): Promise<McpClientState["preconfiguredServers"]> {
    return this.state.preconfiguredServers;
  }

  @callable({ description: "Activate a pre-configured MCP server" })
  async activateServer(name: string): Promise<{ success: boolean; error?: string }> {
    const serverEntry = this.state.preconfiguredServers[name];
    if (!serverEntry) {
      return { success: false, error: `Server "${name}" not found in pre-configured list` };
    }

    const config = serverEntry.config;
    const apiKey = getApiKey(config, this.env);

    try {
      const options: {
        callbackHost: string | undefined;
        transport?: { type: string; headers: Record<string, string> };
      } = {
        callbackHost: this.env.HOST
      };

      if (apiKey) {
        options.transport = {
          type: "streamable-http",
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        };
      }

      const result = await this.addMcpServer(name, config.url, options);

      // Update state
      const preconfiguredServers = { ...this.state.preconfiguredServers };
      preconfiguredServers[name] = {
        ...serverEntry,
        serverId: result.id,
        connected: true,
        error: undefined
      };
      this.setState({ preconfiguredServers });

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      // Update state with error
      const preconfiguredServers = { ...this.state.preconfiguredServers };
      preconfiguredServers[name] = {
        ...serverEntry,
        connected: false,
        error: message
      };
      this.setState({ preconfiguredServers });

      return { success: false, error: message };
    }
  }

  @callable({ description: "Deactivate a pre-configured MCP server" })
  async deactivateServer(name: string): Promise<{ success: boolean }> {
    const serverEntry = this.state.preconfiguredServers[name];
    if (!serverEntry || !serverEntry.serverId) {
      return { success: false };
    }

    try {
      await this.removeMcpServer(serverEntry.serverId);

      // Update state
      const preconfiguredServers = { ...this.state.preconfiguredServers };
      preconfiguredServers[name] = {
        ...serverEntry,
        serverId: undefined,
        connected: false
      };
      this.setState({ preconfiguredServers });

      return { success: true };
    } catch (error) {
      console.error(`Failed to deactivate server ${name}:`, error);
      return { success: false };
    }
  }

  @callable({ description: "Toggle a pre-configured MCP server on/off" })
  async toggleServer(name: string): Promise<{ success: boolean; active?: boolean; error?: string }> {
    const serverEntry = this.state.preconfiguredServers[name];
    if (!serverEntry) {
      return { success: false, error: `Server "${name}" not found` };
    }

    if (serverEntry.connected) {
      const result = await this.deactivateServer(name);
      return { ...result, active: false };
    } else {
      const result = await this.activateServer(name);
      return { ...result, active: result.success };
    }
  }

  @callable({ description: "Add a custom MCP server" })
  async addCustomServer(
    name: string,
    url: string,
    apiKey?: string
  ): Promise<{ success: boolean; serverId?: string; error?: string }> {
    try {
      const options: {
        callbackHost: string | undefined;
        transport?: { type: string; headers: Record<string, string> };
      } = {
        callbackHost: this.env.HOST
      };

      if (apiKey) {
        options.transport = {
          type: "streamable-http",
          headers: {
            Authorization: `Bearer ${apiKey}`
          }
        };
      }

      const result = await this.addMcpServer(name, url, options);

      // Track custom server
      const customServers = { ...this.state.customServers };
      customServers[result.id] = { name, url };
      this.setState({ customServers });

      return { success: true, serverId: result.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  @callable({ description: "Remove a custom MCP server" })
  async removeCustomServer(serverId: string): Promise<{ success: boolean }> {
    try {
      await this.removeMcpServer(serverId);

      // Remove from tracking
      const customServers = { ...this.state.customServers };
      delete customServers[serverId];
      this.setState({ customServers });

      return { success: true };
    } catch (error) {
      console.error(`Failed to remove custom server ${serverId}:`, error);
      return { success: false };
    }
  }

  @callable({ description: "Get list of available MCP tools" })
  async getAvailableTools() {
    const state = await this.mcp.getState();
    return state.tools.map(tool => ({
      name: tool.name,
      description: tool.description,
      serverId: tool.serverId,
      inputSchema: tool.inputSchema
    }));
  }

  @callable({ description: "Call a tool on a connected MCP server" })
  async callTool(
    name: string,
    serverId: string,
    args: Record<string, unknown>
  ): Promise<unknown> {
    return await this.mcp.callTool({
      name,
      serverId,
      arguments: args
    });
  }
}
