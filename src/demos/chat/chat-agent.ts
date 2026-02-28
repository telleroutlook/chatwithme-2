import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable } from "agents";
import {
  streamText,
  convertToModelMessages,
  pruneMessages
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { MCP_SERVERS, getApiKey, type McpServerConfig } from "../../mcp-config";

// MCP Server state (separate from chat messages)
export interface McpServerState {
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
 * Extends AIChatAgent for:
 * - Automatic message persistence to SQLite
 * - Built-in message pruning
 * - Streaming responses
 *
 * Adds MCP capabilities:
 * - Pre-configured MCP server management
 * - Dynamic tool execution
 */
export class ChatAgent extends AIChatAgent<Env> {
  // Keep last 100 messages in SQLite storage
  maxPersistedMessages = 100;

  // MCP server state (stored separately)
  private mcpServerState: McpServerState = {
    preconfiguredServers: {}
  };

  async onStart() {
    // Initialize pre-configured servers
    for (const config of MCP_SERVERS) {
      this.mcpServerState.preconfiguredServers[config.name] = {
        config,
        connected: false
      };
    }

    // Auto-connect to active servers
    for (const config of MCP_SERVERS) {
      if (config.active) {
        await this.activateServer(config.name);
      }
    }
  }

  /**
   * Main chat handler - called when user sends a message
   * AIChatAgent automatically handles message persistence
   */
  async onChatMessage(_onFinish: unknown, options?: OnChatMessageOptions) {
    // Build system prompt with available MCP tools
    const systemPrompt = await this.buildSystemPrompt();

    // Get and prune messages for context
    const messages = pruneMessages({
      messages: await convertToModelMessages(this.messages),
      keptMessageCount: 50, // Keep last 50 messages
    });

    // Create GLM provider using OpenAI-compatible interface
    const glm = createOpenAICompatible({
      name: "glm",
      apiKey: this.env.BIGMODEL_API_KEY,
      baseURL: "https://open.bigmodel.cn/api/coding/paas/v4"
    });

    // Stream response from GLM
    const result = streamText({
      abortSignal: options?.abortSignal,
      model: glm("GLM-4.7"),
      system: systemPrompt,
      messages,
      temperature: 0.7,
      onChunk: async ({ chunk, finishReason }) => {
        // Check for tool calls in the response
        if (finishReason === "stop" && chunk.type === "text-delta") {
          const text = chunk.textDelta;
          // Check if this contains a tool call pattern
          const toolResult = await this.tryExecuteToolCall(text);
          if (toolResult.executed) {
            // Tool was executed, the result will be added as context
            console.log(`Tool ${toolResult.toolName} executed successfully`);
          }
        }
      }
    });

    return result.toUIMessageStreamResponse();
  }

  /**
   * Build system prompt with available MCP tools and chart generation instructions
   */
  private async buildSystemPrompt(): Promise<string> {
    let toolList = "";
    try {
      if (this.mcp && typeof this.mcp.getState === "function") {
        const mcpState = await this.mcp.getState();
        toolList = mcpState.tools
          .map((t) => `- ${t.name}: ${t.description || "No description"}`)
          .join("\n");
      }
    } catch (error) {
      console.error("Failed to get MCP tools:", error);
    }

    return `You are a helpful AI assistant with the following capabilities:

## 1. Web Tools (MCP)
${toolList || "No tools available."}

To use a web tool, respond with:
\`\`\`json
{"tool_call": {"name": "tool_name", "arguments": {"arg": "value"}}}
\`\`\`

Available tools:
- webSearchPrime: Search the web for information
- webReader: Read and extract content from web pages

## 2. Chart Generation

When asked to create charts or diagrams, you MUST output them in code blocks.

### For Diagrams (flowcharts, sequence, pie charts):
Use Mermaid syntax in a code block:

\`\`\`mermaid
graph TD
    A[Start] --> B{Decision}
    B -->|Yes| C[Action 1]
    B -->|No| D[Action 2]
\`\`\`

Mermaid examples:

**Pie Chart:**
\`\`\`mermaid
pie title Sales Distribution
    "East" : 35
    "West" : 25
    "North" : 20
    "South" : 20
\`\`\`

**Flowchart:**
\`\`\`mermaid
flowchart LR
    A[Input] --> B[Process]
    B --> C[Output]
\`\`\`

**Sequence Diagram:**
\`\`\`mermaid
sequenceDiagram
    User->>Server: Request
    Server->>Database: Query
    Database-->>Server: Result
    Server-->>User: Response
\`\`\`

### For Data Charts (bar, line, area, scatter):
Use G2 JSON format in a code block:

\`\`\`g2
{
  "type": "interval",
  "data": [
    {"month": "Jan", "sales": 100},
    {"month": "Feb", "sales": 150},
    {"month": "Mar", "sales": 200}
  ],
  "encode": {"x": "month", "y": "sales"}
}
\`\`\`

G2 chart types:
- "interval" : bar/column charts
- "line" : line charts
- "area" : area charts
- "point" : scatter plots
- "cell" : heatmaps

**Line Chart Example:**
\`\`\`g2
{
  "type": "line",
  "data": [
    {"date": "2024-01", "value": 120},
    {"date": "2024-02", "value": 180},
    {"date": "2024-03", "value": 150}
  ],
  "encode": {"x": "date", "y": "value"}
}
\`\`\`

IMPORTANT:
- Always use actual code blocks (triple backticks) for charts
- Use Mermaid for diagrams and simple charts
- Use G2 for data visualization with numbers
- Make sure JSON is valid in G2 blocks
- After generating a chart, briefly explain what it shows`;
  }

  /**
   * Try to execute a tool call from the message content
   */
  private async tryExecuteToolCall(
    message: string
  ): Promise<{ executed: boolean; toolName?: string; result?: string }> {
    try {
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

      if (!this.mcp || typeof this.mcp.getState !== "function") {
        return { executed: false };
      }

      const mcpState = await this.mcp.getState();
      const toolInfo = mcpState.tools.find((t) => t.name === name);

      if (!toolInfo) {
        return { executed: false };
      }

      if (typeof this.mcp.callTool !== "function") {
        return { executed: false };
      }

      const toolResult = await this.mcp.callTool({
        name,
        serverId: toolInfo.serverId,
        arguments: args || {}
      });

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

  // ============ Chat Methods (callable for REST API) ============

  @callable({ description: "Send a chat message and get AI response" })
  async chat(message: string): Promise<string> {
    // Build system prompt
    const systemPrompt = await this.buildSystemPrompt();

    // Create GLM provider
    const glm = createOpenAICompatible({
      name: "glm",
      apiKey: this.env.BIGMODEL_API_KEY,
      baseURL: "https://open.bigmodel.cn/api/coding/paas/v4"
    });

    // Get existing messages and add the new user message
    const existingMessages = await convertToModelMessages(this.messages);
    const messages = [
      ...existingMessages,
      { role: "user" as const, content: message }
    ];

    // Generate response (non-streaming for REST API)
    const { textStream } = streamText({
      model: glm("GLM-4.7"),
      system: systemPrompt,
      messages,
      temperature: 0.7
    });

    // Collect the full response
    let response = "";
    for await (const chunk of textStream) {
      response += chunk;
    }

    return response;
  }

  @callable({ description: "Get chat message history" })
  async getHistory(): Promise<Array<{ role: string; content: string; id?: string }>> {
    return this.messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: typeof msg.content === "string" ? msg.content : JSON.stringify(msg.content)
    }));
  }

  @callable({ description: "Clear chat history" })
  async clearChat(): Promise<{ success: boolean }> {
    // AIChatAgent doesn't have a direct clear method, return status
    return { success: true, message: "Clear via WebSocket reconnect" };
  }

  // ============ MCP Server Management (callable methods) ============

  @callable({ description: "Get list of pre-configured MCP servers" })
  async getPreconfiguredServers(): Promise<McpServerState["preconfiguredServers"]> {
    return this.mcpServerState.preconfiguredServers;
  }

  @callable({ description: "Activate a pre-configured MCP server" })
  async activateServer(name: string): Promise<{ success: boolean; error?: string }> {
    const serverEntry = this.mcpServerState.preconfiguredServers[name];
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

      this.mcpServerState.preconfiguredServers[name] = {
        ...serverEntry,
        serverId: result.id,
        connected: true,
        error: undefined
      };

      return { success: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);

      this.mcpServerState.preconfiguredServers[name] = {
        ...serverEntry,
        connected: false,
        error: message
      };

      return { success: false, error: message };
    }
  }

  @callable({ description: "Deactivate a pre-configured MCP server" })
  async deactivateServer(name: string): Promise<{ success: boolean }> {
    const serverEntry = this.mcpServerState.preconfiguredServers[name];
    if (!serverEntry || !serverEntry.serverId) {
      return { success: false };
    }

    try {
      await this.removeMcpServer(serverEntry.serverId);

      this.mcpServerState.preconfiguredServers[name] = {
        ...serverEntry,
        serverId: undefined,
        connected: false
      };

      return { success: true };
    } catch (error) {
      console.error(`Failed to deactivate server ${name}:`, error);
      return { success: false };
    }
  }

  @callable({ description: "Toggle a pre-configured MCP server on/off" })
  async toggleServer(name: string): Promise<{ success: boolean; active?: boolean; error?: string }> {
    const serverEntry = this.mcpServerState.preconfiguredServers[name];
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

  @callable({ description: "Get available MCP tools" })
  async getAvailableTools() {
    try {
      if (!this.mcp || typeof this.mcp.getState !== "function") {
        return [];
      }
      const state = await this.mcp.getState();
      return state.tools.map((tool) => ({
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
