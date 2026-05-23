import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import type { InvarianceClient } from '../lib/client.js';
import { jsonResult, parseJsonArg, registerReadTool, registerWriteTool } from '../lib/util.js';

// ---- Job kinds, targets, actors --------------------------------------------

// Generic Cortex job kinds (see give-fiel-apth-for-zesty-forest plan).
const JOB_KINDS = [
  'workflow_eval',
  'counterfactual_eval',
  'workflow_experiment',
  'outcome_attribution',
  'recommendation_impact_eval',
  'prompt_variant_eval',
  'policy_eval',
] as const;
type JobKind = (typeof JOB_KINDS)[number];

const TARGET_TYPES = [
  'run',
  'case',
  'workflow',
  'step',
  'agent',
  'prompt',
  'policy',
  'recommendation',
  'external',
  'finding',
  'review',
  'eval_run',
  'project',
] as const;
type TargetType = (typeof TARGET_TYPES)[number];

// Governed-launcher job kinds (the read-only analyst + divergence tracker).
// These run through POST /v1/cortex/jobs/launch rather than the legacy
// POST /v1/cortex/jobs path that the cortex_run_* tools use.
const LAUNCHER_JOB_KINDS = ['divergence_error_tracking', 'complex_query'] as const;

const LAUNCH_MODES = ['sync', 'async'] as const;
type LaunchMode = (typeof LAUNCH_MODES)[number];

// Terminal lifecycle states — a job is done when it reaches one of these.
const TERMINAL_STATUSES = new Set(['succeeded', 'failed', 'dead', 'cancelled']);

// ---- Output schema validators ----------------------------------------------
// Plan §"Output Schemas". The MCP layer mirrors the platform's validation as a
// belt-and-suspenders check so a malformed model output never reaches the
// caller as a "succeeded" job. Unknown extra fields are stripped at parse time
// (Zod default), satisfying the plan's "fail closed or drop" rule for unknown
// output fields.

const EvidenceRefs = z.array(z.string()).default([]);

const WorkflowEvalResult = z.object({
  kind: z.literal('workflow_eval'),
  passed: z.boolean(),
  score: z.number().min(0).max(1).optional(),
  criteria_results: z
    .array(
      z.object({
        criterion: z.string(),
        passed: z.boolean(),
        evidence_refs: EvidenceRefs,
      }),
    )
    .default([]),
  findings: z.array(z.unknown()).default([]),
  confidence: z.number().min(0).max(1),
});

const CounterfactualEvalResult = z.object({
  kind: z.literal('counterfactual_eval'),
  observed_outcome: z.string(),
  hypothetical_change: z.string(),
  // The plan shows both `estimated_outcome` (Output Schemas section) and
  // `answer` (Result example). Accept either; require at least one.
  estimated_outcome: z.string().optional(),
  answer: z.string().optional(),
  estimated_impact: z.record(z.string(), z.unknown()).default({}),
  assumptions: z.array(z.string()).default([]),
  evidence_refs: EvidenceRefs,
  confidence: z.number().min(0).max(1),
  uncertainty: z.string(),
});

const OutcomeAttributionResult = z.object({
  kind: z.literal('outcome_attribution'),
  outcome: z.string(),
  primary_factors: z
    .array(
      z.object({
        factor: z.string(),
        impact: z.string(),
        evidence_refs: EvidenceRefs,
      }),
    )
    .default([]),
  confidence: z.number().min(0).max(1),
});

// Result of the read-only `complex_query` analyst. Every id in `evidence_refs`
// / `affected_entities` was observed through a governed read tool — the runtime
// fails closed against fabricated or cross-project ids.
const ComplexQueryResult = z.object({
  kind: z.literal('complex_query'),
  short_answer: z.string(),
  reasoning_plan: z.array(z.string()).default([]),
  evidence_refs: EvidenceRefs,
  affected_entities: z.array(z.string()).default([]),
  confidence: z.number().min(0).max(1),
  restricted_evidence_count: z.number().int().min(0).default(0),
  recommended_action: z.string().default(''),
  follow_up_questions: z.array(z.string()).default([]),
});

