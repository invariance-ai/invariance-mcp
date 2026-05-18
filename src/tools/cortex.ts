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
] as const;

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

const KnownResult = z.discriminatedUnion('kind', [
  WorkflowEvalResult,
  CounterfactualEvalResult,
  OutcomeAttributionResult,
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
  if (kind !== 'workflow_eval' && kind !== 'counterfactual_eval' && kind !== 'outcome_attribution') {
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
    'Get a Cortex job\'s structured result. Returns {job_id, status, result?}. The result is validated against the known per-kind schemas (workflow_eval / counterfactual_eval / outcome_attribution). Raw artifacts (prompt input, raw model output) are NOT returned by this tool — they remain private on the platform.',
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
}
