import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from '../server.js';

const API_URL = 'https://api.test';

// In-scope tool names for the six data-plane domains added in the parity
// close-out. Asserting these are a SUBSET of the registered tools guards
// against an import/registration regression dropping a group.
const IN_SCOPE_TOOLS = [
  // workflow-observability (read)
  'invariance_workflow_observability_list',
  'invariance_workflow_observability_get',
  'invariance_workflow_observability_executions',
  // divergences (read + write)
  'invariance_divergence_list',
  'invariance_divergence_get',
  'invariance_divergence_update',
  // saved-views (read + write + destructive)
  'invariance_saved_view_list',
  'invariance_saved_view_get',
  'invariance_saved_view_create',
  'invariance_saved_view_update',
  'invariance_saved_view_run',
  'invariance_saved_view_delete',
  // receipts (read + write; create/batch need an agent API key)
  'invariance_receipt_create',
  'invariance_receipt_batch',
  'invariance_receipt_list',
  'invariance_receipt_get',
  // guardrails (read + write)
  'invariance_guardrail_list',
  'invariance_guardrail_get',
  'invariance_guardrail_create',
  'invariance_guardrail_update',
  'invariance_guardrail_promote',
  // recipes (read + write)
  'invariance_recipe_list',
  'invariance_recipe_get',
  'invariance_recipe_update',
] as const;

let client: Client;
let server: McpServer;
let originalEnv: typeof process.env;

beforeEach(async () => {
  originalEnv = { ...process.env };
  process.env.INVARIANCE_API_KEY = 'inv_test_key';
  process.env.INVARIANCE_API_URL = API_URL;
  delete process.env.INVARIANCE_BASE_URL;
  delete process.env.INVARIANCE_MCP_TRANSPORT;

  // No network is exercised here (we only enumerate tools), but stub fetch
  // so an accidental call can't escape to the real API.
  vi.spyOn(globalThis, 'fetch').mockImplementation(
    async () =>
      new Response(JSON.stringify({ data: [], next_cursor: null }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
  );

  server = createServer();
  client = new Client({ name: 'mcp-coverage-test', version: '0.0.0' });
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

describe('MCP tool coverage', () => {
  it('registers every in-scope data-plane tool (subset of registered)', async () => {
    const result = await client.listTools();
    const registered = new Set(result.tools.map((t) => t.name));

    for (const name of IN_SCOPE_TOOLS) {
      expect(registered.has(name), `missing in-scope tool ${name}`).toBe(true);
    }
  });

  it('reports the total registered tool count', async () => {
    const result = await client.listTools();
    const total = result.tools.length;
    // Visible in CI output so tool-count drift is noticed.
    // eslint-disable-next-line no-console
    console.log(`[coverage] total registered MCP tools: ${total}`);
    // Tripwire: the server should stay well above the in-scope set and below a
    // sane ceiling. Bump these bounds intentionally when adding tool groups.
    expect(total).toBeGreaterThanOrEqual(IN_SCOPE_TOOLS.length);
    expect(total).toBeLessThan(200);
  });
});
