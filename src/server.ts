import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { loadConfig } from './lib/config.js';
import { InvarianceClient } from './lib/client.js';
import { jsonResult, parseJsonArg } from './lib/util.js';
import { connectStdio, connectHttp } from './transport.js';

import { registerRunTools } from './tools/runs.js';
import { registerNodeTools } from './tools/nodes.js';
import { registerMonitorTools } from './tools/monitors.js';
import { registerSignalTools } from './tools/signals.js';
import { registerFindingTools } from './tools/findings.js';
import { registerReviewTools } from './tools/reviews.js';
import { registerAgentTools } from './tools/agents.js';
import { registerInsightTools } from './tools/insights.js';
import { registerOperationalTools } from './tools/operational.js';
import { registerMemoryTools } from './tools/memory.js';
import { registerEvalTools } from './tools/evals.js';
import { registerOperatorTools } from './tools/operators.js';
import { registerSessionTools } from './tools/sessions.js';
import { registerCaseTools } from './tools/cases.js';

export const SERVER_NAME = 'invariance';
export const SERVER_VERSION = '0.3.0';

export interface CreateServerOptions {
  /**
   * Override the API key. When unset, falls back to INVARIANCE_API_KEY via
   * loadConfig(). Used by the HTTP transport to bind a per-request bearer
   * token to a server instance, so a hosted MCP can serve multiple tenants.
   */
  apiKey?: string;
  baseUrl?: string;
}

export function createServer(options: CreateServerOptions = {}): McpServer {
  const config = loadConfig({ requireApiKey: options.apiKey === undefined });
  const apiKey = options.apiKey ?? config.apiKey;
  const baseUrl = options.baseUrl ?? config.baseUrl;
  const client = new InvarianceClient(apiKey, baseUrl);

  const server = new McpServer({
    name: SERVER_NAME,
    version: SERVER_VERSION,
  });

  registerRunTools(server, client);
  registerNodeTools(server, client);
  registerMonitorTools(server, client);
  registerSignalTools(server, client);
  registerFindingTools(server, client);
  registerReviewTools(server, client);
  registerAgentTools(server, client);
  registerInsightTools(server, client);
  registerOperationalTools(server, client);
  registerMemoryTools(server, client);
  registerEvalTools(server, client);
  registerOperatorTools(server, client);
  registerSessionTools(server, client);
  registerCaseTools(server, client);
  registerLegacyAliases(server, client);

  return server;
}

// Legacy tool names from the prior MCP scaffold. Kept so existing client
// configs keep working while users migrate to the modern names. These will be
// removed in the next minor release.
const warnedLegacyAliases = new Set<string>();
function warnLegacyAlias(legacyName: string, modernName: string): void {
  if (warnedLegacyAliases.has(legacyName)) return;
  warnedLegacyAliases.add(legacyName);
  process.stderr.write(
    `warning: MCP tool "${legacyName}" is deprecated; use "${modernName}" instead. Legacy aliases will be removed in the next minor release.\n`,
  );
}

function registerLegacyAliases(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_create_run',
    'Alias of invariance_run_start',
    { name: z.string().optional() },
    async ({ name }) => {
      warnLegacyAlias('invariance_create_run', 'invariance_run_start');
      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      const res = await client.post<{ run: unknown }>('/v1/runs', body);
      return jsonResult(res.run);
    },
  );

  server.tool(
    'invariance_get_run',
    'Alias of invariance_run_get',
    { id: z.string() },
    async ({ id }) => {
      warnLegacyAlias('invariance_get_run', 'invariance_run_get');
      const res = await client.get<{ run: unknown }>(
        `/v1/runs/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.run);
    },
  );

  server.tool(
    'invariance_list_runs',
    'Alias of invariance_run_list',
    {},
    async () => {
      warnLegacyAlias('invariance_list_runs', 'invariance_run_list');
      return jsonResult(await client.get('/v1/runs'));
    },
  );

  server.tool(
    'invariance_write_node',
    'Alias of invariance_node_write',
    {
      run_id: z.string(),
      action_type: z.string(),
      input: z.string().optional(),
      output: z.string().optional(),
    },
    async ({ run_id, action_type, input, output }) => {
      warnLegacyAlias('invariance_write_node', 'invariance_node_write');
      const node: Record<string, unknown> = { run_id, action_type };
      const i = parseJsonArg('input', input);
      if (i !== undefined) node.input = i;
      const o = parseJsonArg('output', output);
      if (o !== undefined) node.output = o;
      const res = await client.post<{ data: unknown[] }>('/v1/nodes', [node]);
      return jsonResult(res.data[0]);
    },
  );

  server.tool(
    'invariance_list_nodes',
    'Alias of invariance_node_list',
    { run_id: z.string() },
    async ({ run_id }) => {
      warnLegacyAlias('invariance_list_nodes', 'invariance_node_list');
      return jsonResult(await client.get(`/v1/runs/${encodeURIComponent(run_id)}/nodes`));
    },
  );

  server.tool(
    'invariance_verify_run',
    'Alias of invariance_run_verify',
    { id: z.string() },
    async ({ id }) => {
      warnLegacyAlias('invariance_verify_run', 'invariance_run_verify');
      return jsonResult(await client.get(`/v1/runs/${encodeURIComponent(id)}/verify`));
    },
  );
}

export async function startServer(): Promise<void> {
  // HTTP transport authenticates each session from the request's Bearer
  // header rather than from a process-wide env key, so we don't require
  // INVARIANCE_API_KEY at boot for that mode.
  const httpMode = (process.env.INVARIANCE_MCP_TRANSPORT === 'http' ||
    process.env.INVARIANCE_MCP_TRANSPORT === 'sse');
  const config = loadConfig({ requireApiKey: !httpMode });
  if (config.transport === 'http') {
    await connectHttp((apiKey) => createServer({ apiKey }), config.port);
    return;
  }
  const server = createServer();
  await connectStdio(server);
}
