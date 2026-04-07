import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const whoamiTool = {
  name: 'whoami',
  description:
    'Get information about the authenticated Invariance user and organization',
  inputSchema: z.object({}),

  async execute(client: InvarianceClient, _input: Record<string, never>) {
    try {
      const user = await client.whoami();
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(user, null, 2),
          },
        ],
      };
    } catch (error) {
      handleToolError(error);
    }
  },
};
