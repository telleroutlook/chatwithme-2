import { routeAgentRequest } from "agents";

// Export unified Chat + MCP Agent
export { ChatAgent } from "./demos/chat/chat-agent";

// Main entry point
export default {
  async fetch(request: Request, env: Env) {
    return (
      (await routeAgentRequest(request, env, { cors: true })) ||
      new Response("Not found", { status: 404 })
    );
  }
} satisfies ExportedHandler<Env>;
