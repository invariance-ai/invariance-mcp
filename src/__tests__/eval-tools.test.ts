import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from '../server.js';

const API_URL = 'https://api.test';

// PR4 — production-run → eval-case tools the agent surface must expose.
const PR4_EVAL_TOOLS = [
  'invariance_eval_case_create_from_run',
  'invariance_eval_suite_run',
  'invariance_eval_run_results',
  'invariance_eval_experiment_compare',
] as const;

let client: Client;
let server: McpServer;
let originalEnv: typeof process.env;
let lastRequest: { url: string; body: unknown } | null;

beforeEach(async () => {
  originalEnv = { ...process.env };
  process.env.INVARIANCE_API_KEY = 'inv_test_key';
  process.env.INVARIANCE_API_URL = API_URL;
  delete process.env.INVARIANCE_BASE_URL;
  delete process.env.INVARIANCE_MCP_TRANSPORT;

  lastRequest = null;
  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    lastRequest = {
      url: String(input),
      body: init?.body ? JSON.parse(init.body as string) : null,
    };
    return new Response(JSON.stringify({ case: { id: 'ec_1' }, eval_run: { id: 'er_1' } }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  });

  server = createServer();
  client = new Client({ name: 'mcp-eval-test', version: '0.0.0' });
  const [c, s] = InMemoryTransport.createLinkedPair();
  await server.connect(s);
  await client.connect(c);
});

afterEach(async () => {
  await client.close();
  await server.close();
  process.env = originalEnv;
  vi.restoreAllMocks();
});

describe('PR4 eval MCP tools', () => {
  it('registers all four production-run → eval-case tools with input schemas', async () => {
    const result = await client.listTools();
    const byName = new Map(result.tools.map((t) => [t.name, t]));
    for (const name of PR4_EVAL_TOOLS) {
      const tool = byName.get(name);
      expect(tool, `missing tool ${name}`).toBeDefined();
      expect(tool!.inputSchema).toBeDefined();
    }
  });

  it('case_create_from_run forwards source_signal_id provenance to the from-run route', async () => {
    await client.callTool({
      name: 'invariance_eval_case_create_from_run',
      arguments: {
        suite_id: 'su_1',
        body: JSON.stringify({ source_run_id: 'run_x', source_signal_id: 'sig_1' }),
      },
    });
    expect(lastRequest?.url).toContain('/v1/eval-suites/su_1/cases/from-run');
    expect(lastRequest?.body).toMatchObject({ source_run_id: 'run_x', source_signal_id: 'sig_1' });
  });
});
