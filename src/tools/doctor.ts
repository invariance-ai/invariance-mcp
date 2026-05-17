import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { InvarianceClient } from '../lib/client.js';
import { registerReadTool } from '../lib/util.js';
import { SERVER_NAME, SERVER_VERSION } from '../version.js';

interface Check {
  name: string;
  status: 'pass' | 'fail' | 'warn';
  message: string;
}

export function registerDoctorTool(server: McpServer, client: InvarianceClient): void {
  registerReadTool(
    server,
    'invariance_doctor',
    'Run a health check on this MCP server: verifies API key auth, API reachability, and reports server name/version. Mirrors `inv doctor --json` from the CLI. Returns {checks: [{name, status, message}], summary: {pass, fail, warn}}.',
    {},
    async () => {
      const checks: Check[] = [];

      checks.push({
        name: 'MCP server',
        status: 'pass',
        message: `${SERVER_NAME} v${SERVER_VERSION}`,
      });

      checks.push({
        name: 'Node.js version',
        status: parseInt(process.versions.node.split('.')[0] ?? '0', 10) >= 20 ? 'pass' : 'fail',
        message: `v${process.versions.node}`,
      });

      try {
        const me = await client.get<{ agent?: { id?: string } }>('/v1/agents/me');
        checks.push({
          name: 'API reachable & key valid',
          status: 'pass',
          message: me.agent?.id ? `agent_id=${me.agent.id}` : 'authenticated',
        });
      } catch (err) {
        checks.push({
          name: 'API reachable & key valid',
          status: 'fail',
          message: err instanceof Error ? err.message : 'unknown error',
        });
      }

      const summary = {
        pass: checks.filter((c) => c.status === 'pass').length,
        fail: checks.filter((c) => c.status === 'fail').length,
        warn: checks.filter((c) => c.status === 'warn').length,
      };

      return {
        content: [{ type: 'text' as const, text: JSON.stringify({ checks, summary }) }],
      };
    },
  );
}
