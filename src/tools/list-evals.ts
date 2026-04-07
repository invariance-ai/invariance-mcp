import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const listEvalsTool = {
  name: 'list_evals',
  description: 'List evaluation runs with optional dataset filtering',
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of evaluations to return (1-100, default 20)'),
    dataset_id: z
      .string()
      .optional()
      .describe('Filter evaluations by dataset ID'),
  }),

  async execute(
    client: InvarianceClient,
    input: { limit?: number; dataset_id?: string },
  ) {
    try {
      const result = await client.listEvals({
        limit: input.limit,
        dataset_id: input.dataset_id,
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
