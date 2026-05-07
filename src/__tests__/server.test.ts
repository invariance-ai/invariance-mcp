import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from '../server.js';

const API_URL = 'https://api.test';

type Recorded = { method: string; path: string; body: unknown };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function runFixture(id = 'run_1') {
  return {
    id,
    agent_id: 'agent_1',
    name: 'demo',
    status: 'open',
    metadata: {},
    created_at: '2026-01-01T00:00:00.000Z',
    updated_at: '2026-01-01T00:00:00.000Z',
    closed_at: null,
  };
}

function nodeFixture(id = 'node_1') {
  return {
    id,
    run_id: 'run_1',
    agent_id: 'agent_1',
    parent_id: null,
    action_type: 'tool_call',
    type: null,
    input: null,
    output: null,
    error: null,
    metadata: {},
    custom_fields: {},
    timestamp: 1,
    duration_ms: null,
    hash: 'hash_1',
    previous_hashes: [],
    signature: null,
    created_at: '2026-01-01T00:00:00.000Z',
  };
}

function contentText(result: Awaited<ReturnType<Client['callTool']>>): string {
  const content =
    'content' in result && Array.isArray(result.content)
      ? (result.content as Array<{ type?: unknown; text?: unknown }>)
      : [];
  const part = content[0];
  if (!part || part.type !== 'text' || typeof part.text !== 'string') {
    throw new Error('Expected text content');
  }
  return part.text;
}

function contentJson(result: Awaited<ReturnType<Client['callTool']>>): unknown {
  return JSON.parse(contentText(result));
}

let client: Client;
let server: McpServer;
let requests: Recorded[];
let originalEnv: typeof process.env;

