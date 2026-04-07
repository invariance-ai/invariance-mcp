import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

import { loadConfig } from './lib/config.js';
import { InvarianceClient } from './lib/client.js';
import { handleToolError } from './lib/errors.js';

import { whoamiTool } from './tools/whoami.js';
import { listTracesTool } from './tools/list-traces.js';
import { getTraceTool } from './tools/get-trace.js';
import { queryTool } from './tools/query.js';
import { listMonitorsTool } from './tools/list-monitors.js';
import { runMonitorTool } from './tools/run-monitor.js';
import { listSignalsTool } from './tools/list-signals.js';
import { getSessionTool } from './tools/get-session.js';
import { searchDocsTool } from './tools/search-docs.js';
import { listDatasetsTool } from './tools/list-datasets.js';
import { listEvalsTool } from './tools/list-evals.js';
import { createMonitorTool } from './tools/create-monitor.js';
import { createDatasetTool } from './tools/create-dataset.js';
import { getMonitorTool } from './tools/get-monitor.js';
import { getEvalTool } from './tools/get-eval.js';

import { troubleshootingPrompt } from './prompts/troubleshooting.js';
import { monitorInvestigationPrompt } from './prompts/monitor-investigation.js';
import { traceAnalysisPrompt } from './prompts/trace-analysis.js';

import { getDocContent, VALID_TOPICS } from './resources/docs.js';

