import { z } from 'zod';

export const traceAnalysisPrompt = {
  name: 'trace-analysis',
  description:
    'Analyze a trace to identify issues, bottlenecks, or anomalies',
  arguments: [
    {
      name: 'trace_id',
      description: 'The ID of the trace to analyze',
      required: true,
    },
  ],
  inputSchema: z.object({
    trace_id: z
      .string()
      .min(1)
      .describe('The ID of the trace to analyze'),
  }),

  render(input: { trace_id: string }) {
    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are an expert at analyzing AI agent execution traces.

Analyze trace ID: ${input.trace_id}

Follow these steps:

1. **Retrieve the trace**: Use \`get_trace\` to get the full trace with all spans.

2. **Structural analysis**: Map out the span hierarchy to understand the agent's execution flow:
   - Entry point and final outcome
   - Tool calls and their sequence
   - Branching and parallel execution paths

3. **Performance analysis**: Identify timing issues:
   - Total trace duration vs. expected
   - Individual span durations — flag anything unusually slow
   - Time gaps between spans (idle time)
   - Potential parallelization opportunities

4. **Error analysis**: Look for problems:
   - Spans with error status
   - Retry patterns (repeated similar spans)
   - Incomplete or missing expected spans
   - Error messages and stack traces in span attributes

5. **Behavioral analysis**: Assess agent decision-making:
   - Were tool calls appropriate for the task?
   - Were there unnecessary or redundant steps?
   - Did the agent handle errors gracefully?

6. **Cross-reference**: Use \`list_signals\` to check if any monitors flagged issues in this trace.

7. **Summary**: Provide:
   - Overall health assessment (healthy / degraded / failing)
   - Key findings ranked by severity
   - Specific recommendations for improvement
   - Comparison context if similar traces exist

Start by retrieving the full trace details.`,
          },
        },
      ],
    };
  },
};