beforeEach(async () => {
  originalEnv = { ...process.env };
  process.env.INVARIANCE_API_KEY = 'inv_test_key';
  process.env.INVARIANCE_API_URL = API_URL;
  delete process.env.INVARIANCE_BASE_URL;
  delete process.env.INVARIANCE_MCP_TRANSPORT;
  requests = [];

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({ method, path: `${url.pathname}${url.search}`, body });

    if (method === 'POST' && url.pathname === '/v1/runs') {
      return json({ run: { ...runFixture(), name: body?.name ?? 'demo' } }, 201);
    }
    if (method === 'GET' && url.pathname === '/v1/runs') {
      return json({ data: [runFixture()], next_cursor: null });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1') {
      return json({ run: runFixture() });
    }
    if (method === 'PATCH' && url.pathname === '/v1/runs/run_1') {
      return json({ run: { ...runFixture(), status: body?.status ?? 'open' } });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/verify') {
      return json({
        run_id: 'run_1',
        valid: true,
        node_count: 1,
        head_hash: 'hash_1',
        first_invalid_node_id: null,
        reason: null,
      });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/nodes') {
      return json({ data: [nodeFixture()], next_cursor: null });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/operational-graph') {
      return json({
        run_id: 'run_1',
        nodes: [{ id: 'node_1' }],
        edges: [],
        root_node_ids: ['node_1'],
      });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/llm-calls') {
      return json({
        data: [{ id: 'llm_1', node_id: 'node_1', model: 'claude-opus-4-7' }],
        next_cursor: null,
      });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/node-types') {
      return json({ data: [{ type: 'tool_call', count: 3 }] });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/node-types/tool_call/metrics') {
      return json({ metrics: { type: 'tool_call', count: 3 } });
    }
    if (method === 'POST' && url.pathname === '/v1/runs/run_1/fork') {
      return json(
        {
          run: {
            ...runFixture('run_2'),
            metadata: { fork_from: body?.from_node_id, ...(body?.metadata ?? {}) },
            name: body?.name ?? 'demo',
          },
        },
        201,
      );
    }
    if (method === 'GET' && url.pathname.startsWith('/v1/metrics/overview')) {
      return json({ metrics: { runs: 1, nodes: 1, errors: 0, window_hours: 24 } });
    }
    if (method === 'GET' && url.pathname.startsWith('/v1/metrics/agents')) {
      return json({ usage: [{ agent_id: 'agent_1', runs: 1 }] });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/metrics') {
      return json({ metrics: { llm_call_count: 1, tool_call_count: 0 } });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/run_1/narrative') {
      return json({ narrative: { summary: 'all good', sections: [] } });
    }
    if (method === 'GET' && url.pathname.startsWith('/v1/findings')) {
      return json({
        data: [
          { id: 'find_1', run_id: 'run_1', status: 'open', title: 'spike' },
          { id: 'find_2', run_id: 'run_other', status: 'open', title: 'other' },
          { id: 'find_3', run_id: 'run_1', status: 'resolved', title: 'old' },
        ],
        next_cursor: null,
      });
    }
    if (method === 'POST' && url.pathname === '/v1/nodes') {
      return json({ data: [nodeFixture()] }, 201);
    }
    if (method === 'POST' && url.pathname === '/v1/signals') {
      return json(
        {
          signal: {
            id: 'sig_1',
            severity: body?.severity ?? 'medium',
            title: body?.title ?? '',
            data: body?.data ?? null,
            run_id: body?.run_id ?? null,
          },
        },
        201,
      );
    }
    if (method === 'GET' && url.pathname === '/v1/agents/me') {
      return json({
        agent: {
          id: 'agent_1',
          name: 'me',
          public_key: null,
          project_id: 'p1',
          created_at: '2026-01-01T00:00:00.000Z',
        },
      });
    }
    if (method === 'GET' && url.pathname === '/v1/runs/missing') {
      return json({ error: { code: 'not_found', message: 'Run missing not found' } }, 404);
    }
    if (method === 'POST' && url.pathname === '/v1/kb/pages') {
      return json({ page: { id: 'page_1', ...body } }, 201);
    }
    if (method === 'PATCH' && url.pathname === '/v1/kb/pages/page_1') {
      return json({ page: { id: 'page_1', ...body } });
    }
    if (method === 'DELETE' && url.pathname === '/v1/kb/pages/page_1') {
      return new Response(null, { status: 204 });
    }
    if (method === 'POST' && url.pathname === '/v1/kb/sessions') {
      return json({ session: { id: 'sess_1', ...body } }, 201);
    }
    if (method === 'DELETE' && url.pathname === '/v1/kb/sessions/sess_1') {
      return new Response(null, { status: 204 });
    }
    if (method === 'GET' && url.pathname === '/v1/kb/sessions/sess_1/messages') {
      return json({ messages: [{ id: 'msg_1', role: 'user', content: 'hi' }] });
    }
    if (method === 'POST' && url.pathname === '/v1/kb/sessions/sess_1/messages') {
      return json({ message: { id: 'msg_2', ...body } }, 201);
    }

    return json(
      { error: { code: 'not_found', message: `${method} ${url.pathname}` } },
      404,
    );
  });

  server = createServer();
  client = new Client({ name: 'mcp-test', version: '0.0.0' });
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

