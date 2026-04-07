import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const createMonitorTool = {
  name: 'create_monitor',
  description: 'Create a new monitor in Invariance from a natural-language rule',
  inputSchema: z.object({
    name: z.string().min(1).describe('Name for the new monitor'),
    natural_language: z
      .string()
      .min(1)
      .describe('Natural-language rule describing what the monitor should detect'),
    agent_id: z
      .string()
      .optional()
      .describe('Optional agent ID to scope the monitor'),
    severity: z
      .enum(['low', 'medium', 'high', 'critical'])
      .optional()
      .describe('Signal severity when the monitor triggers'),
    webhook_url: z
      .string()
      .url()
      .optional()
      .describe('Optional webhook URL to notify when the monitor triggers'),
  }),

  async execute(
    client: InvarianceClient,
    input: {
      name: string;
      natural_language: string;
      agent_id?: string;
      severity?: string;
      webhook_url?: string;
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