const DivergenceTopError = z.object({
  run_id: z.string(),
  kind: z.string(),
  severity: z.string(),
  status: z.string(),
  title: z.string(),
  summary: z.string(),
  suggested_action: z.string().nullable().default(null),
});

const DivergenceErrorTrackingResult = z.object({
  kind: z.literal('divergence_error_tracking'),
  target_type: z.string(),
  target_ref: z.string(),
  total_divergences: z.number().int().min(0),
  open_divergences: z.number().int().min(0),
  critical_open_divergences: z.number().int().min(0),
  by_kind: z.record(z.string(), z.number()).default({}),
  by_severity: z.record(z.string(), z.number()).default({}),
  by_status: z.record(z.string(), z.number()).default({}),
  affected_run_ids: z.array(z.string()).default([]),
  top_errors: z.array(DivergenceTopError).default([]),
  recommended_actions: z.array(z.string()).default([]),
});

const KnownResult = z.discriminatedUnion('kind', [
  WorkflowEvalResult,
  CounterfactualEvalResult,
  OutcomeAttributionResult,
  ComplexQueryResult,
  DivergenceErrorTrackingResult,
]);

const VALIDATED_KINDS = new Set([
  'workflow_eval',
  'counterfactual_eval',
  'outcome_attribution',
  'complex_query',
  'divergence_error_tracking',
]);

/**
 * Validate the platform's `result` field against the known per-kind schemas.
 * For job kinds we don't yet have a validator for (workflow_experiment, etc.),
 * pass the payload through untouched — the platform owns the canonical schema
 * and we don't want this client to lag a new job kind.
 *
 * Returns the normalized result (with defaults applied) or throws on a known
 * kind that fails validation.
 */
export function validateCortexResult(raw: unknown): unknown {
  if (
    raw === null ||
    typeof raw !== 'object' ||
    !('kind' in raw) ||
    typeof (raw as { kind?: unknown }).kind !== 'string'
  ) {
    return raw;
  }
  const kind = (raw as { kind: string }).kind;
  if (!VALIDATED_KINDS.has(kind)) {
    return raw;
  }
  const parsed = KnownResult.safeParse(raw);
  if (!parsed.success) {
    throw new Error(
      `Cortex job result failed schema validation for kind="${kind}": ${parsed.error.message}`,
    );
  }
  return parsed.data;
}

// ---- Safe projections -------------------------------------------------------
// The platform stores raw model artifacts (prompts, raw output, intermediate
// chains) keyed off the job. Per the plan §"Security And Privacy", artifacts
// are private by default and the MCP tool surface MUST NOT dump them — only
// fields safe for the calling actor.

const SAFE_JOB_FIELDS = new Set([
  'job_id',
  'id',
  'status',
  'job_kind',
  'project_id',
  'actor_type',
  'actor_id',
  'target_type',
  'target_ref',
  'question',
  'criteria',
  'created_at',
  'updated_at',
  'completed_at',
  'error',
  'dedupe_key',
]);

function pickSafeJob(raw: unknown): Record<string, unknown> {
  if (raw === null || typeof raw !== 'object') return {};
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (SAFE_JOB_FIELDS.has(k)) out[k] = v;
  }
  return out;
}

// ---- Shared input schema for job-create tools ------------------------------

const inputRefsShape = z
  .string()
  .optional()
  .describe(
    'JSON object of evidence references the runner may use. Optional keys: run_ids (string[]), case_ids (string[]), node_ids (string[]), chunk_ids (string[]), surface_item_ids (string[]). The platform ACL-filters these before prompt construction; refs the caller cannot access are dropped or the job is denied. Example: {"run_ids":["run_1"],"case_ids":["case_123"]}',
  );

