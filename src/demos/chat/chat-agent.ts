import { callable } from "agents";
import { BaseAgent } from "../../shared/base-agent";
import { MCP_SERVERS, getApiKey, type McpServerConfig } from "../../mcp-config";

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  name?: string;
}

export interface ChatAgentState {
  messages: ChatMessage[];
  // Pre-configured servers with their activation status
  preconfiguredServers: Record<string, {
    config: McpServerConfig;
    serverId?: string;
    connected: boolean;
    error?: string;
  }>;
}

/**
 * Unified Chat + MCP Agent
 *
 * This agent combines:
 * 1. AI chat with GLM-4.7
 * 2. MCP server management
 * 3. Tool calling capabilities
 */
export class ChatAgent extends BaseAgent<ChatAgentState> {
  initialState: ChatAgentState = {
    messages: [],
    preconfiguredServers: {}
  };

  async onStart() {
    // Call parent onStart for OAuth callback
    super.onStart();

    // Initialize pre-configured servers
    const preconfiguredServers: ChatAgentState["preconfiguredServers"] = {};
    for (const config of MCP_SERVERS) {
      preconfiguredServers[config.name] = {
        config,
        connected: false
      };
    }
    this.setState({ messages: [], preconfiguredServers });

    // Auto-connect to active servers
    for (const config of MCP_SERVERS) {
      if (config.active) {
        await this.activateServer(config.name);
      }
    }
  }

  private async callGLM(messages: ChatMessage[]): Promise<string> {
    const response = await fetch(
      "https://open.bigmodel.cn/api/coding/paas/v4/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.env.BIGMODEL_API_KEY}`
        },
        body: JSON.stringify({
          model: "GLM-4.7",
          messages,
          temperature: 0.7
        })
      }
    );

    if (!response.ok) {
      throw new Error(`GLM API error: ${response.status}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
    };
    return data.choices[0]?.message?.content || "";
  }

  private buildSystemPrompt(): string {
    // Get available tools from MCP state
    const tools = this.mcp.getState().then(state => state.tools);

    return `You are a helpful AI assistant.

When you need to search the web, use this EXACT format:
\`\`\`json
{"tool_call": {"name": "webSearchPrime", "arguments": {"search_query": "your search query"}}}
\`\`\`

When you need to read a web page, use this EXACT format:
\`\`\`json
{"tool_call": {"name": "webReader", "arguments": {"url": "https://example.com"}}}
\`\`\`

IMPORTANT: Always wrap the JSON in markdown code blocks with \`\`\`json

After I execute the tool, I will provide you with the results.`;
  }

  // ============ MCP Server Management ============

  @callable({ description: "Get list of pre-configured MCP servers" })
  async getPreconfiguredServers(): Promise<ChatAgentState["preconfiguredServers"]> {
    return this.state.preconfiguredServers;
  }

  @callable({ description: "Activate a pre-configured MCP server" })
  async activateServer(name: string): Promise<{ success: boolean; error?: string }> {
    const serverEntry = this.state.preconfiguredServers[name];
    if (!serverEntry) {
      return { success: false, error: `Server "${name}" not found` };
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

  // ============ Chat ============

  @callable({ description: "Send a chat message and get AI response" })
  async chat(userMessage: string): Promise<string> {
    // Ensure state is initialized
    const currentMessages = this.state?.messages || [];

    // Add user message to history
    const messages: ChatMessage[] = [
      ...currentMessages,
      { role: "user", content: userMessage }
    ];

    // Get initial response from GLM
    const response = await this.callGLM([
      { role: "system", content: await this.buildSystemPromptDynamic() },
      ...messages
    ]);

    let assistantMessage = response;

    // Check if the model wants to call a tool
    const toolResult = await this.tryExecuteToolCall(assistantMessage);
    if (toolResult.executed) {
      // Get final response with tool result
      messages.push({ role: "assistant", content: assistantMessage });
      messages.push({
        role: "user",
        content: `Tool "${toolResult.toolName}" was executed. Result:\n${toolResult.result}\n\nPlease provide a helpful response based on this result.`
      });

      assistantMessage = await this.callGLM([
        {
          role: "system",
          content: "Based on the tool result, provide a helpful response to the user. Be concise and informative."
        },
        ...messages.slice(-4) // Keep last few messages for context
      ]);
    }

    // Save to history
    this.setState({
      ...this.state,
      messages: [...messages, { role: "assistant", content: assistantMessage }]
    });

    return assistantMessage;
  }

  private async buildSystemPromptDynamic(): Promise<string> {
    try {
      // Safely get MCP state
      if (!this.mcp || typeof this.mcp.getState !== "function") {
        return "You are a helpful AI assistant.";
      }
      const mcpState = await this.mcp.getState();
      const toolList = mcpState.tools
        .map(t => `- ${t.name}: ${t.description || "No description"}`)
        .join("\n");

      return `You are a helpful AI assistant with access to the following tools:

${toolList || "No tools available."}

To use a tool, respond with a JSON code block like this:
\`\`\`json
{"tool_call": {"name": "tool_name", "arguments": {"arg": "value"}}}
\`\`\`

After using a tool, I will provide the results and you can continue helping the user.`;
    } catch (error) {
      console.error("Failed to build system prompt:", error);
      return "You are a helpful AI assistant.";
    }
  }

  private async tryExecuteToolCall(message: string): Promise<{ executed: boolean; toolName?: string; result?: string }> {
    try {
      // Try to extract JSON from code blocks
      const jsonMatch = message.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (!jsonMatch) {
        return { executed: false };
      }

      const jsonStr = jsonMatch[1].trim();
      const parsed = JSON.parse(jsonStr);

      if (!parsed.tool_call || !parsed.tool_call.name) {
        return { executed: false };
      }

      const { name, arguments: args } = parsed.tool_call;

      // Safely get MCP state to find the tool
      if (!this.mcp || typeof this.mcp.getState !== "function") {
        return { executed: false };
      }
      const mcpState = await this.mcp.getState();
      const toolInfo = mcpState.tools.find((t) => t.name === name);

      if (!toolInfo) {
        return { executed: false };
      }

      // Execute the MCP tool
      if (typeof this.mcp.callTool !== "function") {
        return { executed: false };
      }
      const toolResult = await this.mcp.callTool({
        name,
        serverId: toolInfo.serverId,
        arguments: args || {}
      });

      // Format result
      const resultText =
        typeof toolResult === "string"
          ? toolResult
          : JSON.stringify(toolResult, null, 2);

      return { executed: true, toolName: name, result: resultText };
    } catch (error) {
      console.error("Tool call parsing error:", error);
      return { executed: false };
    }
  }

  @callable({ description: "Clear chat history" })
  async clearChat(): Promise<{ success: boolean }> {
    this.setState({ ...this.state, messages: [] });
    return { success: true };
  }

  @callable({ description: "Get chat history" })
  async getHistory(): Promise<ChatMessage[]> {
    return this.state?.messages || [];
  }

  @callable({ description: "Get available MCP tools" })
  async getAvailableTools() {
    try {
      // Check if mcp is available and has getState method
      if (!this.mcp || typeof this.mcp.getState !== "function") {
        return [];
      }
      const state = await this.mcp.getState();
      return state.tools.map(tool => ({
        name: tool.name,
        description: tool.description,
        serverId: tool.serverId
      }));
    } catch (error) {
      console.error("Failed to get MCP tools:", error);
      return [];
    }
  }
}
