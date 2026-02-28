import { AIChatAgent, type OnChatMessageOptions } from "@cloudflare/ai-chat";
import { callable } from "agents";
import {
  streamText,
  generateText,
  convertToModelMessages,
  pruneMessages,
  type ModelMessage
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

  private get runtimeEnv(): Env {
    return (this as unknown as { env: Env }).env;
  }

  private getMessageText(message: { parts: Array<{ type: string; text?: string }> }): string {
    return message.parts
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text)
      .join("\n");
  }

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
    const modelMessages = await convertToModelMessages(this.messages);
    const messages = pruneMessages({
      messages: modelMessages.slice(-50) // Keep last 50 messages
    });

    // Create GLM provider using OpenAI-compatible interface
    const glm = createOpenAICompatible({
      name: "glm",
      apiKey: this.runtimeEnv.BIGMODEL_API_KEY,
      baseURL: "https://open.bigmodel.cn/api/coding/paas/v4"
    });

    let streamedText = "";

    // Stream response from GLM
    const result = streamText({
      abortSignal: options?.abortSignal,
      model: glm("GLM-4.7"),
      system: systemPrompt,
      messages,
      temperature: 0.7,
      onChunk: async ({ chunk }) => {
        if (chunk.type === "text-delta") {
          streamedText += chunk.text;
        }
      },
      onFinish: async ({ text }) => {
        const toolResult = await this.tryExecuteToolCall(text || streamedText);
        if (toolResult.executed) {
          console.log(`Tool ${toolResult.toolName} executed successfully`);
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
      if (this.mcp) {
        const tools = this.mcp.listTools();
        toolList = tools
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

Available tools and their parameters:
- webSearchPrime: Search the web for information
  - Parameters: {"search_query": "your search query"} (REQUIRED: use "search_query" not "query")
- webReader: Read and extract content from web pages
  - Parameters: {"url": "https://example.com"}

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
  ): Promise<{ executed: boolean; toolName?: string; result?: string; error?: string }> {
    try {
      // Extract JSON from code block
      const jsonMatch = message.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (!jsonMatch) {
        return { executed: false, error: "No JSON code block found" };
      }

      const jsonStr = jsonMatch[1].trim();
      const parsed = JSON.parse(jsonStr);

      if (!parsed.tool_call || !parsed.tool_call.name) {
        return { executed: false, error: "No tool_call in JSON" };
      }

      const { name, arguments: args } = parsed.tool_call;

      // Check MCP availability using listTools() method
      if (!this.mcp) {
        return { executed: false, error: "MCP not available" };
      }

      // Get available tools using listTools()
      const tools = this.mcp.listTools();
      console.log("Available MCP tools:", tools?.map(t => t.name));

      // Find the tool - tools are namespaced as "serverId.toolName"
      const toolInfo = tools?.find((t) => t.name === name || t.name.endsWith(`.${name}`));

      if (!toolInfo) {
        return { executed: false, error: `Tool "${name}" not found in available tools` };
      }

      // Extract serverId from the namespaced tool name
      const serverId = toolInfo.name.includes('.') ? toolInfo.name.split('.')[0] : toolInfo.serverId;

      console.log(`Executing tool: ${name} on server: ${serverId} with args:`, args);
      const toolResult = await this.mcp.callTool({
        name,
        serverId,
        arguments: args || {}
      });

      const resultText =
        typeof toolResult === "string"
          ? toolResult
          : JSON.stringify(toolResult, null, 2);

      console.log(`Tool ${name} result:`, resultText.substring(0, 200));
      return { executed: true, toolName: name, result: resultText };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      console.error("Tool call error:", error);
      return { executed: false, error: errorMsg };
    }
  }

  // ============ Chat Methods (callable for REST API) ============

  @callable({ description: "Send a chat message and get AI response with tool execution" })
  async chat(message: string): Promise<string> {
    // Build system prompt
    const systemPrompt = await this.buildSystemPrompt();

    // Create GLM provider
    const glm = createOpenAICompatible({
      name: "glm",
      apiKey: this.runtimeEnv.BIGMODEL_API_KEY,
      baseURL: "https://open.bigmodel.cn/api/coding/paas/v4"
    });

    // Get existing messages safely - ensure it's an array
    const currentMessages = Array.isArray(this.messages) ? this.messages : [];

    // Convert messages for the model
    let existingMessages: ModelMessage[] = [];
    try {
      existingMessages = await convertToModelMessages(currentMessages);
    } catch (e) {
      console.error("Error converting messages:", e);
      existingMessages = [];
    }

    // Create user message
    const userMessage: ModelMessage = {
      role: "user",
      content: [{ type: "text", text: message }]
    };
    const messages = [...existingMessages, userMessage];

    // Generate initial response
    const { text } = await generateText({
      model: glm("GLM-4.7"),
      system: systemPrompt,
      messages,
      temperature: 0.7
    });

    let finalResponse = text;

    // Check for tool calls and execute them
    console.log("Checking for tool calls in response:", text.substring(0, 200));
    const toolResult = await this.tryExecuteToolCall(text);
    console.log("Tool execution result:", toolResult);

    if (toolResult.executed && toolResult.result) {
      // Tool was executed, now generate a follow-up response with the tool result
      const toolContextMessage = {
        role: "user" as const,
        content: [{
          type: "text" as const,
          text: `Tool "${toolResult.toolName}" returned the following result:\n\n${toolResult.result}\n\nPlease use this information to provide a helpful response to the user's original question.`
        }]
      };

      const followUpMessages: ModelMessage[] = [
        ...messages,
        {
          role: "assistant",
          content: [{ type: "text", text }]
        },
        toolContextMessage
      ];

      const { text: followUpText } = await generateText({
        model: glm("GLM-4.7"),
        system: systemPrompt,
        messages: followUpMessages,
        temperature: 0.7
      });

      finalResponse = followUpText;
    }

    // Persist messages to storage using proper ChatMessage format
    const timestamp = Date.now();
    try {
      await this.persistMessages([
        ...currentMessages,
        {
          id: `user-${timestamp}`,
          role: "user",
          parts: [{ type: "text", text: message }]
        },
        {
          id: `assistant-${timestamp}`,
          role: "assistant",
          parts: [{ type: "text", text: finalResponse }]
        }
      ]);
    } catch (e) {
      console.error("Error persisting messages:", e);
    }

    return finalResponse;
  }

  @callable({ description: "Get chat message history" })
  async getHistory(): Promise<Array<{ role: string; content: string; id?: string }>> {
    const messages = Array.isArray(this.messages) ? this.messages : [];
    return messages.map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: this.getMessageText(msg)
    }));
  }

  @callable({ description: "Clear chat history" })
  async clearChat(): Promise<{ success: boolean }> {
    // Clear all messages by directly deleting from SQL
    try {
      this.sql`DELETE FROM cf_ai_chat_agent_messages`;
      // Also clear the in-memory messages array
      this.messages.length = 0;
      return { success: true };
    } catch (e) {
      console.error("Error clearing messages:", e);
      return { success: false };
    }
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
    const runtimeEnv = this.runtimeEnv;
    const apiKey = getApiKey(config, runtimeEnv);

    try {
      const options: {
        callbackHost?: string;
        transport?: { type?: "streamable-http"; headers?: HeadersInit };
      } = {};

      if (runtimeEnv.HOST) {
        options.callbackHost = runtimeEnv.HOST;
      }

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
      if (!this.mcp) {
        return [];
      }
      const tools = this.mcp.listTools();
      return tools.map((tool) => ({
        name: tool.name,
        description: tool.description,
        serverId: tool.name.includes(".") ? tool.name.split(".")[0] : tool.serverId
      }));
    } catch (error) {
      console.error("Failed to get MCP tools:", error);
      return [];
    }
  }
}
