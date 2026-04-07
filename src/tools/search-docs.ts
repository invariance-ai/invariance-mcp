import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const searchDocsTool = {
  name: 'search_docs',
  description: 'Search Invariance documentation for a topic',
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe('Search query for Invariance documentation'),
  }),

  async execute(
    client: InvarianceClient,
    input: { query: string },
  ) {
    try {
      const results = await client.searchDocs(input.query);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(results, null, 2),
          },
        ],
      };
    } catch (error) {
      handleToolError(error);
    }
  },
};
