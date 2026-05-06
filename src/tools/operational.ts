import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg } from '../lib/util.js';

export function registerOperationalTools(
  server: McpServer,
  client: InvarianceClient,
): void {
  server.tool(
    'invariance_run_operational_graph',
    'Get the operational graph for a run — node-level DAG with edges, parent links, and aggregate stats. Useful for agent debugging: returns {nodes, edges, root_node_ids, ...}. Cite node IDs back when reporting findings.',
    {
      run_id: z.string().describe('Run ID, e.g. "run_abc123".'),
    },
    async ({ run_id }) =>
      jsonResult(
        await client.get(`/v1/runs/${encodeURIComponent(run_id)}/operational-graph`),
      ),
  );

  server.tool(
    'invariance_run_llm_calls',
    'List LLM calls for a run in append order (paginated). Each entry includes model, tokens, cost, latency, and the underlying node_id.',
    {
      run_id: z.string(),
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(500).optional(),
    },
    async ({ run_id, cursor, limit }) =>
      jsonResult(
        await client.get(`/v1/runs/${encodeURIComponent(run_id)}/llm-calls`, {
          cursor,
          limit,
        }),
      ),
  );

  server.tool(
    'invariance_run_node_types',
    'List the typed-node kinds present in a run (one row per registered type with a count). Pair with invariance_run_node_type_metrics for per-type aggregates.',
    { run_id: z.string() },
    async ({ run_id }) =>
      jsonResult(
        await client.get(`/v1/runs/${encodeURIComponent(run_id)}/node-types`),
      ),
  );

  server.tool(
    'invariance_run_node_type_metrics',
    'Aggregate metrics for a single typed-node kind within a run (counts, latency stats, custom-field roll-ups).',
    {
      run_id: z.string(),
      type: z.string().describe('Node type as registered via defineNodeType / invariance_node_type_register.'),
    },
    async ({ run_id, type }) =>
      jsonResult(
        await client.get(
          `/v1/runs/${encodeURIComponent(run_id)}/node-types/${encodeURIComponent(type)}/metrics`,
        ),
      ),
  );

  server.tool(
    'invariance_run_fork',
    'Fork a run from a specific node — creates a new run that branches off the parent at from_node_id. Useful for "what-if" replays during agent debugging.',
    {
      id: z.string().describe('Parent run ID.'),
      from_node_id: z.string().describe('Node in the parent run to branch from.'),
      name: z.string().optional(),
      metadata: z
        .string()
        .optional()
        .describe('Free-form metadata as a JSON object string.'),
    },
    async ({ id, from_node_id, name, metadata }) => {
      const body: Record<string, unknown> = { from_node_id };
      if (name !== undefined) body.name = name;
      const meta = parseJsonArg('metadata', metadata);
      if (meta !== undefined) body.metadata = meta;
      const res = await client.post<{ run: unknown }>(
        `/v1/runs/${encodeURIComponent(id)}/fork`,
        body,
      );
      return jsonResult(res.run);
    },
  );

  server.tool(
    'invariance_metrics_overview',
    'Cross-run rollup over a time window: total runs, nodes, errors, cost, latency, etc. Use this to ground "what is happening across my agents" questions.',
    {
      window_hours: z
        .number()
        .int()
        .positive()
        .max(24 * 90)
        .optional()
        .describe('Lookback window in hours (default 24, max 90 days).'),
    },
    async ({ window_hours }) =>
      jsonResult(
        await client.get('/v1/metrics/overview', { window_hours }),
      ),
  );

  server.tool(
    'invariance_metrics_agents',
    'Per-agent usage rollup over a time window: run counts, node counts, cost. Useful for agent-by-agent comparison.',
    {
      window_hours: z
        .number()
        .int()
        .positive()
        .max(24 * 90)
        .optional()
        .describe('Lookback window in hours (default 24, max 90 days).'),
    },
    async ({ window_hours }) =>
      jsonResult(
        await client.get('/v1/metrics/agents', { window_hours }),
      ),
  );

  server.tool(
    'invariance_run_inspect',
    'Composite triage view for a run — fetches run, metrics, narrative, recent nodes, and open findings in parallel and returns {run, metrics, narrative, recent_nodes, open_findings}. Mirrors `inv run inspect`. Best first call when an agent is asked to debug a run.',
    {
      id: z.string(),
      limit: z
        .number()
        .int()
        .positive()
        .max(500)
        .optional()
        .describe('Max recent_nodes returned (default 50).'),
    },
    async ({ id, limit }) => {
      const lim = limit ?? 50;
      const findingsLimit = Math.max(lim, 50);

      const [run, metrics, narrative, nodesPage, findingsPage] = await Promise.all([
        client
          .get<{ run: unknown }>(`/v1/runs/${encodeURIComponent(id)}`)
          .then((r) => r.run)
          .catch(() => null),
        client
          .get(`/v1/runs/${encodeURIComponent(id)}/metrics`)
          .catch(() => null),
        client
          .get<{ narrative: unknown }>(`/v1/runs/${encodeURIComponent(id)}/narrative`)
          .then((r) => r.narrative)
          .catch(() => null),
        client
          .get<{ data: unknown[]; next_cursor: string | null }>(
            `/v1/runs/${encodeURIComponent(id)}/nodes`,
            { limit: lim },
          )
          .catch(() => ({ data: [] as unknown[], next_cursor: null })),
        client
          .get<{ data: Array<{ run_id?: string; status?: string }>; next_cursor: string | null }>(
            '/v1/findings',
            { limit: findingsLimit },
          )
          .catch(() => ({
            data: [] as Array<{ run_id?: string; status?: string }>,
            next_cursor: null,
          })),
      ]);

      const open_findings = (findingsPage.data ?? []).filter(
        (f) => f.run_id === id && f.status === 'open',
      );

      return jsonResult({
        run,
        metrics,
        narrative,
        recent_nodes: nodesPage.data ?? [],
        open_findings,
      });
    },
  );
}
