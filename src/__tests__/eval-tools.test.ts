import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from '../server.js';

const API_URL = 'https://api.test';

// PR4 — production-run → eval-case tools the agent surface must expose.
const PR4_EVAL_TOOLS = [
  'invariance_eval_dataset_seed_suite',
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
  it('registers production-run and dataset → eval-suite tools with input schemas', async () => {
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

  it('dataset_seed_suite posts to server seed-suite endpoint', async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body ? JSON.parse(init.body as string) : null;
      requests.push({ path: url.pathname, body });
      if (url.pathname === '/v1/eval-datasets/seed-suite')
        return new Response(
          JSON.stringify({
            dataset: { id: 'ds_1', name: body.name },
            suite: { id: 'su_1', name: body.name },
            examples: [{ id: 'ex_1' }, { id: 'ex_2' }],
            cases: [{ id: 'ec_1' }, { id: 'ec_2' }],
            eval_run: { id: 'erun_1', status: 'queued' },
          }),
          {
            status: 201,
            headers: { 'Content-Type': 'application/json' },
          },
        );
      return new Response(JSON.stringify({ message: 'unexpected route' }), { status: 404 });
    });

    const res = await client.callTool({
      name: 'invariance_eval_dataset_seed_suite',
      arguments: {
        body: JSON.stringify({
          name: 'refund-regression',
          run: true,
          rows: [
            {
              name: 'approved',
              input: { prompt: 'approve refund' },
              expected: { assertions: [{ path: 'outcome', op: 'equals', value: 'approved' }] },
            },
            {
              input: { prompt: 'deny refund' },
              expected: { assertions: [{ path: 'outcome', op: 'equals', value: 'denied' }] },
              mutations: [{ kind: 'replace_prompt', value: 'deny refund without approval' }],
            },
          ],
        }),
      },
    });

    expect(requests.map((r) => r.path)).toEqual(['/v1/eval-datasets/seed-suite']);
    expect(requests[0].body).toMatchObject({
      name: 'refund-regression',
      target_type: 'custom',
      run: true,
      rows: [
        {
          name: 'approved',
          input: { prompt: 'approve refund' },
        },
        {
          name: 'case-002',
          input: { prompt: 'deny refund' },
        },
      ],
    });
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '{}';
    expect(JSON.parse(text)).toMatchObject({
      dataset_id: 'ds_1',
      suite_id: 'su_1',
      case_count: 2,
      eval_run: { id: 'erun_1' },
    });
  });

  it('dataset_seed_suite preserves distinct suite_name with client orchestration fallback', async () => {
    const requests: Array<{ path: string; body: unknown }> = [];
    vi.mocked(globalThis.fetch).mockImplementation(async (input, init) => {
      const url = new URL(String(input));
      const body = init?.body ? JSON.parse(init.body as string) : null;
      requests.push({ path: url.pathname, body });
      if (url.pathname === '/v1/eval-datasets')
        return new Response(JSON.stringify({ dataset: { id: 'ds_1', name: body.name } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      if (url.pathname === '/v1/eval-suites')
        return new Response(JSON.stringify({ suite: { id: 'su_1', name: body.name } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      if (url.pathname === '/v1/eval-datasets/ds_1/examples')
        return new Response(JSON.stringify({ example: { id: 'ex_1', dataset_id: 'ds_1' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      if (url.pathname === '/v1/eval-suites/su_1/cases')
        return new Response(JSON.stringify({ case: { id: 'ec_1', suite_id: 'su_1' } }), {
          status: 201,
          headers: { 'Content-Type': 'application/json' },
        });
      return new Response(JSON.stringify({ message: 'unexpected route' }), { status: 404 });
    });

    const res = await client.callTool({
      name: 'invariance_eval_dataset_seed_suite',
      arguments: {
        body: JSON.stringify({
          name: 'refund-regression-dataset',
          suite_name: 'refund-regression-suite',
          rows: [{ name: 'approved', input: { prompt: 'approve refund' } }],
        }),
      },
    });

    expect(requests.map((r) => r.path)).toEqual([
      '/v1/eval-datasets',
      '/v1/eval-suites',
      '/v1/eval-datasets/ds_1/examples',
      '/v1/eval-suites/su_1/cases',
    ]);
    expect(requests[1].body).toMatchObject({
      name: 'refund-regression-suite',
      target_type: 'custom',
      dataset_id: 'ds_1',
    });
    const text = res.content[0]?.type === 'text' ? res.content[0].text : '{}';
    expect(JSON.parse(text)).toMatchObject({
      dataset_id: 'ds_1',
      suite_id: 'su_1',
      case_count: 1,
    });
  });
});
