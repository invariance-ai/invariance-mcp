import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import {
  jsonResult,
  parseJsonArg,
  registerDestructiveTool,
  registerReadTool,
  registerWriteTool,
} from '../lib/util.js';

const sourceEnum = z.enum(['executions', 'events', 'runs', 'nodes', 'captures']);
const vizEnum = z.enum(['table', 'metric', 'bar', 'line', 'list']);
const visibilityEnum = z.enum(['agent', 'private']);

const specDescribe =
  'QuerySpec as a JSON object string. Fields (all optional): fields (string[]), filters ([{"field","op":"eq|neq|in|gt|gte|lt|lte","value"}]), group_by (string), aggregation ("count|sum|avg|min|max|count_distinct"), aggregation_field (string), order_by (string), order_dir ("asc|desc"), limit (int). Example: {"filters":[{"field":"status","op":"eq","value":"open"}],"aggregation":"count"}';

export function registerSavedViewTools(server: McpServer, client: InvarianceClient): void {
  registerReadTool(
    server,
    'invariance_saved_view_list',
    'List saved query views (name, source, spec, viz, visibility).',
    {},
    async () => jsonResult(await client.get('/v1/saved-views')),
  );

  registerReadTool(
    server,
    'invariance_saved_view_get',
    'Get a saved view by ID.',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ view: unknown }>(
        `/v1/saved-views/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.view);
    },
  );

  registerWriteTool(
    server,
    'invariance_saved_view_create',
    'Create a saved query view over executions/events/runs/nodes/captures.',
    {
      name: z.string(),
      source: sourceEnum,
      spec: z.string().describe(specDescribe),
      viz: vizEnum.optional(),
      visibility: visibilityEnum.optional(),
    },
    async ({ name, source, spec, viz, visibility }) => {
      const body: Record<string, unknown> = {
        name,
        source,
        spec: parseJsonArg('spec', spec),
      };
      if (viz !== undefined) body.viz = viz;
      if (visibility !== undefined) body.visibility = visibility;
      const res = await client.post<{ view: unknown }>('/v1/saved-views', body);
      return jsonResult(res.view);
    },
  );

  registerWriteTool(
    server,
    'invariance_saved_view_update',
    'Patch a saved view (partial; only included fields change).',
    {
      id: z.string(),
      name: z.string().optional(),
      source: sourceEnum.optional(),
      spec: z.string().optional().describe(specDescribe),
      viz: vizEnum.optional(),
      visibility: visibilityEnum.optional(),
    },
    async ({ id, name, source, spec, viz, visibility }) => {
      const body: Record<string, unknown> = {};
      if (name !== undefined) body.name = name;
      if (source !== undefined) body.source = source;
      if (spec !== undefined) body.spec = parseJsonArg('spec', spec);
      if (viz !== undefined) body.viz = viz;
      if (visibility !== undefined) body.visibility = visibility;
      const res = await client.patch<{ view: unknown }>(
        `/v1/saved-views/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.view);
    },
  );

  registerWriteTool(
    server,
    'invariance_saved_view_run',
    'Run a query and return the result. Pass EITHER saved_view_id OR source+spec (exactly one).',
    {
      saved_view_id: z.string().optional().describe('Run a stored saved view by ID.'),
      source: sourceEnum.optional().describe('Ad-hoc query source; requires spec.'),
      spec: z.string().optional().describe(specDescribe),
    },
    async ({ saved_view_id, source, spec }) => {
      const hasSaved = saved_view_id !== undefined;
      const hasAdhoc = source !== undefined || spec !== undefined;
      if (hasSaved === hasAdhoc) {
        throw new Error(
          'Pass exactly one of saved_view_id OR source+spec.',
        );
      }
      let body: Record<string, unknown>;
      if (hasSaved) {
        body = { saved_view_id };
      } else {
        if (source === undefined) {
          throw new Error('source is required for an ad-hoc query.');
        }
        body = { source };
        if (spec !== undefined) body.spec = parseJsonArg('spec', spec);
      }
      const res = await client.post<{ result: unknown }>('/v1/saved-views/run', body);
      return jsonResult(res.result);
    },
  );

  registerDestructiveTool(
    server,
    'invariance_saved_view_delete',
    'Delete a saved view by ID.',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.delete<{ ok: true }>(
        `/v1/saved-views/${encodeURIComponent(id)}`,
      );
      return jsonResult(res);
    },
  );
}