describe('Invariance MCP server', () => {
  it('registers every modern tool plus the legacy aliases', async () => {
    const result = await client.listTools();
    const names = new Set(result.tools.map((t) => t.name));

    for (const expected of [
      'invariance_run_start', 'invariance_run_get', 'invariance_run_list',
      'invariance_run_finish', 'invariance_run_fail', 'invariance_run_verify',
      'invariance_run_metrics',
      'invariance_node_write', 'invariance_node_list',
      'invariance_monitor_create', 'invariance_monitor_list', 'invariance_monitor_get',
      'invariance_monitor_update', 'invariance_monitor_pause', 'invariance_monitor_resume',
      'invariance_monitor_evaluate', 'invariance_monitor_executions', 'invariance_monitor_findings',
      'invariance_signal_emit', 'invariance_signal_list', 'invariance_signal_get',
      'invariance_signal_acknowledge', 'invariance_signal_resolve',
      'invariance_finding_list', 'invariance_finding_get', 'invariance_finding_update',
      'invariance_review_list', 'invariance_review_get', 'invariance_review_claim',
      'invariance_review_unclaim', 'invariance_review_resolve',
      'invariance_agent_me', 'invariance_agent_set_key',
      'invariance_narrative_get', 'invariance_ask',
      'invariance_run_operational_graph', 'invariance_run_llm_calls',
      'invariance_run_node_types', 'invariance_run_node_type_metrics',
      'invariance_run_fork', 'invariance_metrics_overview',
      'invariance_metrics_agents', 'invariance_run_inspect',
      'invariance_kb_pages_list', 'invariance_kb_page_get',
      'invariance_kb_page_create', 'invariance_kb_page_update', 'invariance_kb_page_delete',
      'invariance_kb_session_create', 'invariance_kb_session_delete',
      'invariance_kb_session_list_messages', 'invariance_kb_session_append_message',
    ]) {
      expect(names.has(expected), `missing tool ${expected}`).toBe(true);
    }

    for (const legacy of [
      'invariance_create_run', 'invariance_get_run', 'invariance_list_runs',
      'invariance_write_node', 'invariance_list_nodes', 'invariance_verify_run',
    ]) {
      expect(names.has(legacy), `missing legacy alias ${legacy}`).toBe(true);
    }
  });

  it('starts a run via the modern tool name', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_run_start',
        arguments: { name: 'demo' },
      }),
    ) as { id: string; name: string };
    expect(result.id).toBe('run_1');
    expect(result.name).toBe('demo');
    expect(requests[0]).toEqual({
      method: 'POST',
      path: '/v1/runs',
      body: { name: 'demo' },
    });
  });

  it('writes a node, parsing JSON-string args', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_node_write',
        arguments: {
          run_id: 'run_1',
          action_type: 'tool_call',
          input: '{"prompt":"ship"}',
          output: '{"result":"ok"}',
        },
      }),
    ) as { id: string; hash: string };
    expect(result).toMatchObject({ id: 'node_1', hash: 'hash_1' });
    const call = requests.find((r) => r.path === '/v1/nodes');
    expect(call?.body).toEqual([{
      run_id: 'run_1',
      action_type: 'tool_call',
      input: { prompt: 'ship' },
      output: { result: 'ok' },
    }]);
  });

  it('emits a signal', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_signal_emit',
        arguments: {
          severity: 'high',
          title: 'spike',
          data: '{"p99_ms":2400}',
          run_id: 'run_1',
        },
      }),
    ) as Record<string, unknown>;
    expect(result).toMatchObject({ id: 'sig_1', severity: 'high', title: 'spike' });
    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/signals');
    expect(call?.body).toEqual({
      severity: 'high',
      title: 'spike',
      data: { p99_ms: 2400 },
      run_id: 'run_1',
    });
  });

  it('returns the authenticated agent via invariance_agent_me', async () => {
    const result = contentJson(
      await client.callTool({ name: 'invariance_agent_me', arguments: {} }),
    ) as { agent?: { id?: string } };
    expect(result.agent?.id).toBe('agent_1');
  });

  it('finishes a run via invariance_run_finish', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_run_finish',
        arguments: { id: 'run_1' },
      }),
    ) as { status: string };
    expect(result.status).toBe('completed');
    const patch = requests.find((r) => r.method === 'PATCH' && r.path === '/v1/runs/run_1');
    expect(patch?.body).toEqual({ status: 'completed' });
  });

  it('returns structured tool errors for bad JSON arguments', async () => {
    const result = await client.callTool({
      name: 'invariance_node_write',
      arguments: { run_id: 'run_1', action_type: 'tool_call', input: '{bad-json' },
    });
    expect(result.isError).toBe(true);
    expect(contentText(result)).toContain('Invalid JSON in "input"');
    expect(requests.some((r) => r.path === '/v1/nodes')).toBe(false);
  });

  it('surfaces API errors as MCP tool errors', async () => {
    const result = await client.callTool({
      name: 'invariance_run_get',
      arguments: { id: 'missing' },
    });
    expect(result.isError).toBe(true);
    expect(contentText(result)).toContain('Run missing not found');
  });

  it('creates a KB page via invariance_kb_page_create', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_kb_page_create',
        arguments: { path: 'notes/x', title: 'X', body: '# X', kind: 'note' },
      }),
    ) as { id: string; title: string; kind: string };
    expect(result).toMatchObject({ id: 'page_1', title: 'X', kind: 'note' });
    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/kb/pages');
    expect(call?.body).toEqual({ path: 'notes/x', title: 'X', body: '# X', kind: 'note' });
  });

  it('appends a message to a KB session, parsing block JSON', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_kb_session_append_message',
        arguments: {
          id: 'sess_1',
          role: 'user',
          content: '[{"type":"text","text":"hello"}]',
        },
      }),
    ) as { id: string };
    expect(result.id).toBe('msg_2');
    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/v1/kb/sessions/sess_1/messages',
    );
    expect(call?.body).toEqual({
      role: 'user',
      content: [{ type: 'text', text: 'hello' }],
    });
  });

  it('deletes a KB page', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_kb_page_delete',
        arguments: { id: 'page_1' },
      }),
    ) as { id: string; deleted: boolean };
    expect(result).toEqual({ id: 'page_1', deleted: true });
    expect(
      requests.some((r) => r.method === 'DELETE' && r.path === '/v1/kb/pages/page_1'),
    ).toBe(true);
  });

  it('returns a structured API_NOT_AVAILABLE result for operational graph', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_run_operational_graph',
        arguments: { run_id: 'run_1' },
      }),
    ) as { error: { code: string; retryable: boolean } };
    expect(result.error.code).toBe('API_NOT_AVAILABLE');
    expect(result.error.retryable).toBe(false);
    expect(
      requests.some((r) => r.path === '/v1/runs/run_1/operational-graph'),
    ).toBe(false);
  });

  it('lists llm calls for a run with pagination args', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_run_llm_calls',
        arguments: { run_id: 'run_1', limit: 25 },
      }),
    ) as { data: unknown[] };
    expect(result.data.length).toBe(1);
    const call = requests.find(
      (r) => r.method === 'GET' && r.path.startsWith('/v1/runs/run_1/llm-calls'),
    );
    expect(call?.path).toContain('limit=25');
  });

  it('fetches node-type aggregate and per-type metrics', async () => {
    const types = contentJson(
      await client.callTool({
        name: 'invariance_run_node_types',
        arguments: { run_id: 'run_1' },
      }),
    ) as { data: Array<{ type: string }> };
    expect(types.data[0]?.type).toBe('tool_call');

    const metrics = contentJson(
      await client.callTool({
        name: 'invariance_run_node_type_metrics',
        arguments: { run_id: 'run_1', type: 'tool_call' },
      }),
    ) as { metrics: { type: string } };
    expect(metrics.metrics.type).toBe('tool_call');
  });

  it('forks a run', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_run_fork',
        arguments: { id: 'run_1', from_node_id: 'node_1', name: 'fork-test' },
      }),
    ) as { id: string; name: string };
    expect(result.id).toBe('run_2');
    expect(result.name).toBe('fork-test');
    const call = requests.find(
      (r) => r.method === 'POST' && r.path === '/v1/runs/run_1/fork',
    );
    expect(call?.body).toEqual({ from_node_id: 'node_1', name: 'fork-test' });
  });

  it('fetches cross-run metrics overview and agent usage', async () => {
    const overview = contentJson(
      await client.callTool({
        name: 'invariance_metrics_overview',
        arguments: { window_hours: 6 },
      }),
    ) as { metrics: { window_hours: number } };
    expect(overview.metrics.window_hours).toBe(24);
    const overviewCall = requests.find((r) => r.path.startsWith('/v1/metrics/overview'));
    expect(overviewCall?.path).toContain('window_hours=6');

    const agents = contentJson(
      await client.callTool({
        name: 'invariance_metrics_agents',
        arguments: {},
      }),
    ) as { usage: unknown[] };
    expect(agents.usage.length).toBe(1);
  });

  it('returns a composite triage view via invariance_run_inspect', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_run_inspect',
        arguments: { id: 'run_1', limit: 10 },
      }),
    ) as {
      run: { id?: string } | null;
      metrics: { metrics?: unknown } | null;
      narrative: { summary?: string } | null;
      recent_nodes: unknown[];
      open_findings: Array<{ id: string }>;
    };
    expect(result.run?.id).toBe('run_1');
    expect(result.narrative?.summary).toBe('all good');
    expect(result.recent_nodes.length).toBe(1);
    // open_findings filters to status=open AND run_id=run_1
    expect(result.open_findings.map((f) => f.id)).toEqual(['find_1']);
  });

  it('keeps legacy tool names working', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'invariance_create_run',
        arguments: { name: 'legacy' },
      }),
    ) as { id: string; name: string };
    expect(result).toMatchObject({ id: 'run_1', name: 'legacy' });
  });
});

describe('config', () => {
  it('throws without API key', () => {
    delete process.env.INVARIANCE_API_KEY;
    expect(() => createServer()).toThrow('INVARIANCE_API_KEY');
  });
});
