import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const getMonitorTool = {
  name: 'get_monitor',
  description:
    'Get detailed information about a specific monitor including recent runs',
  inputSchema: z.object({
    monitor_id: z
      .string()
      .min(1)
      .describe('The ID of the monitor to retrieve'),
  }),

  async execute(
    client: InvarianceClient,
    input: { monitor_id: string },
  ) {
    try {
      const result = await client.getMonitor(input.monitor_id);
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
