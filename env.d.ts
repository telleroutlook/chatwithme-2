/* eslint-disable */
// Environment types for ChatWithMe MCP
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./src/server");
    durableNamespaces: "McpClientAgent" | "ChatAgent";
  }
  interface Env {
    HOST: string;
    BIGMODEL_API_KEY: string;
    McpClientAgent: DurableObjectNamespace<import("./src/demos/mcp/mcp-client-agent").McpClientAgent>;
    ChatAgent: DurableObjectNamespace<import("./src/demos/chat/chat-agent").ChatAgent>;
  }
}
interface Env extends Cloudflare.Env {}
