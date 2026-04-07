import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const createMonitorTool = {
  name: 'create_monitor',
  description:
    'Create a new monitor in Invariance to track agent behavior',
  inputSchema: z.object({
    name: z.string().min(1).describe('Name for the new monitor'),
    description: z
      .string()
      .min(1)
      .describe('Description of what the monitor tracks'),
    query: z
      .string()
      .min(1)
      .describe('Query expression that defines the monitor logic'),
    schedule: z
      .string()
      .optional()
      .describe('Cron schedule for the monitor (e.g. "0 * * * *")'),
    threshold: z
      .number()
      .optional()
      .describe('Numeric threshold for triggering alerts'),
  }),

  async execute(
    client: InvarianceClient,
    input: {
      name: string;
      description: string;
      query: string;
      schedule?: string;
      threshold?: number;
    },
  ) {
    try {
      const result = await client.createMonitor(input);
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
