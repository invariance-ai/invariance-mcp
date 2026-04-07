import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const listSignalsTool = {
  name: 'list_signals',
  description: 'List signals detected by Invariance monitors',
  inputSchema: z.object({
    limit: z
      .number()
      .int()
      .min(1)
      .max(100)
      .optional()
      .default(20)
      .describe('Maximum number of signals to return (1-100, default 20)'),
  }),

  async execute(
    client: InvarianceClient,
    input: { limit?: number },
  ) {
    try {
      const result = await client.listSignals({ limit: input.limit });
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