const criteriaShape = z
  .string()
  .optional()
  .describe(
    'JSON object describing what the eval is optimizing for. Free-form per job_kind, but typical keys: optimize_for (string[]), constraints (string[]), pass_threshold (number 0..1). Example: {"optimize_for":["resolution_time"],"constraints":["do_not_expose_private_evidence"]}',
  );

const inputPayloadShape = z
  .string()
  .optional()
  .describe(
    'JSON object for inline target data. Required when target_type="external" (the target isn\'t a row in our DB). Example: {"workflow_name":"refund approval","steps":[]}',
  );

const optionsShape = z
  .string()
  .optional()
  .describe(
    'JSON object of execution options. Keys: use_llm (boolean), create_surface_item (boolean), timeout_ms (number), dedupe_key (string). Example: {"use_llm":true,"create_surface_item":false}',
  );

interface JobCreateBody {
  job_kind: JobKind;
  target_type: (typeof TARGET_TYPES)[number];
  target_ref: string;
  project_id?: string;
  question?: string;
  criteria?: unknown;
  input_refs?: unknown;
  input_payload?: unknown;
  options?: unknown;
}

function buildJobBody(args: {
  project_id?: string;
  job_kind: JobKind;
  target_type: (typeof TARGET_TYPES)[number];
  target_ref: string;
  question?: string;
  criteria?: string;
  input_refs?: string;
  input_payload?: string;
  options?: string;
}): JobCreateBody {
  const body: JobCreateBody = {
    job_kind: args.job_kind,
    target_type: args.target_type,
    target_ref: args.target_ref,
  };
  if (args.project_id !== undefined) body.project_id = args.project_id;
  if (args.question !== undefined) body.question = args.question;
  const criteria = parseJsonArg('criteria', args.criteria);
  if (criteria !== undefined) body.criteria = criteria;
  const input_refs = parseJsonArg('input_refs', args.input_refs);
  if (input_refs !== undefined) body.input_refs = input_refs;
  const input_payload = parseJsonArg('input_payload', args.input_payload);
  if (input_payload !== undefined) body.input_payload = input_payload;
  const options = parseJsonArg('options', args.options);
  if (options !== undefined) body.options = options;
  return body;
}

// Shape of the response the platform returns from POST /v1/cortex/jobs and
// GET /v1/cortex/jobs/:id. The MVP runner can attach an inline `result` when
// the job completed synchronously.
interface CortexJobResponse {
  job_id?: string;
  id?: string;
  status?: string;
  result?: unknown;
  [k: string]: unknown;
}

// ---- Governed launcher (read-only analyst + divergence tracker) ------------
// These tools wrap POST /v1/cortex/jobs/launch and the job lifecycle endpoints.
// The launcher resolves the actor server-side from the API key and ACL-filters
// all evidence before prompt construction; ids the caller cannot access are
// dropped (the `complex_query` analyst fails closed against fabricated or
// cross-project ids rather than guessing).

interface LaunchResponse {
  job_id?: string;
  id?: string;
  status?: string;
  mode?: string;
  deduplicated?: boolean;
  result?: unknown;
  error?: unknown;
  [k: string]: unknown;
}

interface ResultResponse {
  job_id?: string;
  id?: string;
  status?: string;
  result?: unknown;
  error?: unknown;
  [k: string]: unknown;
}

