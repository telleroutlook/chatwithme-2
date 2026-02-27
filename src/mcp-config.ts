/**
 * Pre-configured MCP Servers
 *
 * These servers are pre-configured and can be activated/deactivated by users.
 * API keys should be stored in environment variables for security.
 */

export interface McpServerConfig {
  name: string;
  url: string;
  apiKey?: string;  // If empty, will use env variable
  envKey?: string;  // Environment variable name for API key
  description: string;
  active: boolean;
}

export const MCP_SERVERS: McpServerConfig[] = [
  {
    name: "web-search-prime",
    url: "https://open.bigmodel.cn/api/mcp/web_search_prime/mcp",
    apiKey: "",  // Will use env variable
    envKey: "BIGMODEL_API_KEY",
    description: "搜索网络信息，返回网页标题、URL、摘要等",
    active: true
  },
  {
    name: "web-reader",
    url: "https://open.bigmodel.cn/api/mcp/web_reader/mcp",
    apiKey: "",  // Will use env variable
    envKey: "BIGMODEL_API_KEY",
    description: "读取网页内容，提取文章、文档等",
    active: true
  },
  {
    name: "zread",
    url: "https://open.bigmodel.cn/api/mcp/zread/mcp",
    apiKey: "",  // Will use env variable
    envKey: "BIGMODEL_API_KEY",
    description: "读取 GitHub 仓库结构和文件内容",
    active: false
  }
];

/**
 * Get API key for a server from environment or config
 */
export function getApiKey(config: McpServerConfig, env: Env): string | undefined {
  if (config.apiKey) {
    return config.apiKey;
  }
  if (config.envKey && env[config.envKey as keyof Env]) {
    return env[config.envKey as keyof Env] as string;
  }
  return undefined;
}
