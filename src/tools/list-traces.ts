import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const listTracesTool = {
  name: 'list_traces',
  description: 'List recent traces from Invariance with optional filtering',
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of traces to return (1-100, default 20)'),
    status: z
      .string()
      .optional()
      .describe('Filter by trace status (e.g. "completed", "error")'),
    cursor: z
      .string()
      .optional()
      .describe('Pagination cursor from a previous response'),
  }),

  async execute(
    client: InvarianceClient,
    input: { limit?: number; status?: string; cursor?: string },
  ) {
    try {
      const result = await client.listTraces({
        limit: input.limit,
        status: input.status,
        cursor: input.cursor,
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
