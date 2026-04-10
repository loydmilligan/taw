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
    const last = summaries.at(-1);
    const warnings = [
      last?.total_cost != null &&
      context.globalConfig.budget.highTurnCostWarning > 0 &&
      last.total_cost >= context.globalConfig.budget.highTurnCostWarning
        ? `High last-turn cost: $${last.total_cost.toFixed(6)}`
        : null,
      context.globalConfig.budget.highSessionCostWarning > 0 &&
      usage.totalCost >= context.globalConfig.budget.highSessionCostWarning
        ? `High session cost: $${usage.totalCost.toFixed(6)}`
        : null
    ].filter(Boolean);

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
            `Artifacts Generated: ${usage.artifactsGenerated}`,
            warnings.length > 0 ? `Warnings:\n${warnings.join('\n')}` : ''
          ].join('\n')
        }
      ]
    };
  }
};
