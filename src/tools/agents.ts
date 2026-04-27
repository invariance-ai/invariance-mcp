import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult } from '../lib/util.js';

export function registerAgentTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_agent_me',
    'Show the agent identity and API key associated with the current credentials. Useful for confirming which agent context the MCP server is operating as.',
    {},
    async () => jsonResult(await client.get('/v1/agents/me')),
  );

  server.tool(
    'invariance_agent_set_key',
    "Register or rotate the calling agent's Ed25519 public key. Once set, every node written by this agent must be signed with the matching private key (the server uses this key to verify signatures during invariance_run_verify).",
    {
      public_key: z
        .string()
        .describe('Ed25519 public key encoded as lowercase hex — exactly 64 hex characters (32 bytes). Example: "a1b2c3...e9f0" (64 chars total).'),
    },
    async ({ public_key }) => {
      const res = await client.put<{ agent: unknown }>('/v1/agents/me/key', { public_key });
      return jsonResult(res.agent);
    },
  );
}
