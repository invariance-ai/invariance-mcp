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
let launchResponse: { status: number; body: unknown };
let listJobsResponse: { status: number; body: unknown };
let retryResponse: { status: number; body: unknown };
let runsResponse: { status: number; body: unknown };
// When set, the next N GET /result calls return this before falling back to
// getResultResponse — lets async-poll tests advance status across polls.
let resultQueue: Array<{ status: number; body: unknown }>;

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
  resultQueue = [];

  const complexQueryResult = {
    kind: 'complex_query',
    short_answer: 'Yes, refund SLAs were met for 18 of 20 cases.',
    reasoning_plan: ['List refund cases', 'Check resolution times'],
    evidence_refs: ['case_1', 'case_2'],
    affected_entities: ['case_1'],
    confidence: 0.82,
    restricted_evidence_count: 1,
    recommended_action: 'Investigate the 2 breaches.',
    follow_up_questions: ['Which agents handled the breaches?'],
  };
  launchResponse = {
    status: 200,
    body: {
      job_id: 'ctxjob_ask',
      status: 'succeeded',
      mode: 'sync',
      deduplicated: false,
      result: complexQueryResult,
    },
  };
  listJobsResponse = {
    status: 200,
    body: {
      data: [{ id: 'ctxjob_123', status: 'succeeded', job_kind: 'complex_query' }],
      next_cursor: null,
    },
  };
  retryResponse = { status: 200, body: { job_id: 'ctxjob_123', status: 'queued' } };
  runsResponse = {
    status: 200,
    body: {
      runs: [
        { id: 'run_1', job_id: 'ctxjob_123', status: 'failed', error: 'timeout' },
        { id: 'run_2', job_id: 'ctxjob_123', status: 'succeeded' },
      ],
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

    if (method === 'POST' && url.pathname === '/v1/cortex/jobs/launch') {
      return json(launchResponse.body, launchResponse.status);
    }
    if (method === 'POST' && url.pathname === '/v1/cortex/jobs') {
      return json(postJobsResponse.body, postJobsResponse.status);
    }
    if (method === 'GET' && url.pathname === '/v1/cortex/jobs') {
      return json(listJobsResponse.body, listJobsResponse.status);
    }
    if (method === 'POST' && /^\/v1\/cortex\/jobs\/[^/]+\/retry$/.test(url.pathname)) {
      return json(retryResponse.body, retryResponse.status);
    }
    if (method === 'GET' && /^\/v1\/cortex\/jobs\/[^/]+\/runs$/.test(url.pathname)) {
      return json(runsResponse.body, runsResponse.status);
    }
    if (method === 'GET' && /^\/v1\/cortex\/jobs\/[^/]+\/result$/.test(url.pathname)) {
      const next = resultQueue.shift();
      const r = next ?? getResultResponse;
      return json(r.body, r.status);
    }
    if (method === 'GET' && /^\/v1\/cortex\/jobs\/[^/]+$/.test(url.pathname)) {
      return json(getJobResponse.body, getJobResponse.status);
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

  it('registers the governed launcher tools with correct read/write annotations', async () => {
    const result = await client.listTools();
    const names = new Set(result.tools.map((t) => t.name));
    for (const expected of [
      'cortex_ask',
      'cortex_launch',
      'cortex_list_jobs',
      'cortex_retry_job',
      'cortex_job_runs',
    ]) {
      expect(names.has(expected), `missing tool ${expected}`).toBe(true);
    }
    const tools = new Map(result.tools.map((t) => [t.name, t]));
    expect(tools.get('cortex_ask')?.annotations?.readOnlyHint).toBe(false);
    expect(tools.get('cortex_launch')?.annotations?.readOnlyHint).toBe(false);
    expect(tools.get('cortex_retry_job')?.annotations?.readOnlyHint).toBe(false);
    expect(tools.get('cortex_list_jobs')?.annotations?.readOnlyHint).toBe(true);
    expect(tools.get('cortex_job_runs')?.annotations?.readOnlyHint).toBe(true);
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

  it('validates a well-formed complex_query result and applies defaults', () => {
    const ok = validateCortexResult({
      kind: 'complex_query',
      short_answer: 'Yes.',
      evidence_refs: ['case_1'],
      confidence: 0.7,
    }) as Record<string, unknown>;
    expect(ok.reasoning_plan).toEqual([]);
    expect(ok.affected_entities).toEqual([]);
    expect(ok.restricted_evidence_count).toBe(0);
    expect(ok.follow_up_questions).toEqual([]);
  });
});

describe('cortex_ask', () => {
  it('launches complex_query sync and returns the cited result', async () => {
    const out = contentJson(
      await client.callTool({
        name: 'cortex_ask',
        arguments: { question: 'Were refund SLAs met last week?', project_id: 'proj_123' },
      }),
    ) as { job_id: string; status: string; result: { kind: string; short_answer: string; evidence_refs: string[] } };

    expect(out.status).toBe('succeeded');
    expect(out.result.kind).toBe('complex_query');
    expect(out.result.evidence_refs).toEqual(['case_1', 'case_2']);

    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/cortex/jobs/launch');
    expect(call?.body).toMatchObject({
      project_id: 'proj_123',
      job_kind: 'complex_query',
      // defaults: project-wide, sync
      target_type: 'project',
      target_ref: 'proj_123',
      mode: 'sync',
      question: 'Were refund SLAs met last week?',
    });
  });

  it('honors target_type/target_ref overrides', async () => {
    await client.callTool({
      name: 'cortex_ask',
      arguments: {
        question: 'Why did this run diverge?',
        project_id: 'proj_123',
        target_type: 'run',
        target_ref: 'run_1',
      },
    });
    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/cortex/jobs/launch');
    expect(call?.body).toMatchObject({ target_type: 'run', target_ref: 'run_1' });
  });

  it('async mode launches then polls until terminal', async () => {
    launchResponse = {
      status: 200,
      body: { job_id: 'ctxjob_async', status: 'queued', mode: 'async', deduplicated: false },
    };
    resultQueue = [
      { status: 200, body: { job_id: 'ctxjob_async', status: 'running' } },
      {
        status: 200,
        body: {
          job_id: 'ctxjob_async',
          status: 'succeeded',
          result: {
            kind: 'complex_query',
            short_answer: 'Done.',
            evidence_refs: [],
            confidence: 0.5,
          },
        },
      },
    ];
    const out = contentJson(
      await client.callTool({
        name: 'cortex_ask',
        arguments: { question: 'q', project_id: 'proj_123', mode: 'async' },
      }),
    ) as { status: string; result: { kind: string } };

    expect(out.status).toBe('succeeded');
    expect(out.result.kind).toBe('complex_query');
    const resultCalls = requests.filter((r) => /\/result$/.test(r.path));
    expect(resultCalls.length).toBe(2);
  }, 15_000);

  it('returns a structured error when the job fails', async () => {
    launchResponse = {
      status: 200,
      body: {
        job_id: 'ctxjob_fail',
        status: 'failed',
        mode: 'sync',
        deduplicated: false,
        error: 'runtime disabled',
      },
    };
    const out = contentJson(
      await client.callTool({
        name: 'cortex_ask',
        arguments: { question: 'q', project_id: 'proj_123' },
      }),
    ) as { status: string; error: { code: string; message: string } };
    expect(out.status).toBe('failed');
    expect(out.error.code).toBe('cortex_ask_failed');
    expect(out.error.message).toContain('runtime disabled');
  });

  it('flags a non-complex_query result as an error', async () => {
    launchResponse = {
      status: 200,
      body: {
        job_id: 'ctxjob_wrong',
        status: 'succeeded',
        mode: 'sync',
        deduplicated: false,
        result: { kind: 'workflow_eval', passed: true, confidence: 0.9, criteria_results: [], findings: [] },
      },
    };
    const out = contentJson(
      await client.callTool({
        name: 'cortex_ask',
        arguments: { question: 'q', project_id: 'proj_123' },
      }),
    ) as { status: string; error: { code: string } };
    expect(out.status).toBe('failed');
    expect(out.error.code).toBe('unexpected_result_kind');
  });
});

describe('cortex_launch', () => {
  it('maps inputs to the launch body and returns the validated result', async () => {
    const out = contentJson(
      await client.callTool({
        name: 'cortex_launch',
        arguments: {
          project_id: 'proj_123',
          job_kind: 'complex_query',
          mode: 'sync',
          target_type: 'project',
          target_ref: 'proj_123',
          question: 'How many open divergences?',
          idempotency_key: 'idem_1',
        },
      }),
    ) as { job_id: string; status: string; deduplicated: boolean; result: { kind: string } };

    expect(out.job_id).toBe('ctxjob_ask');
    expect(out.status).toBe('succeeded');
    expect(out.result.kind).toBe('complex_query');

    const call = requests.find((r) => r.method === 'POST' && r.path === '/v1/cortex/jobs/launch');
    expect(call?.body).toEqual({
      project_id: 'proj_123',
      job_kind: 'complex_query',
      mode: 'sync',
      target_type: 'project',
      target_ref: 'proj_123',
      question: 'How many open divergences?',
      idempotency_key: 'idem_1',
    });
  });

  it('rejects an unknown launcher job_kind before calling the API', async () => {
    const result = await client.callTool({
      name: 'cortex_launch',
      arguments: {
        project_id: 'proj_123',
        job_kind: 'workflow_eval',
        mode: 'sync',
        target_type: 'project',
        target_ref: 'proj_123',
      },
    });
    expect(result.isError).toBe(true);
    expect(requests.some((r) => r.path === '/v1/cortex/jobs/launch')).toBe(false);
  });
});

describe('cortex_list_jobs', () => {
  it('forwards status/kind/cursor/limit as query params', async () => {
    const out = contentJson(
      await client.callTool({
        name: 'cortex_list_jobs',
        arguments: { status: 'succeeded', kind: 'complex_query', limit: 10 },
      }),
    ) as { data: unknown[] };
    expect(Array.isArray(out.data)).toBe(true);

    const call = requests.find((r) => r.method === 'GET' && r.path.startsWith('/v1/cortex/jobs?'));
    expect(call?.path).toContain('status=succeeded');
    expect(call?.path).toContain('kind=complex_query');
    expect(call?.path).toContain('limit=10');
  });
});

describe('cortex_retry_job', () => {
  it('POSTs to the retry endpoint and returns {job_id, status}', async () => {
    const out = contentJson(
      await client.callTool({
        name: 'cortex_retry_job',
        arguments: { job_id: 'ctxjob_123' },
      }),
    ) as { job_id: string; status: string };
    expect(out.job_id).toBe('ctxjob_123');
    expect(out.status).toBe('queued');
    expect(
      requests.some((r) => r.method === 'POST' && r.path === '/v1/cortex/jobs/ctxjob_123/retry'),
    ).toBe(true);
  });
});

describe('cortex_job_runs', () => {
  it('returns the attempt history', async () => {
    const out = contentJson(
      await client.callTool({
        name: 'cortex_job_runs',
        arguments: { job_id: 'ctxjob_123' },
      }),
    ) as { runs: Array<{ id: string; status: string }> };
    expect(out.runs).toHaveLength(2);
    expect(out.runs[0].status).toBe('failed');
    expect(
      requests.some((r) => r.method === 'GET' && r.path === '/v1/cortex/jobs/ctxjob_123/runs'),
    ).toBe(true);
  });
});
