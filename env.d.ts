/* eslint-disable */
// Environment types for ChatWithMe MCP
declare namespace Cloudflare {
  interface GlobalProps {
    mainModule: typeof import("./src/server");
    durableNamespaces: "ChatAgentV2";
  }
  interface Env {
    HOST: string;
    BIGMODEL_API_KEY: string;
    SERPER_API_KEY: string;
    CHAT_ENABLE_THINKING?: string;
    CHAT_MODEL_THINKING?: string;
    CHAT_MODEL_STREAM?: string;
    CHAT_MODEL_ID?: string;
    CHAT_MODEL_MAX_TOKENS?: string;
    CHAT_TOOL_TIMEOUT_MS?: string;
    CHAT_TOOL_MAX_ATTEMPTS?: string;
    CHAT_MODEL_TEMPERATURE?: string;
    CHAT_MAX_TOOL_STEPS?: string;
    AGENT_IDLE_TIMEOUT_SECONDS?: string;
    CHAT_CHART_PRIMARY?: string;
    ALLOWED_ORIGINS?: string;
    // D1 Database for authentication
    DB: D1Database;
    // JWT secret for authentication tokens
    AUTH_JWT_SECRET: string;
    ChatAgentV2: DurableObjectNamespace<import("./src/demos/chat/chat-agent").ChatAgentV2>;
  }
}
interface Env extends Cloudflare.Env {}
