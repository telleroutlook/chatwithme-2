import { callable } from "agents";
import { BaseAgent } from "../../shared/base-agent";

interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool";
  content: string;
  name?: string;
}

export interface ChatAgentState {
  messages: ChatMessage[];
}

/**
 * Chat Agent - AI chat with MCP tool integration
 *
 * This agent can:
 * 1. Maintain chat history
 * 2. Connect to MCP servers and use their tools
 * 3. Use GLM models for AI responses
 */
export class ChatAgent extends BaseAgent<ChatAgentState> {
  initialState: ChatAgentState = {
    messages: []
  };

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
    return `You are a helpful AI assistant with access to tools.

When you need to search the web or read web pages, use the following tools by responding with a JSON object:

For web search:
{"tool_call": {"name": "webSearchPrime", "arguments": {"search_query": "your search query"}}}

For reading web pages:
{"tool_call": {"name": "webReader", "arguments": {"url": "https://example.com"}}}

After using a tool, I will provide you with the results and you can continue helping the user.

Always be helpful and provide accurate information. If you use a tool, explain what you found.`;
  }

  @callable({ description: "Send a chat message and get AI response" })
  async chat(userMessage: string): Promise<string> {
    // Add user message to history
    const messages: ChatMessage[] = [
      ...this.state.messages,
      { role: "user", content: userMessage }
    ];

    // Get initial response from GLM
    const response = await this.callGLM([
      { role: "system", content: this.buildSystemPrompt() },
      ...messages
    ]);

    let assistantMessage = response;

    // Check if the model wants to call a tool
    try {
      // Handle cases where the JSON might be embedded in markdown code blocks
      let jsonStr = assistantMessage;
      const jsonMatch = assistantMessage.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (jsonMatch) {
        jsonStr = jsonMatch[1].trim();
      }

      const parsed = JSON.parse(jsonStr);
      if (parsed.tool_call) {
        const { name, arguments: args } = parsed.tool_call;

        // Get MCP state to find the tool
        const mcpState = await this.mcp.getState();
        const toolInfo = mcpState.tools.find((t) => t.name === name);

        if (toolInfo) {
          // Execute the MCP tool
          const toolResult = await this.mcp.callTool({
            name,
            serverId: toolInfo.serverId,
            arguments: args
          });

          // Format result
          const resultText =
            typeof toolResult === "string"
              ? toolResult
              : JSON.stringify(toolResult, null, 2);

          // Add tool result to messages and get final response
          messages.push({ role: "assistant", content: assistantMessage });
          messages.push({
            role: "tool",
            name,
            content: resultText
          });

          // Get summary from GLM
          const finalResponse = await this.callGLM([
            {
              role: "system",
              content:
                "Based on the tool result, provide a helpful response to the user."
            },
            {
              role: "user",
              content: `I used the tool "${name}" with arguments ${JSON.stringify(
                args
              )}.\n\nResult:\n${resultText}\n\nPlease summarize this for the user.`
            }
          ]);

          assistantMessage = finalResponse;
        }
      }
    } catch {
      // Not a JSON tool call, use the message as-is
    }

    // Save to history
    this.setState({
      messages: [...messages, { role: "assistant", content: assistantMessage }]
    });

    return assistantMessage;
  }

  @callable({ description: "Clear chat history" })
  async clearChat(): Promise<{ success: boolean }> {
    this.setState({ messages: [] });
    return { success: true };
  }

  @callable({ description: "Get chat history" })
  async getHistory(): Promise<ChatMessage[]> {
    return this.state.messages;
  }
}
