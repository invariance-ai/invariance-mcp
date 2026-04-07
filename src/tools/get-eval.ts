import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const getEvalTool = {
  name: 'get_eval',
  description: 'Get detailed results of a specific evaluation run',
  inputSchema: z.object({
    eval_id: z
      .string()
      .min(1)
      .describe('The ID of the evaluation to retrieve'),
  }),

  async execute(
    client: InvarianceClient,
    input: { eval_id: string },
  ) {
    try {
      const result = await client.getEval(input.eval_id);
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
