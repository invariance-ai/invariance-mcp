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
| `INVARIANCE_MCP_TRANSPORT` | No | `stdio` | Transport mode: `stdio` or `http` (`sse` is accepted as a deprecated alias for `http`) |
| `INVARIANCE_MCP_PORT` | No | `3000` | Port for SSE/HTTP transport |
| `INVARIANCE_TIMEOUT` | No | `30000` | Request timeout in milliseconds |

Get your API key at [platform.useinvariance.com/settings/api-keys](https://platform.useinvariance.com/settings/api-keys). For headless agents, issue a one-time bootstrap token from the dashboard and redeem it with `inv login --bootstrap <token>` before starting the MCP server.

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

The server exposes **150 tools** (plus 6 legacy aliases) covering Invariance API workflows. Names follow `invariance_<resource>_<action>`.

See [`../COVERAGE_MATRIX.md`](../COVERAGE_MATRIX.md) for the cross-surface (TS / Python / CLI / MCP) coverage matrix, and [`AGENTS.md`](./AGENTS.md) for an agent-facing tool guide.

Every tool carries MCP annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`) so agent clients (Claude Desktop, etc.) can distinguish inspection tools from state-changing ones without parsing prose descriptions.

## Recommended tool-calling workflow

For instrumentation setup, make this the default sequence in agent instructions:

1. Call `invariance_doctor` to verify the API key and platform reachability.
2. Create or reuse a workflow instance with `invariance_case_create`.
3. Start a run linked to that case with `invariance_run_start`.
4. Call `invariance_node_write` for each LLM call, tool call, retrieval, decision, handoff, external action, and error.
5. Call `invariance_workflow_event_create` for semantic business facts operators should filter on.
6. Finish or fail the run with `invariance_run_finish` or `invariance_run_fail`.
7. Inspect `invariance_workflow_observability_get`, create useful dashboard panels with `invariance_saved_view_create`, and ask Cortex with `cortex_ask`.

Good first saved views are task usage by `action_type`, failed tool calls, cost by model, stale open executions, review queue by severity, and workflow outcomes. Cortex can also suggest dashboard panels; ask it what a workflow operator should see, inspect the SQL-like structured query shape, then persist the useful query as a saved view.

**Cases** (`invariance_case_*`)
`create`, `get`, `list`, `update`, `close`, `evidence`, `events_list`, `event_create` — workflow instances that group runs as evidence (create with `workflow_key` / `tenant_id` / `end_user_id`; attach evidence and events; close with an outcome).

**Workflows** (`invariance_workflow_*`)
`list`, `get`, `create`, `update`, `delete`, `event_list` — the workflow definitions that cases instantiate.

**Runs** (`invariance_run_*`)
`start`, `get`, `list`, `finish`, `fail`, `verify`, `metrics`, `operational_graph`, `llm_calls`, `node_types`, `node_type_metrics`, `fork`, `inspect`

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
`me`, `set_key`, `create`, `list`, `get`

**Operators** (`invariance_operator_*`)
`me`, `create`, `list`, `get` — the unified actor model. Every Claude Code session, autonomous agent, and human teammate is an operator. Use `operator_type='agent'` for autonomous workers, `operator_type='human'` for teammates whose screen recordings, microphone capture, meetings, and Granola notes feed the company brain.

**Sessions** (`invariance_session_*`)
`create`, `list`, `get`, `append_note`, `attach_run`, `record_summary_to_kb` — capture sessions that group runs, notes, and KB summaries under a single operator's work.

**Captures** (`invariance_capture_*`)
`create`, `list`, `get`, `update`, `link`, `links`, `unlink` — standalone evidence (sessions, conversations, traces). `link` attaches a capture to any evidence-graph target: pass `run_id` for the legacy run link, or `target_type` (`run` | `case` | `workflow_event` | `node`, defaults to `run`) + `target_id` to create a richer link with an optional `link_type`. `links` lists all links; `unlink` takes `link_id` to detach a specific link (or clears `run_id` when omitted).

**Memory** (`invariance_memory_*`)
`read`, `write` — record what the agent looked up or wrote about a subject (customer, account, policy, …).

**Evals** (`invariance_eval_*`)
`dataset_create`, `dataset_list`, `dataset_get`, `dataset_append_example`, `dataset_examples_list`, `scorer_create`, `scorer_list`, `scorers_list_builtin`, `suite_create`, `suite_list`, `suite_get`, `case_create`, `case_create_from_run`, `case_list`, `suite_run`, `run_get`, `run_results`, `experiment_run`, `experiment_compare` — author datasets/scorers/suites, kick off eval runs against agents or recipes, score them with built-in scorers (exact_match, contains, numeric_tolerance, json_match, levenshtein), and diff a candidate run against a baseline.

**Insights**
`invariance_narrative_get` (LLM-synthesized run summary), `invariance_ask` (turn-based Q&A over your KB + runs), `invariance_kb_pages_list`, `invariance_kb_page_get`, `invariance_kb_page_create`, `invariance_kb_page_update`, `invariance_kb_page_delete`, `invariance_kb_session_create`, `invariance_kb_session_delete`, `invariance_kb_session_list_messages`, `invariance_kb_session_append_message`.

**Operational debugging** — agent-friendly views over runs.
`invariance_run_operational_graph` (entities, edges, findings, and a completeness score for a run), `invariance_run_llm_calls` (paginated LLM calls for a run), `invariance_run_node_types` / `invariance_run_node_type_metrics` (typed-node aggregates), `invariance_run_fork` (branch a run from a node for replay/what-if), `invariance_run_inspect` (composite triage view: run + metrics + narrative + recent nodes + open findings, mirrors `inv run inspect`).

**Cross-run metrics**
`invariance_metrics_overview` (total runs / nodes / errors / cost over a window), `invariance_metrics_agents` (per-agent usage rollup).

**Workflow observability** (`invariance_workflow_observability_*`) — read
`list` (rollups across all workflows), `get` (one workflow's rollup), `executions` (per-execution health: status, stale flag, reasons, evidence mix). All read-only.

**Divergences** (`invariance_divergence_*`)
`list` (read; filter by run/kind/severity/status), `get` (read), `update` (write — transition status: open | accepted | dismissed | converted_to_monitor).

**Saved views** (`invariance_saved_view_*`)
`list` (read), `get` (read), `create` (write), `update` (write), `run` (write — pass EITHER `saved_view_id` OR `source`+`spec`), `delete` (destructive).

**Receipts** (`invariance_receipt_*`)
`create` (write), `batch` (write), `list` (read), `get` (read) — proofs that external actions happened. **`create` and `batch` require an agent API key** (operator tokens get 403).

**Guardrails** (`invariance_guardrail_*`)
`list` (read; filter by status/recipe_id), `get` (read), `create` (write), `update` (write), `promote` (write — lifecycle: suggested → accepted → shadow → active_monitor → rejected).

**Recipes** (`invariance_recipe_*`)
`list` (read), `get` (read; by ID or slug), `update` (write — `enabled`, `default_mode`). Built-in operational-check registry; promote one into a guardrail with `invariance_guardrail_create`.

**Cortex** (`cortex_*`)
`cortex_ask`, `cortex_launch`, `cortex_list_jobs`, `cortex_retry_job`, `cortex_job_runs`, `cortex_run_job`, `cortex_run_eval`, `cortex_run_counterfactual`, `cortex_get_job`, `cortex_get_result` — ask governed, cited operational questions; create Cortex jobs; poll status/results; inspect attempt history.

**Health**
`invariance_doctor` — server + API + auth health check. Mirrors `inv doctor --json`. Use this first when an agent connects to verify its setup before issuing other calls.

For complex object arguments (monitor body, signal data, node input/output, run metadata) tools accept JSON-encoded strings, which the server parses before dispatching to the API.

### Legacy tool aliases

The original 6 tool names from earlier versions are kept as aliases so existing client configs keep working: `invariance_create_run`, `invariance_get_run`, `invariance_list_runs`, `invariance_write_node`, `invariance_list_nodes`, `invariance_verify_run`.

### HTTP transport

To run the server over Streamable HTTP instead of stdio:

```bash
INVARIANCE_MCP_TRANSPORT=http INVARIANCE_MCP_PORT=3000 npx @invariance/mcp
```

The server exposes a Streamable HTTP endpoint at `http://127.0.0.1:3000/mcp` and a health check at `http://127.0.0.1:3000/health`.

#### Authentication (HTTP)

Unlike stdio (which reads `INVARIANCE_API_KEY` from the environment, single-tenant), the HTTP transport authenticates **per session** from the client request. Each MCP client must send its own API key in the `Authorization: Bearer …` header on the `initialize` request. That key is bound to the resulting session and used for every tool call made through that session.

This means a single hosted MCP server can serve multiple distinct customers; each connecting client provides its own bearer and only sees data scoped to that key. `INVARIANCE_API_KEY` is **not required** in the environment for HTTP mode.

MCP clients that support HTTP transport can connect using the `/mcp` endpoint URL with their own API key as the bearer.

## Troubleshooting

### "INVARIANCE_API_KEY environment variable is required"

Make sure you've set the `INVARIANCE_API_KEY` environment variable in your MCP client configuration. See the setup guides above.

### Server not appearing in your MCP client

1. Verify the config file path is correct for your client
2. Restart the client after editing the config
3. Check that `npx @invariance/mcp` runs without errors in your terminal

### Authentication errors

Verify your API key is valid at [platform.useinvariance.com/settings/api-keys](https://platform.useinvariance.com/settings/api-keys).

### Connection timeouts

If using a custom `INVARIANCE_API_URL`, verify the URL is reachable.

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md).

## License

MIT