// Poll GET /v1/cortex/jobs/:id/result until the job reaches a terminal status.
async function pollResult(
  client: InvarianceClient,
  jobId: string,
  opts: { intervalMs?: number; timeoutMs?: number } = {},
): Promise<ResultResponse> {
  const intervalMs = opts.intervalMs ?? 2000;
  const timeoutMs = opts.timeoutMs ?? 120_000;
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const res = await client.get<ResultResponse>(
      `/v1/cortex/jobs/${encodeURIComponent(jobId)}/result`,
    );
    if (res.status !== undefined && TERMINAL_STATUSES.has(res.status)) return res;
    if (Date.now() + intervalMs >= deadline) {
      throw new Error(
        `Cortex job ${jobId} did not finish within ${timeoutMs}ms (last status: ${res.status ?? 'unknown'})`,
      );
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}

// ---- Tool registration ------------------------------------------------------

export function registerCortexTools(server: McpServer, client: InvarianceClient): void {
  registerWriteTool(
    server,
    'cortex_run_job',
    'Enqueue a generic Cortex job (evals, counterfactuals, experiments, attributions). The actor is resolved server-side from the API key (a key bound to an agent_id runs as that agent; otherwise as the api_key actor). The platform ACL-filters input_refs and target access before prompt construction. Returns {job_id, status} plus, when a synchronous MVP runner completes the job inline, the validated result.',
    {
      job_kind: z
        .enum(JOB_KINDS)
        .describe(
          'What kind of Cortex job to run. workflow_eval = check workflow behavior against criteria. counterfactual_eval = estimate what would have happened under a changed assumption (HYPOTHESIS, not fact). workflow_experiment = compare variants. outcome_attribution = explain why something succeeded/failed. recommendation_impact_eval / prompt_variant_eval / policy_eval = specialized variants.',
        ),
      target_type: z
        .enum(TARGET_TYPES)
        .describe(
          'Type of object being evaluated. Use "external" with input_payload when the target lives outside Invariance.',
        ),
      target_ref: z
        .string()
        .describe(
          'Stable reference to the target. For internal target_types this is the platform ID (e.g. "case_123"); for "external" it\'s the caller\'s ID for the object described in input_payload.',
        ),
      project_id: z
        .string()
        .describe(
          'Project ID. The platform uses this for target access checks and evidence filtering.',
        ),
      question: z
        .string()
        .optional()
        .describe(
          'Free-form question the job should answer. Required for counterfactual_eval (e.g. "What if Alice had owned this escalation earlier?"). Optional for workflow_eval where criteria suffice.',
        ),
      criteria: criteriaShape,
      input_refs: inputRefsShape,
      input_payload: inputPayloadShape,
      options: optionsShape,
    },
    async (args) => {
      const body = buildJobBody(args);
      const res = await client.post<CortexJobResponse>('/v1/cortex/jobs', body);
      const safe = pickSafeJob(res);
      if (res.result !== undefined) {
        try {
          safe.result = validateCortexResult(res.result);
        } catch (err) {
          return jsonResult({
            ...safe,
            status: 'failed',
            error: {
              code: 'result_schema_validation_failed',
              message: (err as Error).message,
            },
          });
        }
      }
      return jsonResult(safe);
    },
  );

  registerWriteTool(
    server,
    'cortex_run_eval',
    'Convenience wrapper around cortex_run_job for job_kind="workflow_eval": checks whether a run/case/workflow met its criteria (e.g. SLA, policy compliance, action-item ownership). Returns the same job shape as cortex_run_job.',
    {
      target_type: z.enum(TARGET_TYPES),
      target_ref: z.string(),
      project_id: z.string(),
      question: z.string().optional(),
      criteria: criteriaShape,
      input_refs: inputRefsShape,
      input_payload: inputPayloadShape,
      options: optionsShape,
    },
    async (args) => {
      const body = buildJobBody({ ...args, job_kind: 'workflow_eval' });
      const res = await client.post<CortexJobResponse>('/v1/cortex/jobs', body);
      const safe = pickSafeJob(res);
      if (res.result !== undefined) {
        try {
          safe.result = validateCortexResult(res.result);
        } catch (err) {
          return jsonResult({
            ...safe,
            status: 'failed',
            error: {
              code: 'result_schema_validation_failed',
              message: (err as Error).message,
            },
          });
        }
      }
      return jsonResult(safe);
    },
  );

  registerWriteTool(
    server,
    'cortex_run_counterfactual',
    'Convenience wrapper around cortex_run_job for job_kind="counterfactual_eval": estimates what MIGHT have happened under a hypothetical change. Result is a HYPOTHESIS, not fact — it carries assumptions, evidence_refs, confidence, and uncertainty. `question` is required.',
    {
      target_type: z.enum(TARGET_TYPES),
      target_ref: z.string(),
      question: z
        .string()
        .min(1)
        .describe(
          'The what-if question. Required. Example: "What if Alice owned this escalation from the start?"',
        ),
      project_id: z.string(),
      criteria: criteriaShape,
      input_refs: inputRefsShape,
      input_payload: inputPayloadShape,
      options: optionsShape,
    },
    async (args) => {
      const body = buildJobBody({ ...args, job_kind: 'counterfactual_eval' });
      const res = await client.post<CortexJobResponse>('/v1/cortex/jobs', body);
      const safe = pickSafeJob(res);
      if (res.result !== undefined) {
        try {
          safe.result = validateCortexResult(res.result);
        } catch (err) {
          return jsonResult({
            ...safe,
            status: 'failed',
            error: {
              code: 'result_schema_validation_failed',
              message: (err as Error).message,
            },
          });
        }
      }
      return jsonResult(safe);
    },
  );

  registerReadTool(
    server,
    'cortex_get_job',
    'Get a Cortex job\'s metadata and status (no artifacts). Returns the same safe-field projection as cortex_run_job: ids, status, target, actor, criteria, timestamps, error. Use cortex_get_result to fetch the structured result body.',
    {
      job_id: z.string().describe('Cortex job ID, e.g. "ctxjob_123".'),
    },
    async ({ job_id }) => {
      const res = await client.get<CortexJobResponse>(
        `/v1/cortex/jobs/${encodeURIComponent(job_id)}`,
      );
      const raw = res && typeof res === 'object' && 'job' in res
        ? (res as { job: unknown }).job
        : res;
      return jsonResult(pickSafeJob(raw));
    },
  );

  registerReadTool(
    server,
    'cortex_get_result',
    'Get a Cortex job\'s structured result. Returns {job_id, status, result?}. The result is validated against the known per-kind schemas (workflow_eval / counterfactual_eval / outcome_attribution / complex_query / divergence_error_tracking). Raw artifacts (prompt input, raw model output) are NOT returned by this tool — they remain private on the platform.',
    {
      job_id: z.string().describe('Cortex job ID, e.g. "ctxjob_123".'),
    },
    async ({ job_id }) => {
      const res = await client.get<CortexJobResponse>(
        `/v1/cortex/jobs/${encodeURIComponent(job_id)}/result`,
      );
      const out: Record<string, unknown> = {
        job_id: res.job_id ?? res.id ?? job_id,
        status: res.status,
      };
      if (res.result !== undefined) {
        try {
          out.result = validateCortexResult(res.result);
        } catch (err) {
          return jsonResult({
            ...out,
            status: 'failed',
            error: {
              code: 'result_schema_validation_failed',
              message: (err as Error).message,
            },
          });
        }
      }
      return jsonResult(out);
    },
  );

  // ---- Governed launcher tools ---------------------------------------------

  registerWriteTool(
    server,
    'cortex_ask',
    'Ask the READ-ONLY Cortex analyst (complex_query) an operational question and get a cited answer. Use this for questions like "Were refund SLAs met last week?", "Why did this run diverge?", "Which agents touched case_123?". The analyst is governed and EVIDENCE-CITED: every id in evidence_refs / affected_entities was observed through a read tool, and the runtime FAILS CLOSED against fabricated or cross-project ids (no answer is invented and no other tenant\'s data can leak). It only reads — it never mutates state. Returns the validated ComplexQueryResult {short_answer, reasoning_plan, evidence_refs, affected_entities, confidence, restricted_evidence_count, recommended_action, follow_up_questions}. mode="sync" (default) blocks for the answer; mode="async" enqueues then polls until the job is terminal. Note: the analyst only executes when the platform CORTEX_TOOL_RUNTIME_ENABLED flag is on.',
    {
      question: z
        .string()
        .min(1)
        .describe('The operational question to answer, in plain English.'),
      project_id: z
        .string()
        .describe('Project to scope the analyst to. All evidence is ACL-filtered to this project.'),
      target_type: z
        .enum(TARGET_TYPES)
        .optional()
        .describe('What to anchor the question on. Defaults to "project" (a project-wide question).'),
      target_ref: z
        .string()
        .optional()
        .describe('Id of the target entity (e.g. "run_1", "case_123"). Defaults to project_id when target_type is "project".'),
      mode: z
        .enum(LAUNCH_MODES)
        .optional()
        .describe('"sync" (default) blocks for the answer; "async" enqueues then polls until terminal.'),
    },
    async ({ question, project_id, target_type, target_ref, mode }) => {
      const targetType: TargetType = target_type ?? 'project';
      const targetRef = target_ref ?? (targetType === 'project' ? project_id : undefined);
      if (!targetRef) {
        throw new Error(`cortex_ask: target_ref is required for target_type "${targetType}"`);
      }
      const launchMode: LaunchMode = mode ?? 'sync';

      const launched = await client.post<LaunchResponse>('/v1/cortex/jobs/launch', {
        project_id,
        job_kind: 'complex_query',
        target_type: targetType,
        target_ref: targetRef,
        question,
        mode: launchMode,
      });

      const jobId = launched.job_id ?? launched.id ?? '';
      let status = launched.status;
      let result = launched.result;
      let error = launched.error;

      // A sync launch returns a terminal status with the result/error embedded;
      // only poll when the job is still in flight (async, or a non-terminal sync).
      if (status === undefined || !TERMINAL_STATUSES.has(status)) {
        const polled = await pollResult(client, jobId);
        status = polled.status;
        result = polled.result;
        error = polled.error;
      }

      if (status !== 'succeeded' || result === undefined || result === null) {
        return jsonResult({
          job_id: jobId,
          status: status ?? 'failed',
          error: {
            code: 'cortex_ask_failed',
            message: `cortex_ask: job ${jobId} ${status ?? 'failed'}${
              error ? `: ${typeof error === 'string' ? error : JSON.stringify(error)}` : ''
            }`,
          },
        });
      }

      let validated: unknown;
      try {
        validated = validateCortexResult(result);
      } catch (err) {
        return jsonResult({
          job_id: jobId,
          status: 'failed',
          error: {
            code: 'result_schema_validation_failed',
            message: (err as Error).message,
          },
        });
      }

      const kind =
        validated && typeof validated === 'object' && 'kind' in validated
          ? (validated as { kind?: unknown }).kind
          : undefined;
      if (kind !== 'complex_query') {
        return jsonResult({
          job_id: jobId,
          status: 'failed',
          error: {
            code: 'unexpected_result_kind',
            message: `cortex_ask: expected complex_query result, got "${String(kind)}"`,
          },
        });
      }

      return jsonResult({ job_id: jobId, status, result: validated });
    },
  );

  registerWriteTool(
    server,
    'cortex_launch',
    'Launch a Cortex job through the GOVERNED launcher (POST /v1/cortex/jobs/launch) — the preferred path for the read-only complex_query analyst and divergence_error_tracking. The actor is resolved server-side from the API key and all evidence is ACL-filtered before prompt construction (fails closed against cross-project leak). mode="sync" runs now and embeds result/error; mode="async" enqueues — poll with cortex_get_result or cortex_job_runs. Returns {job_id, status, mode, deduplicated, result?, error?}. Idempotent when idempotency_key is supplied.',
    {
      project_id: z.string().describe('Project the job runs against. Used for target access checks and evidence filtering.'),
      job_kind: z
        .enum(LAUNCHER_JOB_KINDS)
        .describe('complex_query = read-only cited analyst for operational questions. divergence_error_tracking = aggregate divergence/error findings for a target.'),
      mode: z.enum(LAUNCH_MODES).describe('"sync" runs now and embeds the result; "async" enqueues and returns the queued job.'),
      target_type: z.enum(TARGET_TYPES).describe('What the job runs against.'),
      target_ref: z.string().describe('Stable reference to the target (e.g. "run_1", "case_123", or the project_id for target_type="project").'),
      question: z
        .string()
        .optional()
        .describe('Free-form question for the analyst. Recommended for complex_query.'),
      idempotency_key: z
        .string()
        .optional()
        .describe('Dedupe key. Re-launching with the same key returns the existing job with deduplicated=true.'),
    },
    async ({ project_id, job_kind, mode, target_type, target_ref, question, idempotency_key }) => {
      const body: Record<string, unknown> = {
        project_id,
        job_kind,
        mode,
        target_type,
        target_ref,
      };
      if (question !== undefined) body.question = question;
      if (idempotency_key !== undefined) body.idempotency_key = idempotency_key;

      const res = await client.post<LaunchResponse>('/v1/cortex/jobs/launch', body);
      const out: Record<string, unknown> = {
        job_id: res.job_id ?? res.id,
        status: res.status,
        mode: res.mode ?? mode,
        deduplicated: res.deduplicated ?? false,
      };
      if (res.error !== undefined && res.error !== null) out.error = res.error;
      if (res.result !== undefined && res.result !== null) {
        try {
          out.result = validateCortexResult(res.result);
        } catch (err) {
          return jsonResult({
            ...out,
            status: 'failed',
            error: { code: 'result_schema_validation_failed', message: (err as Error).message },
          });
        }
      }
      return jsonResult(out);
    },
  );

  registerReadTool(
    server,
    'cortex_list_jobs',
    'List Cortex jobs across accessible projects, newest first. Filter by status and/or kind. Read-only. Returns {data: CortexJob[], next_cursor}. Pass next_cursor back as cursor to page.',
    {
      status: z
        .enum(['queued', 'leased', 'running', 'succeeded', 'failed', 'dead', 'cancelled'])
        .optional()
        .describe('Filter by lifecycle status.'),
      kind: z.string().optional().describe('Filter by job_kind, e.g. "complex_query", "workflow_eval".'),
      cursor: z
        .string()
        .optional()
        .describe('Opaque pagination token from a previous next_cursor; pass through unchanged.'),
      limit: z.number().int().positive().max(200).optional(),
    },
    async ({ status, kind, cursor, limit }) =>
      jsonResult(await client.get('/v1/cortex/jobs', { status, kind, cursor, limit })),
  );

  registerWriteTool(
    server,
    'cortex_retry_job',
    'Re-queue a failed or dead Cortex job for one more attempt (POST /v1/cortex/jobs/:id/retry). Returns {job_id, status}.',
    {
      job_id: z.string().describe('Cortex job ID to retry.'),
    },
    async ({ job_id }) =>
      jsonResult(
        await client.post(`/v1/cortex/jobs/${encodeURIComponent(job_id)}/retry`),
      ),
  );

  registerReadTool(
    server,
    'cortex_job_runs',
    'List the attempt history (audit-trail runs) for a Cortex job — one row per execution attempt, with status, model, metrics, timings, and any error. Read-only. Raw prompt/model artifacts are NOT included. Returns {runs: CortexJobRun[]}.',
    {
      job_id: z.string().describe('Cortex job ID, e.g. "ctxjob_123".'),
    },
    async ({ job_id }) =>
      jsonResult(
        await client.get(`/v1/cortex/jobs/${encodeURIComponent(job_id)}/runs`),
      ),
  );
}
