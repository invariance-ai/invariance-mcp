import { z } from 'zod';

export const troubleshootingPrompt = {
  name: 'troubleshooting',
  description:
    'Help troubleshoot an issue with an Invariance-monitored agent',
  arguments: [
    {
      name: 'issue_description',
      description: 'Description of the issue you are experiencing',
      required: true,
    },
  ],
  inputSchema: z.object({
    issue_description: z
      .string()
      .min(1)
      .describe('Description of the issue you are experiencing'),
  }),

  render(input: { issue_description: string }) {
    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are an expert at troubleshooting AI agent issues using Invariance observability data.

The user has reported the following issue:
"${input.issue_description}"

Follow these steps to diagnose and resolve the issue:

1. **Identify the agent and session**: Use the \`list_traces\` tool to find recent traces that may be related to the issue. Look for traces with error statuses or unusual patterns.

2. **Inspect relevant traces**: For any suspicious traces, use \`get_trace\` to examine the spans in detail. Look for:
   - Failed spans or error status codes
   - Unusually long durations (bottlenecks)
   - Missing or incomplete spans
   - Unexpected tool calls or outputs

3. **Check monitors and signals**: Use \`list_signals\` to see if any monitors have flagged related issues. Cross-reference signal timestamps with the reported issue timeline.

4. **Query for patterns**: Use \`query_invariance\` with targeted questions about the issue to find broader patterns or recurring problems.

5. **Summarize findings**: Provide a clear diagnosis including:
   - Root cause (if identifiable)
   - Affected components
   - Timeline of events
   - Recommended remediation steps

Start by searching for recent traces related to the issue.`,
          },
        },
      ],
    };
  },
};
