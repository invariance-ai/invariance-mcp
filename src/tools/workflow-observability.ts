import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, registerReadTool } from '../lib/util.js';

export function registerWorkflowObservabilityTools(
  server: McpServer,
  client: InvarianceClient,
): void {
  registerReadTool(
    server,
    'invariance_workflow_observability_list',
    'List workflow observability rollups (per workflow_key: execution/open/closed counts, evidence mix, cost & token totals).',
    {},
    async () => jsonResult(await client.get('/v1/workflow-observability')),
  );

  registerReadTool(
    server,
    'invariance_workflow_observability_get',
    'Get the observability rollup for one workflow by key.',
    { workflow_key: z.string().describe('Workflow key, e.g. "support.escalation".') },
    async ({ workflow_key }) => {
      const res = await client.get<{ rollup: unknown }>(
        `/v1/workflow-observability/${encodeURIComponent(workflow_key)}`,
      );
      return jsonResult(res.rollup);
    },
  );

  registerReadTool(
    server,
    'invariance_workflow_observability_executions',
    'List per-execution health for a workflow (status, stale flag, health, reasons, evidence mix, cost/tokens).',
    { workflow_key: z.string().describe('Workflow key, e.g. "support.escalation".') },
    async ({ workflow_key }) =>
      jsonResult(
        await client.get(
          `/v1/workflow-observability/${encodeURIComponent(workflow_key)}/executions`,
        ),
      ),
  );
}
