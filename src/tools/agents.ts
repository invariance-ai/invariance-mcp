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

  // Agent CRUD endpoints below require a Supabase user JWT — POST/GET /v1/agents
  // are gated by requireUser, not API-key auth. To call these tools, the MCP
  // server must be started with the user JWT as the bearer (e.g.
  // INVARIANCE_API_KEY=<JWT> for stdio, or Authorization: Bearer <JWT> in HTTP
  // mode). With a default agent API key, these endpoints will 401.
  server.tool(
    'invariance_agent_create',
    "Create a new agent inside one of the caller's projects. Requires a user-session JWT bearer (not an agent API key) — see invariance-cli `inv auth signup` / `inv auth signin` to obtain one.",
    {
      name: z.string().describe('Agent name (visible in the dashboard).'),
      project_id: z.string().describe('Project ID the agent will live under. The caller must be a member.'),
      public_key: z
        .string()
        .optional()
        .describe('Optional Ed25519 public key (64-char lowercase hex). Can be set later via invariance_agent_set_key.'),
    },
    async ({ name, project_id, public_key }) => {
      const body: Record<string, unknown> = { name, project_id };
      if (public_key !== undefined) body.public_key = public_key;
      return jsonResult(await client.post('/v1/agents', body));
    },
  );

  server.tool(
    'invariance_agent_list',
    "List agents inside one of the caller's projects. Requires a user-session JWT bearer.",
    {
      project_id: z.string().describe('Project ID. The caller must be a member.'),
    },
    async ({ project_id }) =>
      jsonResult(await client.get('/v1/agents', { project_id })),
  );

  server.tool(
    'invariance_agent_get',
    'Fetch a single agent by ID. Requires a user-session JWT bearer.',
    { id: z.string().describe('Agent ID.') },
    async ({ id }) => {
      const res = await client.get<{ agent: unknown }>(`/v1/agents/${encodeURIComponent(id)}`);
      return jsonResult(res.agent);
    },
  );
}
