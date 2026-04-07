import { summarizeSessionUsage } from '../core/telemetry/derivation.js';
import { readTelemetrySummaries } from '../core/telemetry/store.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const sessionUsageCommand: CommandDefinition = {
  name: 'session-usage',
  description: 'Show usage and cost telemetry for the current session.',
  usage: '/session-usage',
  async run(_input, context) {
    const summaries = await readTelemetrySummaries(context.session);
    const usage = summarizeSessionUsage(summaries);

    return {
      entries: [
        {
          id: createId('session-usage'),
          kind: 'notice',
          title: 'Session Usage',
          body: [
            `Requests: ${usage.requests}`,
            `Total Cost: $${usage.totalCost.toFixed(6)}`,
            `Prompt Tokens: ${usage.promptTokens}`,
            `Completion Tokens: ${usage.completionTokens}`,
            `Reasoning Tokens: ${usage.reasoningTokens}`,
            `Cached Tokens: ${usage.cachedTokens}`,
            `Average Latency: ${usage.averageLatencyMs ?? 'n/a'} ms`,
            `Artifacts Generated: ${usage.artifactsGenerated}`
          ].join('\n')
        }
      ]
    };
  }
};
