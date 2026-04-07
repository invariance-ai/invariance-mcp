import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const listEvalsTool = {
  name: 'list_evals',
  description: 'List evaluation runs with optional suite, agent, status, or dataset filters',
  inputSchema: z.object({
    suite_id: z
      .string()
      .optional()
      .describe('Filter evaluation runs by suite ID'),
    agent_id: z
      .string()
      .optional()
      .describe('Filter evaluation runs by agent ID'),
    status: z
      .string()
      .optional()
      .describe('Filter evaluation runs by status'),
    dataset_id: z
      .string()
      .optional()
      .describe('Filter evaluation runs by dataset ID'),
  }),

  async execute(
    client: InvarianceClient,
    input: {
      suite_id?: string;
      agent_id?: string;
      status?: string;
      dataset_id?: string;
    },
  ) {
    try {
      const result = await client.listEvals({
        suite_id: input.suite_id,
        agent_id: input.agent_id,
        status: input.status,
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