export function createServer(): McpServer {
  const config = loadConfig();
  const client = new InvarianceClient(config.apiKey, config.baseUrl);

  const server = new McpServer({
    name: 'Invariance',
    version: '0.1.0',
  });

  // ── Tools ──────────────────────────────────────────────────────────

  server.tool(
    whoamiTool.name,
    whoamiTool.description,
    {},
    async () => {
      try {
        return await whoamiTool.execute(client, {});
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    listTracesTool.name,
    listTracesTool.description,
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of traces to return (1-100, default 20)'),
      status: z
        .string()
        .optional()
        .describe('Filter by trace status (e.g. "completed", "error")'),
      cursor: z
        .string()
        .optional()
        .describe('Pagination cursor from a previous response'),
    },
    async (input) => {
      try {
        return await listTracesTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    getTraceTool.name,
    getTraceTool.description,
    {
      trace_id: z.string().min(1).describe('The ID of the trace to retrieve'),
    },
    async (input) => {
      try {
        return await getTraceTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    queryTool.name,
    queryTool.description,
    {
      prompt: z
        .string()
        .min(1)
        .describe(
          'Natural language query to analyze your observability data',
        ),
    },
    async (input) => {
      try {
        return await queryTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    listMonitorsTool.name,
    listMonitorsTool.description,
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe(
          'Maximum number of monitors to return (1-100, default 20)',
        ),
      status: z
        .string()
        .optional()
        .describe('Filter by monitor status (e.g. "active", "paused")'),
    },
    async (input) => {
      try {
        return await listMonitorsTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    runMonitorTool.name,
    runMonitorTool.description,
    {
      monitor_id: z
        .string()
        .min(1)
        .describe('The ID of the monitor to run'),
    },
    async (input) => {
      try {
        return await runMonitorTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    listSignalsTool.name,
    listSignalsTool.description,
    {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe('Maximum number of signals to return (1-100, default 20)'),
    },
    async (input) => {
      try {
        return await listSignalsTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    getSessionTool.name,
    getSessionTool.description,
    {
      session_id: z
        .string()
        .min(1)
        .describe('The ID of the session to retrieve'),
    },
    async (input) => {
      try {
        return await getSessionTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    searchDocsTool.name,
    searchDocsTool.description,
    {
      query: z
        .string()
        .min(1)
        .describe('Search query for Invariance documentation'),
    },
    async (input) => {
      try {
        return await searchDocsTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    listDatasetsTool.name,
    listDatasetsTool.description,
    {
      agent_id: z
        .string()
        .optional()
        .describe('Filter datasets by agent ID'),
    },
    async (input) => {
      try {
        return await listDatasetsTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    listEvalsTool.name,
    listEvalsTool.description,
    {
      suite_id: z
        .string()
        .optional()
        .describe('Filter evaluation runs by suite ID'),
      agent_id: z
        .string()
        .optional()
        .describe('Filter evaluation runs by agent ID'),
      status: z
        .string()
        .optional()
        .describe('Filter evaluation runs by status'),
      dataset_id: z
        .string()
        .optional()
        .describe('Filter evaluation runs by dataset ID'),
    },
    async (input) => {
      try {
        return await listEvalsTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    createMonitorTool.name,
    createMonitorTool.description,
    {
      name: z.string().min(1).describe('Name for the new monitor'),
      natural_language: z
        .string()
        .min(1)
        .describe('Natural-language rule describing what the monitor should detect'),
      agent_id: z
        .string()
        .optional()
        .describe('Optional agent ID to scope the monitor'),
      severity: z
        .enum(['low', 'medium', 'high', 'critical'])
        .optional()
        .describe('Signal severity when the monitor triggers'),
      webhook_url: z
        .string()
        .url()
        .optional()
        .describe('Optional webhook URL to notify when the monitor triggers'),
    },
    async (input) => {
      try {
        return await createMonitorTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    createDatasetTool.name,
    createDatasetTool.description,
    {
      name: z.string().min(1).describe('Name for the new dataset'),
      description: z
        .string()
        .min(1)
        .describe('Description of the dataset'),
      agent_id: z
        .string()
        .optional()
        .describe('Optional agent ID to associate with the dataset'),
    },
    async (input) => {
      try {
        return await createDatasetTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    getMonitorTool.name,
    getMonitorTool.description,
    {
      monitor_id: z
        .string()
        .min(1)
        .describe('The ID of the monitor to retrieve'),
    },
    async (input) => {
      try {
        return await getMonitorTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  server.tool(
    getEvalTool.name,
    getEvalTool.description,
    {
      eval_id: z
        .string()
        .min(1)
        .describe('The ID of the evaluation to retrieve'),
    },
    async (input) => {
      try {
        return await getEvalTool.execute(client, input);
      } catch (error) {
        handleToolError(error);
      }
    },
  );

  // ── Prompts ────────────────────────────────────────────────────────

  server.prompt(
    troubleshootingPrompt.name,
    troubleshootingPrompt.description,
    {
      issue_description: z
        .string()
        .describe('Description of the issue you are experiencing'),
    },
    (input) => {
      return troubleshootingPrompt.render(input);
    },
  );

  server.prompt(
    monitorInvestigationPrompt.name,
    monitorInvestigationPrompt.description,
    {
      monitor_id: z
        .string()
        .describe('The ID of the monitor to investigate'),
    },
    (input) => {
      return monitorInvestigationPrompt.render(input);
    },
  );

  server.prompt(
    traceAnalysisPrompt.name,
    traceAnalysisPrompt.description,
    {
      trace_id: z
        .string()
        .describe('The ID of the trace to analyze'),
    },
    (input) => {
      return traceAnalysisPrompt.render(input);
    },
  );

  // ── Resources ──────────────────────────────────────────────────────

  server.resource(
    'invariance-docs',
    'invariance://docs/{topic}',
    {
      description: `Invariance documentation. Available topics: ${VALID_TOPICS.join(', ')}`,
      mimeType: 'text/markdown',
    },
    async (uri) => {
      const topic = uri.pathname.replace(/^\/\/docs\//, '').replace(/^\//, '');
      const doc = getDocContent(topic);

      if (!doc) {
        return {
          contents: [
            {
              uri: uri.href,
              mimeType: 'text/plain',
              text: `Unknown topic: "${topic}". Available topics: ${VALID_TOPICS.join(', ')}`,
            },
          ],
        };
      }

      return {
        contents: [
          {
            uri: uri.href,
            mimeType: 'text/markdown',
            text: doc.content,
          },
        ],
      };
    },
  );

  return server;
}

export async function startServer(): Promise<void> {
  const config = loadConfig();

  if (config.transport === 'sse') {
    const { connectHttp } = await import('./transport.js');
    await connectHttp(createServer, config.port);
  } else {
    const { connectStdio } = await import('./transport.js');
    await connectStdio(createServer());
  }
}
