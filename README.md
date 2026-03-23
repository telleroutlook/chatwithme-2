# ChatWithMe-2

An AI chat assistant powered by Cloudflare Workers, Durable Objects, and the Agents SDK.

## Live

| Resource       | URL                                                          |
| -------------- | ------------------------------------------------------------ |
| **Production** | https://chatwithme2mcp.lintao-mailbox.workers.dev            |

## Features

- **AI Chat** — Conversational AI powered by GLM-4.7 via OpenAI-compatible API
- **Built-in Tools** (11) — Web search (Serper.dev/Google), web reader (Jina), weather, currency, math, Wikipedia, dictionary, datetime, GitHub, data analyzer, chart template
- **Chart Generation** — ECharts, Mermaid, Vega-Lite, Excalidraw, Markmap, stat cards, dashboards, React sandbox
- **MCP Integration** — Pre-configured MCP servers as fallbacks for built-in tools
- **Auth System** — JWT-based authentication + guest mode
- **Real-time** — WebSocket-based agent communication via Durable Objects
- **File Upload** — CSV, JSON, XLSX, PDF, DOCX parsing with chart recommendations

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    ChatWithMe-2                          │
│                                                          │
│  ┌──────────────┐   ┌──────────────┐   ┌─────────────┐ │
│  │  React + Vite │   │  Hono Server │   │ ChatAgentV2 │ │
│  │  (Frontend)   │◄──│  (Routes)    │──►│  (Durable   │ │
│  │              │   │              │   │   Object)   │ │
│  └──────────────┘   └──────────────┘   └──────┬──────┘ │
│                                                │        │
│                     ┌──────────────────────────┤        │
│                     │                          │        │
│              ┌──────▼──────┐           ┌───────▼──────┐ │
│              │ Built-in    │           │ MCP Servers  │ │
│              │ Tools (11)  │           │ (fallback)   │ │
│              │ • Serper    │           │ • web-search │ │
│              │ • Jina Read │           │ • web-reader │ │
│              │ • Weather   │           │ • zread      │ │
│              │ • Currency  │           └──────────────┘ │
│              │ • Math/etc. │                            │
│              └─────────────┘                            │
└─────────────────────────────────────────────────────────┘
```

## Running

```sh
npm install --legacy-peer-deps   # once
npm run dev                      # local dev server on :8787
npm run test:run                 # run all tests
npm run deploy                   # typecheck → build → deploy → verify
```

Database migrations:

```sh
npm run db:migrate:local
npm run db:migrate:prod
```

## Deployment

**ALWAYS use `npm run deploy`**, never raw `wrangler deploy`.

The deploy pipeline runs: `typecheck → vite build → wrangler deploy → verify-deploy`. Skipping `vite build` causes stale Worker code to be deployed since the Worker bundle is produced by Vite, not wrangler.

`npm run deploy:raw` is available for quick deploys (skips typecheck + verify, but still builds).

## Project Structure

```
src/
├── server.ts                    # Hono app entry point
├── mcp-config.ts                # Pre-configured MCP servers
├── demos/chat/
│   ├── chat-agent.ts            # ChatAgentV2 (Durable Object)
│   ├── system-prompt.ts         # System prompt with chart knowledge
│   ├── model-utils.ts           # Tool kind resolution & arg normalization
│   ├── builtin-tools/
│   │   ├── web-search.ts        # DuckDuckGo search (primary)
│   │   └── web-reader.ts        # Jina Reader (primary)
│   └── runtime/
│       ├── state-runtime.ts     # Immutable state updates
│       ├── tool-runtime.ts      # Tool execution with retry
│       ├── approval-runtime.ts  # Tool approval workflow
│       ├── mcp-server-runtime.ts # MCP connection management
│       ├── model-execution.ts   # LLM call orchestration
│       └── chat-methods.ts      # Agent callable methods
├── server/routes/               # Hono route handlers
├── features/chat/               # Client-side chat services & hooks
├── components/                  # React UI components
└── i18n/                        # Internationalization
```

## Testing

```sh
npm run test:run                                  # unit tests (vitest)
python3 scripts/benchmark-prompt.py <label>       # tool call benchmark (23 queries, ~5 min)
```

The benchmark sends test queries to production via `curl`, checks `_debug.toolCalls` in responses, and scores whether the correct tools were called. Results go to `scripts/benchmark-results-<label>.jsonl`. Run before and after any tool rule change. See `docs/developer-pitfalls.md` #16 for details.

### Debugging tool calls in production

Append `?debug_token=TOKEN` to any `/api/chat` POST to get `_debug.toolCalls` in the response — shows which tools fired, with what args, and how long each took. Tool call rules live in three files that must stay consistent: `system-prompt.ts`, `builtin-tools/*.ts` descriptions, and `tool-runtime.ts` `BUILTIN_TOOL_LIST`. See [AGENTS.md](AGENTS.md) and [docs/developer-pitfalls.md](docs/developer-pitfalls.md) for the full debugging checklist.

## Documentation

- **Architecture Plan**: [docs/official-architecture-refactor-execution-plan.md](docs/official-architecture-refactor-execution-plan.md)
- **Project Instructions**: [CLAUDE.md](CLAUDE.md)

## Related Projects

### mcp-client-tool (MCP Server Manager)

A standalone tool for managing MCP server connections, deployed at:

| Resource       | URL                                         |
| -------------- | ------------------------------------------- |
| **Production** | https://mcp-client-tool.3we.org             |
| **GitHub**     | https://github.com/telleroutlook/mcp-client |

> 📖 For detailed documentation, see the [mcp-client README](https://github.com/telleroutlook/mcp-client#readme).
