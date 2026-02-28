/* eslint-disable */
// Environment types for ChatWithMe MCP
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./src/server");
    durableNamespaces: "ChatAgent";
  }
  interface Env {
    HOST: string;
    BIGMODEL_API_KEY: string;
    CHAT_ENABLE_THINKING?: string;
    CHAT_MODEL_THINKING?: string;
    CHAT_MODEL_STREAM?: string;
    CHAT_MODEL_ID?: string;
    CHAT_MODEL_MAX_TOKENS?: string;
    ChatAgent: DurableObjectNamespace<import("./src/demos/chat/chat-agent").ChatAgent>;
  }
}
interface Env extends Cloudflare.Env {}
