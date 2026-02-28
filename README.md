# ChatWithMe-2

A reference implementation and planning repository for refactoring [ChatWithMe](../chatwithme) into an Agent-first architecture.

## Project Purpose

This repository serves as:

- **Planning documentation** for the ChatWithMe architecture refactor
- **Reference implementation** inspired by Cloudflare Agents examples
- **Sandbox** for testing optimizations before applying to the main project

> ⚠️ **Note**: This is a planning/reference repo. The actual implementation lives in `/home/dev/github/chatwithme`.

## Related Projects

### mcp-client-tool (Production MCP Manager)

A standalone tool for managing MCP server connections, deployed at:

| Resource       | URL                                         |
| -------------- | ------------------------------------------- |
| **Production** | https://mcp-client-tool.3we.org             |
| **GitHub**     | https://github.com/telleroutlook/mcp-client |
| **Worker**     | `mcp-client-tool`                           |

**Features**:

- Connect to remote MCP servers with OAuth support
- View available tools, prompts, and resources
- Toast notifications, loading states, form validation
- Memoized components for better performance

**Usage**: Use this tool to test and debug MCP servers before integrating them into ChatWithMe.

> 📖 For detailed documentation, debugging guide, and upgrade instructions, see the [mcp-client README](https://github.com/telleroutlook/mcp-client#readme).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Project Ecosystem                             │
└─────────────────────────────────────────────────────────────────────┘

┌───────────────────┐     ┌───────────────────┐     ┌────────────────┐
│   chatwithme      │     │   chatwithme-2    │     │  mcp-client    │
│   (Main App)      │     │   (Planning)      │     │  (Dev Tool)    │
│   ============    │     │   ============    │     │  ===========   │
│ • Chat UI         │◄────│ • Architecture    │     │ • MCP Manager  │
│ • MCP Agent       │     │   documentation   │     │ • Test MCP     │
│ • D1 + R2         │     │ • Execution plan  │     │   connections  │
│ • Production      │     │ • Experiments     │     │ • Debugging    │
└───────────────────┘     └───────────────────┘     └────────────────┘
         │                                                   │
         │                    MCP Protocol                   │
         └─────────────────────────┬─────────────────────────┘
                                   │
                                   ▼
                    ┌──────────────────────────┐
                    │   External MCP Servers   │
                    │   (GitHub, Slack, etc.)  │
                    └──────────────────────────┘
```

## Documentation

- **Architecture Plan**: [docs/official-architecture-refactor-execution-plan.md](docs/official-architecture-refactor-execution-plan.md)
- **Project Instructions**: [CLAUDE.md](CLAUDE.md)

---

## Original MCP Client Demo

_The following is the original documentation from the Cloudflare Agents example._

---

## What it demonstrates

- **`addMcpServer` / `removeMcpServer`** — managing MCP server connections from an Agent
- **`onMcpUpdate`** — real-time state updates pushed to the React frontend via WebSocket
- **OAuth popup flow** — `configureOAuthCallback` with a custom handler that closes the popup after auth
- **`agentFetch`** — making HTTP requests to the Agent's custom endpoints from the client

## Running

```sh
npm install
npm run dev
```

The UI lets you add MCP server URLs, see their connection state, and browse their tools, prompts, and resources.

To test with an authenticated server, run the [`mcp-worker-authenticated`](../mcp-worker-authenticated/) example alongside this one and add its URL.

## Environment variables

Copy `.env.example` to `.env` if you need to override the OAuth callback host:

```sh
cp .env.example .env
```

## How it works

### Server side

The Agent manages MCP connections via the built-in `mcp` property:

```typescript
export class MyAgent extends Agent {
  onStart() {
    this.mcp.configureOAuthCallback({
      customHandler: (result) => {
        if (result.authSuccess) {
          return new Response("<script>window.close();</script>", {
            headers: { "content-type": "text/html" }
          });
        }
        return new Response(`Auth failed: ${result.authError}`, {
          status: 400
        });
      }
    });
  }

  async onRequest(request) {
    // Custom endpoints for the frontend
    if (url.pathname.endsWith("add-mcp")) {
      const { name, url } = await request.json();
      await this.addMcpServer(name, url);
      return new Response("Ok");
    }
  }
}
```

### Client side

The React frontend uses `useAgent` with `onMcpUpdate` to receive real-time server state:

```typescript
const agent = useAgent({
  agent: "my-agent",
  name: sessionId,
  onMcpUpdate: (mcpServers) => setMcpState(mcpServers),
  onOpen: () => setConnected(true)
});
```

## Related examples

- [`mcp`](../mcp/) — stateful MCP server (good target to connect to)
- [`mcp-worker-authenticated`](../mcp-worker-authenticated/) — authenticated server (tests the OAuth flow)
