import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const createDatasetTool = {
  name: 'create_dataset',
  description: 'Create a new evaluation dataset in Invariance',
  inputSchema: z.object({
    name: z.string().min(1).describe('Name for the new dataset'),
    description: z
      .string()
      .min(1)
      .describe('Description of the dataset'),
  }),

  async execute(
    client: InvarianceClient,
    input: { name: string; description: string },
  ) {
    try {
      const result = await client.createDataset(input);
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
