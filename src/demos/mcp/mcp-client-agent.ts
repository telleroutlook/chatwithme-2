import { callable } from "agents";
import { BaseAgent } from "../../shared/base-agent";

export interface McpClientState {
  connectedServers: Record<string, { name: string; url: string }>;
}

/**
 * MCP Client Agent - Manages connections to external MCP servers
 */
export class McpClientAgent extends BaseAgent<McpClientState> {
  initialState: McpClientState = {
    connectedServers: {}
  };

  @callable({ description: "Connect to an MCP server" })
  async connectToServer(
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

      // Track connected server
      const servers = { ...this.state.connectedServers };
      servers[result.id] = { name, url };
      this.setState({ connectedServers: servers });

      return { success: true, serverId: result.id };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return { success: false, error: message };
    }
  }

  @callable({ description: "Disconnect from an MCP server" })
  async disconnectFromServer(serverId: string): Promise<{ success: boolean }> {
    try {
      await this.removeMcpServer(serverId);

      // Remove from tracking
      const servers = { ...this.state.connectedServers };
      delete servers[serverId];
      this.setState({ connectedServers: servers });

      return { success: true };
    } catch (error) {
      console.error(`Failed to disconnect MCP server ${serverId}:`, error);
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
