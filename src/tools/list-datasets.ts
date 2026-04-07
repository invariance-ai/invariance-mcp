import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const listDatasetsTool = {
  name: 'list_datasets',
  description: 'List available evaluation datasets',
  inputSchema: z.object({
    agent_id: z
      .string()
      .optional()
      .describe('Filter datasets by agent ID'),
  }),

  async execute(
    client: InvarianceClient,
    input: { agent_id?: string },
  ) {
    try {
      const result = await client.listDatasets({ agent_id: input.agent_id });
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
