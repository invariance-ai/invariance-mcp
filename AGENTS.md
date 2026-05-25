# AGENTS.md

Instructions for AI agents (Claude Desktop, Cursor, Claude Code, and any MCP client) on the tools `@invariance/mcp` exposes and how to use them against the [Invariance](https://invariance.ai) observability platform.

## What this server does

`@invariance/mcp` is an MCP server that gives an AI client direct, structured access to Invariance: it can query runs, nodes, monitors, signals, findings, reviews, cases, workflows, divergences, guardrails, receipts, and saved views, and can record traces and evidence — all as tool calls, without leaving the conversation. Tool names follow `invariance_<resource>_<action>`.

Every tool carries MCP annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`) so you can tell inspection tools from state-changing ones without reading the prose description. For complex object arguments, tools take JSON-encoded **strings** which the server parses before calling the API.

## Setup (one-time, human-assisted)

A human configures the server in the MCP client (Claude Desktop / Cursor / Claude Code) with an `INVARIANCE_API_KEY`. See [`README.md`](./README.md) for client config snippets. Agents should prompt the user to do this rather than attempt it themselves.

Call `invariance_doctor` first when you connect — it verifies server + API + auth health before you issue other calls.

## Auth model

- **Reads** accept an agent **or** operator key.
- **Receipts writes** (`invariance_receipt_create`, `invariance_receipt_batch`) require an **agent API key** — operator tokens get a `403`. All other writes work with either key.

## Tools by domain

### Core trace loop
- `invariance_run_start` / `_get` / `_list` / `_finish` / `_fail` / `_verify` — wrap a task in a run (read/write).
- `invariance_node_write` / `_list` — record tool/LLM/decision/observation nodes (read/write).
- `invariance_run_inspect`, `_operational_graph`, `_llm_calls`, `_node_types`, `_metrics`, `_fork` — triage views over a run (read; `_fork` writes).

### Observability and detection
- `invariance_monitor_*` — create/evaluate predicates over nodes/runs; `pause`/`resume`/`executions`/`findings`.
- `invariance_signal_*` — `emit`/`list`/`get`/`acknowledge`/`resolve`.
- `invariance_finding_*` — `list`/`get`/`update` (status: open | review_requested | resolved | dismissed).
- `invariance_review_*` — `list`/`get`/`claim`/`unclaim`/`resolve`.
- `invariance_divergence_list` / `_get` (read), `invariance_divergence_update` (write) — expected-vs-observed gaps; transition status to open | accepted | dismissed | converted_to_monitor.

### Workflow plane
- `invariance_workflow_*` — workflow definitions: `list`/`get`/`create`/`update`/`delete`/`event_list`.
- `invariance_case_*` — workflow instances grouping runs as evidence: `create`/`get`/`list`/`update`/`close`/`evidence`/`events_list`/`event_create`.
- `invariance_workflow_observability_list` / `_get` / `_executions` (read-only) — rollups and per-execution health (status, stale flag, reasons, evidence mix, cost/tokens) for a workflow_key.

### Controls
- `invariance_recipe_list` / `_get` (read), `invariance_recipe_update` (write) — built-in operational-check registry. `_get` accepts an ID or slug; `_update` toggles `enabled` / `default_mode`.
- `invariance_guardrail_list` / `_get` (read), `invariance_guardrail_create` / `_update` / `_promote` (write) — per-agent guardrails. Promote a recipe into a guardrail with `_create` (pass `recipe_id`), then advance its lifecycle with `_promote` (suggested → accepted → shadow → active_monitor → rejected).

### Evidence and receipts
- `invariance_capture_*` — standalone evidence (sessions, conversations): `create`/`list`/`get`/`update`/`link`/`links`/`unlink`.
- `invariance_receipt_list` / `_get` (read), `invariance_receipt_create` / `_batch` (write, **agent-key-only**) — proofs that external actions happened (stripe refunds, zendesk tickets, …). `_batch` takes a JSON array of receipt objects.
- `invariance_memory_read` / `_write` — record what the agent looked up or wrote about a subject.

### Querying and dashboards
- `invariance_saved_view_list` / `_get` (read), `_create` / `_update` / `_run` (write), `_delete` (destructive). `_run` executes a query and returns the result — pass **exactly one** of `saved_view_id` OR `source`+`spec`.
- `invariance_metrics_overview` / `_metrics_agents` — cross-run usage rollups (read).

### Knowledge, identity, async
- `invariance_kb_*`, `invariance_narrative_get`, `invariance_ask` — KB pages/sessions and Q&A.
- `invariance_agent_*`, `invariance_operator_*`, `invariance_session_*` — identity and capture sessions.
- `cortex_*` — kick off / poll async Cortex jobs.
- `invariance_eval_*` — datasets, scorers, suites, eval runs.

## Agent recipe: investigate a workflow's health

```
1. invariance_workflow_observability_list          # find a workflow with stale_open_count > 0
2. invariance_workflow_observability_executions     # workflow_key=... → which executions are unhealthy
3. invariance_divergence_list                        # run_id=..., status=open → what diverged
4. invariance_divergence_update                      # accept, dismiss, or convert_to_monitor
```

## Agent recipe: promote a control

```
1. invariance_recipe_list                            # find a relevant built-in control
2. invariance_guardrail_create                       # { recipe_id, title }
3. invariance_guardrail_promote                       # { id, to: "shadow" } then "active_monitor"
```

## Conventions

- **JSON-string args** (`spec`, `payload`, `receipt`, `receipts`, monitor `body`, …) must be valid JSON. Keep them small; reference large artifacts by ID.
- **Don't emit secrets** — inputs/outputs are stored verbatim. Redact tokens/PII before writing.
- **One run per user-facing task**; don't batch unrelated work.
- **Exactly-one rule** on `invariance_saved_view_run`: `saved_view_id` XOR (`source` + `spec`). Passing both (or neither) errors client-side.

## Failure modes

- `401 Unauthorized` → key missing/expired. Ask the user to re-set `INVARIANCE_API_KEY`.
- `403 Forbidden` on `invariance_receipt_create` / `_batch` → you're using an operator token; these need an **agent API key**.
- `404 Not Found` on an ID → deleted or belongs to another org. Don't retry; re-list.

## Reference

- Full tool list: [`README.md`](./README.md)
- Cross-surface coverage matrix: [`../COVERAGE_MATRIX.md`](../COVERAGE_MATRIX.md)
- Web docs: https://useinvariance.com/docs
- Dashboard: https://console.useinvariance.com
