import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { handleToolError } from '../lib/errors.js';

export const getSessionTool = {
  name: 'get_session',
  description: 'Get detailed information about an agent session',
  inputSchema: z.object({
    session_id: z
      .string()
      .min(1)
      .describe('The ID of the session to retrieve'),
  }),

  async execute(
    client: InvarianceClient,
    input: { session_id: string },
  ) {
    try {
      const session = await client.getSession(input.session_id);
      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(session, null, 2),
          },
        ],
      };
    } catch (error) {
      handleToolError(error);
    }
  },
};
