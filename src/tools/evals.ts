import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg, registerReadTool, registerWriteTool } from '../lib/util.js';

interface SeedSuiteRow {
  name?: string;
  input: Record<string, unknown>;
  expected?: Record<string, unknown>;
  assertions?: unknown[];
  mutations?: unknown[];
  metadata?: Record<string, unknown>;
}

interface SeedSuiteBody {
  name: string;
  suite_name?: string;
  description?: string;
  target_type?: string;
  metadata?: Record<string, unknown>;
  run?: boolean;
  rows: SeedSuiteRow[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function parseSeedSuiteBody(body: string): SeedSuiteBody {
  const parsed = parseJsonArg('body', body);
  if (!isRecord(parsed)) throw new Error('body must be a JSON object.');
  if (typeof parsed.name !== 'string' || parsed.name.trim().length === 0) {
    throw new Error('body.name is required.');
  }
  if (!Array.isArray(parsed.rows) || parsed.rows.length === 0) {
    throw new Error('body.rows must be a non-empty array.');
  }

  const rows = parsed.rows.map((raw, i): SeedSuiteRow => {
    if (!isRecord(raw)) throw new Error(`rows[${i}] must be an object.`);
    if (!isRecord(raw.input)) throw new Error(`rows[${i}].input is required and must be an object.`);
    if (raw.name !== undefined && typeof raw.name !== 'string') {
      throw new Error(`rows[${i}].name must be a string.`);
    }
    if (raw.expected !== undefined && !isRecord(raw.expected)) {
      throw new Error(`rows[${i}].expected must be an object.`);
    }
    if (raw.assertions !== undefined && !Array.isArray(raw.assertions)) {
      throw new Error(`rows[${i}].assertions must be an array.`);
    }
    if (raw.mutations !== undefined && !Array.isArray(raw.mutations)) {
      throw new Error(`rows[${i}].mutations must be an array.`);
    }
    if (raw.metadata !== undefined && !isRecord(raw.metadata)) {
      throw new Error(`rows[${i}].metadata must be an object.`);
    }
    return {
      name: raw.name,
      input: raw.input,
      expected: raw.expected,
      assertions: raw.assertions,
      mutations: raw.mutations,
      metadata: raw.metadata,
    };
  });

  return {
    name: parsed.name,
    suite_name: typeof parsed.suite_name === 'string' ? parsed.suite_name : undefined,
    description: typeof parsed.description === 'string' ? parsed.description : undefined,
    target_type: typeof parsed.target_type === 'string' ? parsed.target_type : undefined,
    metadata: isRecord(parsed.metadata) ? parsed.metadata : undefined,
    run: parsed.run === true,
    rows,
  };
}

export function registerEvalTools(server: McpServer, client: InvarianceClient): void {
  registerWriteTool(
    server,
    'invariance_eval_dataset_create',
    'Create a reusable eval dataset (a named collection of input/expected example rows used to drive experiments).',
    {
      body: z.string().describe(
        'CreateEvalDatasetRequest as a JSON object string. Required: name. Optional: description (string), metadata (object). Example: {"name":"refund-intents-v1","description":"customer refund queries with expected intent labels"}',
      ),
    },
    async ({ body }) => {
      const parsed = parseJsonArg('body', body);
      const res = await client.post<{ dataset: unknown }>('/v1/eval-datasets', parsed);
      return jsonResult(res.dataset);
    },
  );

  registerReadTool(
    server,
    'invariance_eval_dataset_list',
    'List eval datasets visible to the calling agent (paginated).',
    {
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/eval-datasets', { cursor, limit })),
  );

  registerReadTool(
    server,
    'invariance_eval_dataset_get',
    'Get a single eval dataset by ID.',
    { id: z.string().describe('Dataset ID, e.g. "eds_abc123".') },
    async ({ id }) => {
      const res = await client.get<{ dataset: unknown }>(
        `/v1/eval-datasets/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.dataset);
    },
  );

  registerWriteTool(
    server,
    'invariance_eval_dataset_append_example',
    'Append a single example row (input + expected output) to an existing dataset.',
    {
      id: z.string().describe('Dataset ID.'),
      body: z.string().describe(
        'CreateEvalDatasetExampleRequest as a JSON object string. Required: input (object — the example input bundle). Optional: expected (any), metadata (object), tags (string[]). Example: {"input":{"prompt":"I want my money back"},"expected":{"intent":"refund"}}',
      ),
    },
    async ({ id, body }) => {
      const parsed = parseJsonArg('body', body);
      const res = await client.post<{ example: unknown }>(
        `/v1/eval-datasets/${encodeURIComponent(id)}/examples`,
        parsed,
      );
      return jsonResult(res.example);
    },
  );

  registerReadTool(
    server,
    'invariance_eval_dataset_examples_list',
    'List example rows for a dataset (paginated).',
    {
      id: z.string(),
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ id, cursor, limit }) =>
      jsonResult(
        await client.get(`/v1/eval-datasets/${encodeURIComponent(id)}/examples`, {
          cursor,
          limit,
        }),
      ),
  );

  registerWriteTool(
    server,
    'invariance_eval_dataset_seed_suite',
    'One-call eval setup for agents: create a dataset, append rows, create a linked suite, create one case per row, and optionally start the eval run. This is the preferred MCP path for turning JSON examples into runnable evals.',
    {
      body: z.string().describe(
        'JSON object. Required: name (dataset name), rows (non-empty array of {name?, input, expected?, assertions?, mutations?, metadata?}). Optional: suite_name, description, target_type (default "custom"), metadata, run (boolean). Example: {"name":"refund-regression","run":true,"rows":[{"name":"happy","input":{"prompt":"approve refund"},"expected":{"assertions":[{"path":"outcome","op":"equals","value":"approved"}]}}]}',
      ),
    },
    async ({ body }) => {
      const spec = parseSeedSuiteBody(body);
      if (spec.suite_name === undefined || spec.suite_name === spec.name) {
        const res = await client.post<{
          dataset: { id: string } & Record<string, unknown>;
          suite: { id: string } & Record<string, unknown>;
          cases?: unknown[];
          [key: string]: unknown;
        }>('/v1/eval-datasets/seed-suite', {
          name: spec.name,
          description: spec.description,
          target_type: spec.target_type ?? 'custom',
          dataset_metadata: spec.metadata,
          suite_metadata: spec.metadata,
          rows: spec.rows.map((row, i) => ({
            name: row.name ?? `case-${String(i + 1).padStart(3, '0')}`,
            input: row.input,
            expected: row.expected,
            assertions: row.assertions,
            mutations: row.mutations,
            metadata: row.metadata,
          })),
          run: spec.run === true,
        });
        return jsonResult({
          ...res,
          id: res.suite.id,
          dataset_id: res.dataset.id,
          suite_id: res.suite.id,
          case_count: res.cases?.length ?? 0,
        });
      }
      const datasetRes = await client.post<{ dataset: { id: string } & Record<string, unknown> }>(
        '/v1/eval-datasets',
        {
          name: spec.name,
          description: spec.description,
          metadata: spec.metadata,
        },
      );
      const suiteRes = await client.post<{ suite: { id: string } & Record<string, unknown> }>(
        '/v1/eval-suites',
        {
          name: spec.suite_name ?? spec.name,
          description: spec.description,
          target_type: spec.target_type ?? 'custom',
          dataset_id: datasetRes.dataset.id,
          metadata: spec.metadata,
        },
      );
      const examples: unknown[] = [];
      const cases: unknown[] = [];
      for (const [i, row] of spec.rows.entries()) {
        const exampleRes = await client.post<{ example: { id: string } & Record<string, unknown> }>(
          `/v1/eval-datasets/${encodeURIComponent(datasetRes.dataset.id)}/examples`,
          {
            input: row.input,
            expected: row.expected,
            metadata: row.metadata,
          },
        );
        examples.push(exampleRes.example);
        const caseRes = await client.post<{ case: unknown }>(
          `/v1/eval-suites/${encodeURIComponent(suiteRes.suite.id)}/cases`,
          {
            name: row.name ?? `case-${String(i + 1).padStart(3, '0')}`,
            dataset_example_id: exampleRes.example.id,
            input_bundle: row.input,
            expected: row.expected,
            assertions: row.assertions,
            mutations: row.mutations,
            metadata: row.metadata,
          },
        );
        cases.push(caseRes.case);
      }
      const evalRun = spec.run
        ? (
            await client.post<{ eval_run: unknown }>(
              `/v1/eval-suites/${encodeURIComponent(suiteRes.suite.id)}/run`,
              {},
            )
          ).eval_run
        : undefined;
      return jsonResult({
        dataset: datasetRes.dataset,
        suite: suiteRes.suite,
        examples,
        cases,
        ...(evalRun ? { eval_run: evalRun } : {}),
        id: suiteRes.suite.id,
        dataset_id: datasetRes.dataset.id,
        suite_id: suiteRes.suite.id,
        case_count: cases.length,
      });
    },
  );

  registerWriteTool(
    server,
    'invariance_eval_scorer_create',
    'Register a scorer (named scoring rule that maps an output+expected pair to a 0..1 score). Built-in scorer kinds: exact_match, contains, numeric_tolerance, json_match, levenshtein.',
    {
      body: z.string().describe(
        'CreateEvalScorerRequest as a JSON object string. Required: name, kind. Optional: config (object — kind-specific, e.g. {"tolerance":0.1} for numeric_tolerance). Example: {"name":"refund-exact","kind":"exact_match"}',
      ),
    },
    async ({ body }) => {
      const parsed = parseJsonArg('body', body);
      const res = await client.post<{ scorer: unknown }>('/v1/eval-scorers', parsed);
      return jsonResult(res.scorer);
    },
  );

  registerReadTool(
    server,
    'invariance_eval_scorer_list',
    'List scorers visible to the calling agent (paginated).',
    {
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/eval-scorers', { cursor, limit })),
  );

  registerWriteTool(
    server,
    'invariance_eval_suite_create',
    'Create an eval suite (the legacy grouping for cases + runs). New work should generally prefer datasets; suites remain for back-compat and curated case sets.',
    {
      body: z.string().describe(
        'CreateEvalSuiteRequest as a JSON object string. Required: name. Optional: description (string), metadata (object).',
      ),
    },
    async ({ body }) => {
      const parsed = parseJsonArg('body', body);
      const res = await client.post<{ suite: unknown }>('/v1/eval-suites', parsed);
      return jsonResult(res.suite);
    },
  );

  registerReadTool(
    server,
    'invariance_eval_suite_list',
    'List eval suites visible to the calling agent (paginated).',
    {
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ cursor, limit }) =>
      jsonResult(await client.get('/v1/eval-suites', { cursor, limit })),
  );

  registerReadTool(
    server,
    'invariance_eval_suite_get',
    'Get an eval suite by ID.',
    { id: z.string() },
    async ({ id }) => {
      const res = await client.get<{ suite: unknown }>(
        `/v1/eval-suites/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.suite);
    },
  );

  registerWriteTool(
    server,
    'invariance_eval_case_create',
    'Add a case (input + expected) to an eval suite.',
    {
      suite_id: z.string(),
      body: z.string().describe(
        'CreateEvalCaseRequest as a JSON object string. Required: input_bundle (object). Optional: expected (any), metadata (object). Example: {"input_bundle":{"prompt":"hello"},"expected":"hi"}',
      ),
    },
    async ({ suite_id, body }) => {
      const parsed = parseJsonArg('body', body);
      const res = await client.post<{ case: unknown }>(
        `/v1/eval-suites/${encodeURIComponent(suite_id)}/cases`,
        parsed,
      );
      return jsonResult(res.case);
    },
  );

  registerWriteTool(
    server,
    'invariance_eval_case_create_from_run',
    'Snapshot an existing production run as a new eval case in a suite (captures the run\'s input + output as expected).',
    {
      suite_id: z.string(),
      body: z.string().describe(
        'CreateEvalCaseFromRunRequest as a JSON object string. Required: source_run_id (string). ' +
          'Optional: name (string), source_finding_id / source_signal_id (string — provenance; ' +
          "their evidence is copied into the case metadata), expected (object), assertions (array), " +
          'mutations (array), metadata (object). Example: {"source_run_id":"run_abc123","source_signal_id":"sig_1"}',
      ),
    },
    async ({ suite_id, body }) => {
      const parsed = parseJsonArg('body', body);
      const res = await client.post<{ case: unknown }>(
        `/v1/eval-suites/${encodeURIComponent(suite_id)}/cases/from-run`,
        parsed,
      );
      return jsonResult(res.case);
    },
  );

  registerReadTool(
    server,
    'invariance_eval_case_list',
    'List cases for an eval suite (paginated).',
    {
      suite_id: z.string(),
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ suite_id, cursor, limit }) =>
      jsonResult(
        await client.get(`/v1/eval-suites/${encodeURIComponent(suite_id)}/cases`, {
          cursor,
          limit,
        }),
      ),
  );

  registerWriteTool(
    server,
    'invariance_eval_suite_run',
    'Kick off an eval run: executes every case in the suite against a target (agent / recipe / inline override) and stores per-case results.',
    {
      suite_id: z.string(),
      body: z
        .string()
        .optional()
        .describe(
          'RunEvalSuiteRequest as a JSON object string. All fields optional — empty {} uses suite defaults. Fields: target (object — {"kind":"agent","agent_id":"agt_..."} or {"kind":"recipe","recipe_id":"rcp_..."}), metadata (object), case_ids (string[] — restrict to a subset). Example: {"target":{"kind":"agent","agent_id":"agt_abc"}}',
        ),
    },
    async ({ suite_id, body }) => {
      const parsed = body !== undefined ? parseJsonArg('body', body) ?? {} : {};
      const res = await client.post<{ eval_run: unknown }>(
        `/v1/eval-suites/${encodeURIComponent(suite_id)}/run`,
        parsed,
      );
      return jsonResult(res.eval_run);
    },
  );

  registerReadTool(
    server,
    'invariance_eval_run_get',
    'Get an eval run by ID (status, aggregate counts, timestamps, scorer specs).',
    { id: z.string().describe('Eval run ID, e.g. "erun_abc123".') },
    async ({ id }) => {
      const res = await client.get<{ eval_run: unknown }>(
        `/v1/eval-runs/${encodeURIComponent(id)}`,
      );
      return jsonResult(res.eval_run);
    },
  );

  registerReadTool(
    server,
    'invariance_eval_run_results',
    'List per-case results for an eval run (paginated). Each result has output, expected, scores (per-scorer 0..1), and pass/fail.',
    {
      id: z.string(),
      cursor: z
        .string()
        .optional()
        .describe('opaque pagination token from previous response next_cursor; pass through unchanged'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ id, cursor, limit }) =>
      jsonResult(
        await client.get(`/v1/eval-runs/${encodeURIComponent(id)}/results`, {
          cursor,
          limit,
        }),
      ),
  );

  registerReadTool(
    server,
    'invariance_eval_scorers_list_builtin',
    'List the built-in scorer kinds available on the platform (name + config schema). Use this to discover what you can pass in `scorer_specs` to invariance_eval_experiment_run.',
    {},
    async () => jsonResult(await client.get('/v1/scorers')),
  );

  registerWriteTool(
    server,
    'invariance_eval_experiment_run',
    'Execute an experiment against an existing eval run: applies a list of scorer specs to every case result and (optionally) records a baseline run for later compare. Populates eval_results.scores. Built-in scorer names: exact_match, contains, numeric_tolerance (config.tolerance: number), json_match, levenshtein.',
    {
      id: z.string().describe('Eval run ID to score, e.g. "erun_abc123".'),
      body: z.string().describe(
        'ExperimentRunRequest as a JSON object string. Required: scorer_specs (ScorerSpec[] — each {"name": ScorerName, "config"?: object}). Optional: baseline_run_id (string — pointer to a prior eval run for diffing). Example: {"scorer_specs":[{"name":"exact_match"},{"name":"numeric_tolerance","config":{"tolerance":0.1}}],"baseline_run_id":"erun_prev"}',
      ),
    },
    async ({ id, body }) => {
      const parsed = parseJsonArg('body', body);
      const res = await client.post<{ eval_run: unknown }>(
        `/v1/eval-runs/${encodeURIComponent(id)}/experiment`,
        parsed,
      );
      return jsonResult(res.eval_run);
    },
  );

  registerReadTool(
    server,
    'invariance_eval_experiment_compare',
    'Compare two scored eval runs case-by-case (CompareResponse: per-case ScoreDelta entries + aggregate deltas per scorer). Use to surface regressions vs. a baseline.',
    {
      id: z.string().describe('Eval run ID (the new / candidate run).'),
      baseline: z.string().describe('Baseline eval run ID to diff against.'),
    },
    async ({ id, baseline }) => {
      const res = await client.get<{ comparison: unknown }>(
        `/v1/eval-runs/${encodeURIComponent(id)}/compare`,
        { baseline },
      );
      return jsonResult(res.comparison);
    },
  );
}
