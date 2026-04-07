import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const runMonitorTool = {
  name: 'run_monitor',
  description: 'Trigger a monitor run and return the results',
  inputSchema: z.object({
    monitor_id: z
      .string()
      .min(1)
      .describe('The ID of the monitor to run'),
  }),

  async execute(
    client: InvarianceClient,
    input: { monitor_id: string },
  ) {
    try {
      const result = await client.runMonitor(input.monitor_id);
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
