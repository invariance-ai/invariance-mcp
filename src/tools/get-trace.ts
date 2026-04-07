import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const getTraceTool = {
  name: 'get_trace',
  description: 'Get detailed information about a specific trace by ID',
  inputSchema: z.object({
    trace_id: z.string().min(1).describe('The ID of the trace to retrieve'),
  }),

  async execute(
    client: InvarianceClient,
    input: { trace_id: string },
  ) {
    try {
      const trace = await client.getTrace(input.trace_id);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(trace, null, 2),
          },
        ],
      };
    } catch (error) {
      handleToolError(error);
    }
  },
};
