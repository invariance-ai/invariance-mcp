import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { createServer } from '../server.js';
import { validateCortexResult } from '../tools/cortex.js';

const API_URL = 'https://api.test';

type Recorded = { method: string; path: string; body: unknown; headers: Headers };

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
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

// Per-test override for what the stub fetch returns. Defaults to a queued job
// shape; individual tests can mutate before calling.
let postJobsResponse: { status: number; body: unknown };
let getJobResponse: { status: number; body: unknown };
let getResultResponse: { status: number; body: unknown };

beforeEach(async () => {
  originalEnv = { ...process.env };
  process.env.INVARIANCE_API_KEY = 'inv_test_key';
  process.env.INVARIANCE_API_URL = API_URL;
  delete process.env.INVARIANCE_BASE_URL;
  delete process.env.INVARIANCE_MCP_TRANSPORT;
  requests = [];

  postJobsResponse = {
    status: 201,
    body: { job_id: 'ctxjob_123', status: 'queued' },
  };
  getJobResponse = {
    status: 200,
    body: {
      job: {
        id: 'ctxjob_123',
        status: 'queued',
        job_kind: 'workflow_eval',
        target_type: 'case',
        target_ref: 'case_123',
        actor_type: 'api_key',
        actor_id: 'apk_test',
        created_at: '2026-05-17T00:00:00Z',
        // Fields the safe projection MUST drop:
        raw_artifact: 'PRIVATE PROMPT CONTENT',
        prompt_spec_id: 'spec_secret',
      },
    },
  };
  getResultResponse = {
    status: 200,
    body: {
      job_id: 'ctxjob_123',
      status: 'succeeded',
      result: {
        kind: 'workflow_eval',
        passed: true,
        score: 0.82,
        criteria_results: [
          { criterion: 'sla_met', passed: true, evidence_refs: ['case_123'] },
        ],
        findings: [],
        confidence: 0.8,
      },
    },
  };

  vi.spyOn(globalThis, 'fetch').mockImplementation(async (input, init) => {
    const url = new URL(String(input));
    const method = init?.method ?? 'GET';
    const body = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    requests.push({
      method,
      path: `${url.pathname}${url.search}`,
      body,
      headers: new Headers(init?.headers),
    });

    if (method === 'POST' && url.pathname === '/v1/cortex/jobs') {
      return json(postJobsResponse.body, postJobsResponse.status);
    }
    if (method === 'GET' && /^\/v1\/cortex\/jobs\/[^/]+$/.test(url.pathname)) {
      return json(getJobResponse.body, getJobResponse.status);
    }
    if (method === 'GET' && /^\/v1\/cortex\/jobs\/[^/]+\/result$/.test(url.pathname)) {
      return json(getResultResponse.body, getResultResponse.status);
    }
    return json({ error: { code: 'not_found', message: `${method} ${url.pathname}` } }, 404);
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

describe('cortex tools registration', () => {
  it('registers cortex_run_job / cortex_run_eval / cortex_run_counterfactual / cortex_get_job / cortex_get_result', async () => {
    const result = await client.listTools();
    const names = new Set(result.tools.map((t) => t.name));
    for (const expected of [
      'cortex_run_job',
      'cortex_run_eval',
      'cortex_run_counterfactual',
      'cortex_get_job',
      'cortex_get_result',
    ]) {
      expect(names.has(expected), `missing tool ${expected}`).toBe(true);
    }

    // Read-only vs write annotations must be set per MCP convention.
    const tools = new Map(result.tools.map((t) => [t.name, t]));
    expect(tools.get('cortex_run_job')?.annotations?.readOnlyHint).toBe(false);
    expect(tools.get('cortex_get_job')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.get('cortex_get_result')?.annotations?.readOnlyHint).toBe(true);
  });
});

describe('cortex_run_job', () => {
  it('maps tool inputs verbatim to the platform request body, parsing JSON-string fields', async () => {
    const result = contentJson(
      await client.callTool({
        name: 'cortex_run_job',
        arguments: {
          job_kind: 'counterfactual_eval',
          target_type: 'case',
          target_ref: 'case_123',
          project_id: 'proj_123',
          question: 'What if Alice handled the escalation earlier?',
          criteria: '{"optimize_for":["resolution_time"],"constraints":["do_not_expose_private_evidence"]}',
          input_refs: '{"run_ids":["run_1"],"case_ids":["case_123"]}',
          options: '{"use_llm":true,"create_surface_item":false}',
        },
      }),
    ) as { job_id: string; status: string };

    expect(result.job_id).toBe('ctxjob_123');
    expect(result.status).toBe('queued');

    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/cortex/jobs');
    expect(call?.body).toEqual({
      job_kind: 'counterfactual_eval',
      target_type: 'case',
      target_ref: 'case_123',
      project_id: 'proj_123',
      question: 'What if Alice handled the escalation earlier?',
      criteria: {
        optimize_for: ['resolution_time'],
        constraints: ['do_not_expose_private_evidence'],
      },
      input_refs: { run_ids: ['run_1'], case_ids: ['case_123'] },
      options: { use_llm: true, create_surface_item: false },
    });
    // Idempotency header set for POST (see InvarianceClient.request).
    expect(call?.headers.get('Idempotency-Key')).toBeTruthy();
  });

  it('rejects malformed JSON in input_refs/criteria/options/input_payload before calling the API', async () => {
    const result = await client.callTool({
      name: 'cortex_run_job',
      arguments: {
        job_kind: 'workflow_eval',
        target_type: 'case',
        target_ref: 'case_123',
        project_id: 'proj_123',
        criteria: '{bad',
      },
    });
    expect(result.isError).toBe(true);
    expect(contentText(result)).toContain('Invalid JSON in "criteria"');
    expect(requests.some((r) => r.path === '/v1/cortex/jobs')).toBe(false);
  });

  it('returns the inline result when the synchronous MVP runner completes the job', async () => {
    postJobsResponse = {
      status: 201,
      body: {
        job_id: 'ctxjob_sync',
        status: 'succeeded',
        result: {
          kind: 'workflow_eval',
          passed: true,
          confidence: 0.9,
          criteria_results: [],
          findings: [],
        },
      },
    };
    const out = contentJson(
      await client.callTool({
        name: 'cortex_run_job',
        arguments: {
          job_kind: 'workflow_eval',
          target_type: 'case',
          target_ref: 'case_123',
          project_id: 'proj_123',
        },
      }),
    ) as { job_id: string; status: string; result: { kind: string; passed: boolean } };
    expect(out.status).toBe('succeeded');
    expect(out.result.kind).toBe('workflow_eval');
    expect(out.result.passed).toBe(true);
  });

  it('reports a structured error when the inline result fails schema validation', async () => {
    postJobsResponse = {
      status: 201,
      body: {
        job_id: 'ctxjob_bad',
        status: 'succeeded',
        result: {
          kind: 'workflow_eval',
          // missing required `passed`, `confidence`
          score: 1.5, // also out of 0..1 range
        },
      },
    };
    const out = contentJson(
      await client.callTool({
        name: 'cortex_run_job',
        arguments: {
          job_kind: 'workflow_eval',
          target_type: 'case',
          target_ref: 'case_123',
          project_id: 'proj_123',
        },
      }),
    ) as { status: string; error: { code: string } };
    expect(out.status).toBe('failed');
    expect(out.error.code).toBe('result_schema_validation_failed');
  });
});

describe('cortex_run_eval', () => {
  it('hard-codes job_kind="workflow_eval"', async () => {
    await client.callTool({
      name: 'cortex_run_eval',
      arguments: {
        target_type: 'case',
        target_ref: 'case_123',
        project_id: 'proj_123',
        criteria: '{"optimize_for":["sla"]}',
      },
    });
    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/cortex/jobs');
    expect((call?.body as { job_kind?: string })?.job_kind).toBe('workflow_eval');
  });
});

describe('cortex_run_counterfactual', () => {
  it('hard-codes job_kind="counterfactual_eval" and requires question', async () => {
    await client.callTool({
      name: 'cortex_run_counterfactual',
      arguments: {
        target_type: 'case',
        target_ref: 'case_123',
        project_id: 'proj_123',
        question: 'What if Alice owned this?',
      },
    });
    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/cortex/jobs');
    expect(call?.body).toMatchObject({
      job_kind: 'counterfactual_eval',
      target_type: 'case',
      target_ref: 'case_123',
      project_id: 'proj_123',
      question: 'What if Alice owned this?',
    });
  });

  it('rejects empty question (counterfactual must label a hypothesis)', async () => {
    const result = await client.callTool({
      name: 'cortex_run_counterfactual',
      arguments: {
        target_type: 'case',
        target_ref: 'case_123',
        project_id: 'proj_123',
        question: '',
      },
    });
    expect(result.isError).toBe(true);
    expect(requests.some((r) => r.path === '/v1/cortex/jobs')).toBe(false);
  });
});

describe('cortex_get_job', () => {
  it('returns ID + status + safe metadata, dropping private artifact fields', async () => {
    const out = contentJson(
      await client.callTool({
        name: 'cortex_get_job',
        arguments: { job_id: 'ctxjob_123' },
      }),
    ) as Record<string, unknown>;

    expect(out.id).toBe('ctxjob_123');
    expect(out.status).toBe('queued');
    expect(out.target_ref).toBe('case_123');
    expect(out.actor_type).toBe('api_key');
    // MUST NOT leak private artifact / prompt fields.
    expect(out.raw_artifact).toBeUndefined();
    expect(out.prompt_spec_id).toBeUndefined();
  });

  it('URL-encodes the job id', async () => {
    await client.callTool({
      name: 'cortex_get_job',
      arguments: { job_id: 'ctxjob/with slash' },
    });
    const call = requests.find((r) => r.method === 'GET' && r.path.startsWith('/v1/cortex/jobs/'));
    expect(call?.path).toContain(encodeURIComponent('ctxjob/with slash'));
  });
});

describe('cortex_get_result', () => {
  it('returns the validated result for a known kind', async () => {
    const out = contentJson(
      await client.callTool({
        name: 'cortex_get_result',
        arguments: { job_id: 'ctxjob_123' },
      }),
    ) as { job_id: string; status: string; result: { kind: string; passed: boolean } };
    expect(out.job_id).toBe('ctxjob_123');
    expect(out.status).toBe('succeeded');
    expect(out.result.kind).toBe('workflow_eval');
    expect(out.result.passed).toBe(true);
  });

  it('marks status=failed when the platform returns a result that fails schema validation', async () => {
    getResultResponse = {
      status: 200,
      body: {
        job_id: 'ctxjob_bad',
        status: 'succeeded',
        result: {
          kind: 'counterfactual_eval',
          // missing observed_outcome, hypothetical_change, uncertainty, confidence
        },
      },
    };
    const out = contentJson(
      await client.callTool({
        name: 'cortex_get_result',
        arguments: { job_id: 'ctxjob_bad' },
      }),
    ) as { status: string; error: { code: string } };
    expect(out.status).toBe('failed');
    expect(out.error.code).toBe('result_schema_validation_failed');
  });

  it('passes unknown result kinds through unchanged (forward-compat with new job kinds)', async () => {
    getResultResponse = {
      status: 200,
      body: {
        job_id: 'ctxjob_exp',
        status: 'succeeded',
        result: {
          kind: 'workflow_experiment',
          variants: [{ name: 'A', score: 0.7 }],
          winner: 'A',
        },
      },
    };
    const out = contentJson(
      await client.callTool({
        name: 'cortex_get_result',
        arguments: { job_id: 'ctxjob_exp' },
      }),
    ) as { result: { kind: string; winner: string } };
    expect(out.result.kind).toBe('workflow_experiment');
    expect(out.result.winner).toBe('A');
  });

  it('surfaces platform 404 as a structured tool error', async () => {
    getResultResponse = {
      status: 404,
      body: { error: { code: 'not_found', message: 'job not found' } },
    };
    const result = await client.callTool({
      name: 'cortex_get_result',
      arguments: { job_id: 'ctxjob_missing' },
    });
    expect(result.isError).toBe(true);
    expect(contentText(result)).toContain('job not found');
  });
});

describe('validateCortexResult unit', () => {
  it('accepts a well-formed counterfactual_eval and applies defaults', () => {
    const ok = validateCortexResult({
      kind: 'counterfactual_eval',
      observed_outcome: 'Resolved in 4 days.',
      hypothetical_change: 'Alice assigned earlier.',
      answer: 'Likely ~2 days faster.',
      confidence: 0.6,
      uncertainty: 'Low sample size.',
    }) as Record<string, unknown>;
    expect(ok.assumptions).toEqual([]);
    expect(ok.evidence_refs).toEqual([]);
    expect(ok.estimated_impact).toEqual({});
  });

  it('rejects an outcome_attribution missing confidence', () => {
    expect(() =>
      validateCortexResult({
        kind: 'outcome_attribution',
        outcome: 'SLA missed',
        primary_factors: [],
      }),
    ).toThrow(/schema validation/);
  });

  it('passes through non-object / kind-less payloads', () => {
    expect(validateCortexResult(null)).toBe(null);
    expect(validateCortexResult('hello')).toBe('hello');
    expect(validateCortexResult({ foo: 'bar' })).toEqual({ foo: 'bar' });
  });
});
