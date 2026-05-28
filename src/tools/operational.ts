import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg, registerReadTool, registerWriteTool } from '../lib/util.js';

interface NodeLike {
  id: string;
  action_type: string;
  type?: string | null;
  metadata?: Record<string, unknown>;
  output?: unknown;
  error?: unknown;
  duration_ms?: number | null;
}

function summarizeRunObservability(runId: string, nodes: NodeLike[]) {
  const steps = nodes.map((node) => {
    const metadata = node.metadata ?? {};
    const llm = readObject(metadata.llm);
    const output = readObject(node.output);
    return {
      node_id: node.id,
      action_type: node.action_type,
      type: node.type ?? null,
      kind: kindForNode(node),
      status: node.error == null ? 'ok' : 'error',
      input_tokens: readNumber(llm.input_tokens),
      output_tokens: readNumber(llm.output_tokens),
      cache_read_tokens: readNumber(llm.cache_read_tokens),
      cache_write_tokens: readNumber(llm.cache_write_tokens),
      words_created:
        readNumber(metadata.words_created) ||
        readNumber(output.words_created) ||
        countWords(typeof output.text === 'string' ? output.text : null),
      duration_ms: node.duration_ms ?? null,
    };
  });
  const sum = (key: keyof (typeof steps)[number]) =>
    steps.reduce((acc, step) => {
      const value = step[key];
      return acc + (typeof value === 'number' ? value : 0);
    }, 0);
  return {
    run_id: runId,
    step_count: nodes.length,
    llm_call_count: steps.filter((s) => s.kind === 'llm').length,
    tool_call_count: steps.filter((s) => s.kind === 'tool').length,
    error_count: steps.filter((s) => s.status === 'error').length,
    total_input_tokens: sum('input_tokens'),
    total_output_tokens: sum('output_tokens'),
    total_cache_read_tokens: sum('cache_read_tokens'),
    total_cache_write_tokens: sum('cache_write_tokens'),
    total_words_created: sum('words_created'),
    total_duration_ms: sum('duration_ms'),
    steps,
  };
}

function kindForNode(node: NodeLike): 'llm' | 'tool' | 'message' | 'step' {
  const metadata = node.metadata ?? {};
  if (node.type === 'llm_call' || node.action_type.startsWith('llm.')) return 'llm';
  if (node.type === 'tool_call' || metadata.tool_name != null) return 'tool';
  if (node.type === 'message' || node.action_type.includes('message') || node.action_type.includes('prompt')) return 'message';
  return 'step';
}

function readObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function readNumber(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : 0;
}

function countWords(text: string | null): number {
  if (!text) return 0;
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function registerOperationalTools(
  server: McpServer,
  client: InvarianceClient,
): void {
  registerReadTool(
    server,
    'invariance_run_operational_graph',
    'Get the operational graph for a run — entities, edges, findings, a completeness score (business_object_linked, policy_context_found, owner_found, approval_context_found, downstream_state_change_found), and a missing_evidence list naming the unsupported dimensions.',
    {
      run_id: z.string().describe('Run ID, e.g. "run_abc123".'),
    },
    async ({ run_id }) =>
      jsonResult(
        await client.get(`/v1/runs/${encodeURIComponent(run_id)}/operational-graph`),
      ),
  );

  registerReadTool(
    server,
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

  registerReadTool(
    server,
    'invariance_run_node_types',
    'List the typed-node kinds present in a run (one row per registered type with a count). Pair with invariance_run_node_type_metrics for per-type aggregates.',
    { run_id: z.string() },
    async ({ run_id }) =>
      jsonResult(
        await client.get(`/v1/runs/${encodeURIComponent(run_id)}/node-types`),
      ),
  );

  registerReadTool(
    server,
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

  registerWriteTool(
    server,
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

  registerReadTool(
    server,
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

  registerReadTool(
    server,
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

  registerReadTool(
    server,
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
          .get<{ data: NodeLike[]; next_cursor: string | null }>(
            `/v1/runs/${encodeURIComponent(id)}/nodes`,
            { limit: lim },
          )
          .catch(() => ({ data: [] as NodeLike[], next_cursor: null })),
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
        observability: summarizeRunObservability(id, nodesPage.data ?? []),
        recent_nodes: nodesPage.data ?? [],
        open_findings,
      });
    },
  );
}
