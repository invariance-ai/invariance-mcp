# @invariance/mcp

An MCP (Model Context Protocol) server that connects AI coding agents to the [Invariance](https://invariance.ai) observability platform. It gives tools like Claude Desktop, Cursor, and Claude Code direct access to your runs, nodes, monitors, signals, findings, reviews, and more.

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
| `INVARIANCE_API_URL` | No | `https://api.useinvariance.com` | API base URL (deprecated alias: `INVARIANCE_BASE_URL`) |
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

The server exposes **37 tools** covering the full Invariance API. Names follow `invariance_<resource>_<action>`.

**Runs** (`invariance_run_*`)
`start`, `get`, `list`, `finish`, `fail`, `verify`, `metrics`

**Nodes** (`invariance_node_*`)
`write`, `list`

**Monitors** (`invariance_monitor_*`)
`create`, `list`, `get`, `update`, `pause`, `resume`, `evaluate`, `executions`, `findings`

**Signals** (`invariance_signal_*`)
`emit`, `list`, `get`, `acknowledge`, `resolve`

**Findings** (`invariance_finding_*`)
`list`, `get`, `update`

**Reviews** (`invariance_review_*`)
`list`, `get`, `claim`, `unclaim`, `resolve`

**Agents** (`invariance_agent_*`)
`me`, `set_key`

**Insights**
`invariance_narrative_get` (LLM-synthesized run summary), `invariance_ask` (turn-based Q&A over your KB + runs), `invariance_kb_pages_list`, `invariance_kb_page_get`

For complex object arguments (monitor body, signal data, node input/output, run metadata) tools accept JSON-encoded strings, which the server parses before dispatching to the API.

### Legacy tool aliases

The original 6 tool names from earlier versions are kept as aliases so existing client configs keep working: `invariance_create_run`, `invariance_get_run`, `invariance_list_runs`, `invariance_write_node`, `invariance_list_nodes`, `invariance_verify_run`.

### HTTP transport

To run the server over Streamable HTTP instead of stdio:

```bash
INVARIANCE_API_KEY=your-api-key INVARIANCE_MCP_TRANSPORT=http INVARIANCE_MCP_PORT=3000 npx @invariance/mcp
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

If using a custom `INVARIANCE_API_URL`, verify the URL is reachable.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
