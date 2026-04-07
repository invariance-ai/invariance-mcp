const DOCS: Record<string, { title: string; content: string }> = {
  'getting-started': {
    title: 'Getting Started with Invariance',
    content: `# Getting Started with Invariance

Invariance is an observability platform for AI agents. It helps you monitor, debug, and improve your AI agent systems.

## Quick Start

1. **Sign up** at https://app.invariance.ai
2. **Get your API key** from Settings > API Keys
3. **Install the SDK** in your agent application:
   \`\`\`bash
   npm install @invariance/sdk
   \`\`\`
4. **Initialize** the SDK:
   \`\`\`typescript
   import { Invariance } from '@invariance/sdk';
   const inv = new Invariance({ apiKey: process.env.INVARIANCE_API_KEY });
   \`\`\`
5. **Instrument** your agent to emit traces and spans
6. **Set up monitors** to detect issues automatically

## Core Concepts

- **Traces**: End-to-end records of agent execution
- **Spans**: Individual steps within a trace (tool calls, LLM calls, etc.)
- **Monitors**: Rules that watch for specific patterns or anomalies
- **Signals**: Alerts generated when monitors detect issues
- **Sessions**: Groups of related traces from a single agent interaction`,
  },

  authentication: {
    title: 'Authentication',
    content: `# Authentication

All API requests require authentication via an API key.

## API Keys

1. Go to https://app.invariance.ai/settings/api-keys
2. Click "Create API Key"
3. Copy the key — it won't be shown again

## Usage

Set the API key as an environment variable:
\`\`\`bash
export INVARIANCE_API_KEY=inv_your_key_here
\`\`\`

Or pass it directly when initializing the SDK:
\`\`\`typescript
const inv = new Invariance({ apiKey: 'inv_your_key_here' });
\`\`\`

## Key Scopes

API keys can be scoped to specific permissions:
- **read**: View traces, monitors, signals
- **write**: Create monitors, run evaluations
- **admin**: Manage organization settings and members

## Rate Limits

- 1000 requests per minute per API key
- Rate limit headers are included in responses: \`X-RateLimit-Remaining\`, \`Retry-After\``,
  },

  traces: {
    title: 'Traces',
    content: `# Traces

Traces represent end-to-end records of agent execution in Invariance.

## What is a Trace?

A trace captures the full lifecycle of an agent action — from receiving a request to producing a final response. Each trace contains spans representing individual steps.

## Trace Structure

- **trace_id**: Unique identifier
- **name**: Human-readable trace name
- **status**: completed, error, running
- **startTime / endTime**: Timing information
- **spans**: Ordered list of execution steps

## Viewing Traces

### List recent traces
\`\`\`
GET /v1/traces?limit=20&status=completed
\`\`\`

### Get trace details
\`\`\`
GET /v1/traces/{trace_id}
\`\`\`

## Span Types

- **llm**: LLM API calls with model, tokens, and response
- **tool**: Tool/function calls with inputs and outputs
- **retrieval**: RAG retrieval operations
- **custom**: Application-specific spans`,
  },

  monitors: {
    title: 'Monitors',
    content: `# Monitors

Monitors watch your agent traces for specific patterns, anomalies, or policy violations.

## Monitor Types

- **Latency**: Alert when traces or spans exceed duration thresholds
- **Error Rate**: Alert when error rates exceed a threshold over a time window
- **Pattern**: Detect specific patterns in agent behavior (e.g., repeated tool calls)
- **Policy**: Enforce rules about what agents should or should not do
- **Custom**: User-defined rules using natural language or code

## Managing Monitors

### List monitors
\`\`\`
GET /v1/monitors
\`\`\`

### Run a monitor
\`\`\`
POST /v1/monitors/{monitor_id}/run
\`\`\`

## Monitor Status

- **active**: Running and checking traces
- **paused**: Temporarily disabled
- **error**: Failed to execute (check configuration)`,
  },

  signals: {
    title: 'Signals',
    content: `# Signals

Signals are alerts generated when monitors detect issues in your agent traces.

## Signal Properties

- **severity**: critical, warning, info
- **message**: Human-readable description
- **monitorId**: The monitor that generated the signal
- **traceId**: The trace that triggered the signal (if applicable)
- **detectedAt**: When the signal was generated

## Viewing Signals

### List recent signals
\`\`\`
GET /v1/signals?limit=20
\`\`\`

## Acting on Signals

1. Review the signal message and severity
2. Use \`get_trace\` to examine the associated trace
3. Investigate the root cause
4. Update monitor thresholds if needed`,
  },

  queries: {
    title: 'Queries',
    content: `# Queries

The Invariance query API lets you ask natural language questions about your observability data.

## How It Works

Send a natural language prompt and get structured answers derived from your traces, monitors, and signals.

## Usage

\`\`\`
POST /v1/query
{ "prompt": "What were the most common errors in the last 24 hours?" }
\`\`\`

## Example Queries

- "What were the most common errors in the last 24 hours?"
- "Which agents have the highest latency?"
- "Show me traces where the agent made more than 5 tool calls"
- "What monitors triggered most frequently this week?"
- "Compare error rates between v1 and v2 of my agent"`,
  },

  datasets: {
    title: 'Datasets',
    content: `# Datasets

Datasets in Invariance are collections of test inputs used for evaluating agent performance.

## Dataset Structure

- **name**: Human-readable dataset name
- **description**: What the dataset tests
- **itemCount**: Number of items in the dataset
- **items**: List of input/expected-output pairs

## Managing Datasets

### List datasets
\`\`\`
GET /v1/datasets
\`\`\`

## Using Datasets

Datasets are used with the evaluation system to:
1. Run your agent against known inputs
2. Compare outputs against expected results
3. Track performance over time`,
  },

  evals: {
    title: 'Evaluations',
    content: `# Evaluations

Evaluations run your agent against datasets to measure performance and detect regressions.

## Evaluation Flow

1. Select a dataset
2. Run the evaluation — your agent processes each dataset item
3. Results are scored and compared to previous runs

## Viewing Evaluations

### List evaluations
\`\`\`
GET /v1/evals?dataset_id=ds_abc123
\`\`\`

## Evaluation Metrics

- **score**: Overall evaluation score (0-1)
- **status**: running, completed, failed
- **Per-item results**: Individual scores for each dataset item`,
  },
};

export const VALID_TOPICS = Object.keys(DOCS);

export function getDocContent(
  topic: string,
): { title: string; content: string } | undefined {
  return DOCS[topic];
}
