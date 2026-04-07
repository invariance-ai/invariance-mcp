import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const queryTool = {
  name: 'query_invariance',
  description:
    'Query Invariance with a natural language prompt to analyze traces, monitors, and signals',
  inputSchema: z.object({
    prompt: z
      .string()
      .min(1)
      .describe('Natural language query to analyze your observability data'),
  }),

  async execute(
    client: InvarianceClient,
    input: { prompt: string },
  ) {
    try {
      const result = await client.query(input.prompt);
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
