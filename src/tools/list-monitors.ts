import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const listMonitorsTool = {
  name: 'list_monitors',
  description: 'List configured monitors in Invariance',
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of monitors to return (1-100, default 20)'),
    status: z
      .string()
      .optional()
      .describe('Filter by monitor status (e.g. "active", "paused")'),
  }),

  async execute(
    client: InvarianceClient,
    input: { limit?: number; status?: string },
  ) {
    try {
      const result = await client.listMonitors({
        limit: input.limit,
        status: input.status,
      });
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(result, null, 2),
          },
        ],
      };
    } catch (error) {
      handleToolError(error);
    }
  },
};
