# @invariance/mcp

An MCP (Model Context Protocol) server that connects AI coding agents to the [Invariance](https://invariance.ai) observability platform. It gives tools like Claude Desktop, Cursor, and Claude Code direct access to your traces, monitors, signals, and more.

MCP is an open protocol that lets AI assistants use external tools and data sources. This server implements it for Invariance, so your AI assistant can query observability data, investigate issues, and analyze agent behavior without leaving the conversation.

## Install

```bash
npm install -g @invariance/mcp
```

Or run directly with npx (recommended for MCP client configs):

```bash
npx @invariance/mcp
```

## Setup

### Environment variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `INVARIANCE_API_KEY` | Yes | — | Your Invariance API key |
| `INVARIANCE_BASE_URL` | No | `https://api.invariance.ai` | API base URL |
| `INVARIANCE_MCP_TRANSPORT` | No | `stdio` | Transport mode: `stdio` or `sse` |
| `INVARIANCE_MCP_PORT` | No | `3000` | Port for SSE/HTTP transport |
| `INVARIANCE_TIMEOUT` | No | `30000` | Request timeout in milliseconds |

Get your API key at [app.invariance.ai/settings/api-keys](https://app.invariance.ai/settings/api-keys).

### Claude Desktop

Add to your Claude Desktop config (`~/Library/Application Support/Claude/claude_desktop_config.json` on macOS):

```json
{
  "mcpServers": {
    "invariance": {
      "command": "npx",
      "args": ["-y", "@invariance/mcp"],
      "env": {
        "INVARIANCE_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Claude Code

Add to your Claude Code config (`.claude/settings.json` or `~/.claude/settings.json`):

```json
{
  "mcpServers": {
    "invariance": {
      "command": "npx",
      "args": ["-y", "@invariance/mcp"],
      "env": {
        "INVARIANCE_API_KEY": "your-api-key"
      }
    }
  }
}
```

### Cursor

Add to your Cursor MCP settings (`.cursor/mcp.json`):

```json
{
  "mcpServers": {
    "invariance": {
      "command": "npx",
      "args": ["-y", "@invariance/mcp"],
      "env": {
        "INVARIANCE_API_KEY": "your-api-key"
      }
    }
  }
}
```

## Available tools

| Tool | Description |
|------|-------------|
| `whoami` | Get information about the authenticated Invariance user and organization |
| `list_traces` | List recent traces from Invariance with optional filtering |
| `get_trace` | Get detailed information about a specific trace by ID |
| `query_invariance` | Query Invariance with a natural language prompt to analyze traces, monitors, and signals |
| `list_monitors` | List configured monitors in Invariance |
| `run_monitor` | Trigger a monitor run and return the results |
| `list_signals` | List signals detected by Invariance monitors |
| `get_session` | Get detailed information about an agent session |
| `search_docs` | Search Invariance documentation for a topic |
| `list_datasets` | List available evaluation datasets |
| `list_evals` | List evaluation runs with optional dataset filtering |
| `create_monitor` | Create a new monitor in Invariance to track agent behavior |
| `create_dataset` | Create a new evaluation dataset in Invariance |
| `get_monitor` | Get detailed information about a specific monitor including recent runs |
| `get_eval` | Get detailed results of an evaluation run |

## Available prompts

| Prompt | Description |
|--------|-------------|
| `troubleshooting` | Help troubleshoot an issue with an Invariance-monitored agent |
| `monitor-investigation` | Investigate why a monitor triggered or is failing |
| `trace-analysis` | Analyze a trace to identify issues, bottlenecks, or anomalies |

## Available resources

| URI | Description |
|-----|-------------|
| `invariance://docs/{topic}` | Invariance documentation by topic |

Topics: `getting-started`, `authentication`, `traces`, `monitors`, `signals`, `queries`, `datasets`, `evals`

### SSE/HTTP transport

To run the server in SSE/HTTP mode instead of stdio:

```bash
INVARIANCE_API_KEY=your-api-key INVARIANCE_MCP_TRANSPORT=sse INVARIANCE_MCP_PORT=3000 npx @invariance/mcp
```

The server exposes a Streamable HTTP endpoint at `http://127.0.0.1:3000/mcp` and a health check at `http://127.0.0.1:3000/health`.

MCP clients that support HTTP transport can connect using the `/mcp` endpoint URL instead of spawning a subprocess.

## Troubleshooting

### "INVARIANCE_API_KEY environment variable is required"

Make sure you've set the `INVARIANCE_API_KEY` environment variable in your MCP client configuration. See the setup guides above.

### Server not appearing in your MCP client

1. Verify the config file path is correct for your client
2. Restart the client after editing the config
3. Check that `npx @invariance/mcp` runs without errors in your terminal

### Authentication errors

Verify your API key is valid at [app.invariance.ai/settings/api-keys](https://app.invariance.ai/settings/api-keys).

### Connection timeouts

If using a custom `INVARIANCE_BASE_URL`, verify the URL is reachable.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
