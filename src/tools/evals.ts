import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg } from '../lib/util.js';

export function registerEvalTools(server: McpServer, client: InvarianceClient): void {
  server.tool(
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

  server.tool(
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

  server.tool(
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

  server.tool(
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

  server.tool(
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

  server.tool(
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

  server.tool(
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

  server.tool(
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

  server.tool(
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

  server.tool(
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

  server.tool(
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

  server.tool(
    'invariance_eval_case_create_from_run',
    'Snapshot an existing production run as a new eval case in a suite (captures the run\'s input + output as expected).',
    {
      suite_id: z.string(),
      body: z.string().describe(
        'CreateEvalCaseFromRunRequest as a JSON object string. Required: run_id (string). Optional: node_id (string — pick a specific node), metadata (object). Example: {"run_id":"run_abc123"}',
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

  server.tool(
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

  server.tool(
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

  server.tool(
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

  server.tool(
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
}
