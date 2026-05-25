import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, registerReadTool, registerWriteTool } from '../lib/util.js';

const modeEnum = z.enum(['suggested', 'shadow', 'active_monitor']);

export function registerRecipeTools(server: McpServer, client: InvarianceClient): void {
  registerReadTool(
    server,
    'invariance_recipe_list',
    'List built-in operational-check recipes (registry of controls). Promote one into a guardrail via invariance_guardrail_create.',
    {
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/recipes', { cursor, limit })),
  );

  registerReadTool(
    server,
    'invariance_recipe_get',
    'Get a recipe by ID or slug.',
    { id: z.string().describe('Recipe ID or slug.') },
    async ({ id }) => {
      const res = await client.get<{ recipe: unknown }>(
        `/v1/recipes/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.recipe);
    },
  );

  registerWriteTool(
    server,
    'invariance_recipe_update',
    'Patch a recipe (enabled, default_mode).',
    {
      id: z.string(),
      enabled: z.boolean().optional(),
      default_mode: modeEnum.optional(),
    },
    async ({ id, enabled, default_mode }) => {
      const body: Record<string, unknown> = {};
      if (enabled !== undefined) body.enabled = enabled;
      if (default_mode !== undefined) body.default_mode = default_mode;
      const res = await client.patch<{ recipe: unknown }>(
        `/v1/recipes/${encodeURIComponent(id)}`,
        body,
      );
      return jsonResult(res.recipe);
    },
  );
}
