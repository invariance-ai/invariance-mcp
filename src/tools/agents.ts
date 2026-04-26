import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult } from '../lib/util.js';

export function registerAgentTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
    'invariance_agent_me',
    'Show the authenticated agent and API key',
    {},
    async () => jsonResult(await client.get('/v1/agents/me')),
  );

  server.tool(
    'invariance_agent_set_key',
    "Register or rotate the calling agent's Ed25519 public key (32-byte hex, 64 chars)",
    { public_key: z.string().describe('Ed25519 public key as hex (64 chars)') },
    async ({ public_key }) => {
      const res = await client.put<{ agent: unknown }>('/v1/agents/me/key', { public_key });
      return jsonResult(res.agent);
    },
  );
}
