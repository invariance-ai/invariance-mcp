import { z } from 'zod';

export const monitorInvestigationPrompt = {
  name: 'monitor-investigation',
  description: 'Investigate why a monitor triggered or is failing',
  arguments: [
    {
      name: 'monitor_id',
      description: 'The ID of the monitor to investigate',
      required: true,
    },
  ],
  inputSchema: z.object({
    monitor_id: z
      .string()
      .min(1)
      .describe('The ID of the monitor to investigate'),
  }),

  render(input: { monitor_id: string }) {
    return {
      messages: [
        {
          role: 'user' as const,
          content: {
            type: 'text' as const,
            text: `You are an expert at investigating Invariance monitor behavior.

Investigate monitor ID: ${input.monitor_id}

Follow these steps:

1. **Get monitor details**: Use \`list_monitors\` to find the monitor and understand its configuration, type, and current status.

2. **Check recent runs**: Use \`run_monitor\` if appropriate, or use \`list_signals\` to see what signals this monitor has recently generated.

3. **Examine triggered signals**: For each signal, look at:
   - Severity level and message
   - Associated trace IDs
   - Timestamps and frequency

4. **Trace correlation**: For signals with trace IDs, use \`get_trace\` to understand what agent behavior triggered the monitor.

5. **Pattern analysis**: Use \`query_invariance\` to ask about patterns related to this monitor's triggers.

6. **Provide analysis**:
   - Why the monitor is triggering (or failing to trigger)
   - Whether the triggers are true positives or false positives
   - Recommendations for tuning the monitor configuration
   - Any underlying agent issues that should be addressed

Start by retrieving the monitor details.`,
          },
        },
      ],
    };
  },
};
