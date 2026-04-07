import { writeFile } from 'node:fs/promises';
import { getProviderAdapter } from '../providers/index.js';
import type { TranscriptEntry } from '../../types/app.js';
import type { ProviderConfig } from '../../types/provider.js';
import type { SessionRecord } from '../../types/session.js';
import { updateSessionMetadata } from '../sessions/session-manager.js';

export async function generateSessionSummary(
  session: SessionRecord,
  transcript: TranscriptEntry[],
  providerConfig: ProviderConfig
): Promise<string> {
  let summary = '';

  try {
    const adapter = getProviderAdapter(providerConfig);
    adapter.validateConfig(providerConfig);
    summary = await adapter.sendMessage(
      [
        {
          role: 'system',
          content:
            'Summarize this TAW session in markdown with sections for Topics Covered, Decisions Made, Open Loops, and Suggested Next Steps.'
        },
        {
          role: 'user',
          content: renderTranscriptForSummary(transcript)
        }
      ],
      providerConfig
    );
  } catch {
    summary = buildLocalSummary(transcript);
  }

  await writeFile(session.summaryPath, `${summary.trim()}\n`, 'utf8');
  session.metadata.summaryStatus = 'ready';
  await updateSessionMetadata(session);
  return summary;
}

function renderTranscriptForSummary(transcript: TranscriptEntry[]): string {
  return transcript
    .filter((entry) => entry.kind === 'user' || entry.kind === 'assistant')
    .map((entry) => `${entry.kind.toUpperCase()}: ${entry.body}`)
    .join('\n\n');
}

function buildLocalSummary(transcript: TranscriptEntry[]): string {
  const userTurns = transcript.filter((entry) => entry.kind === 'user').map((entry) => entry.body);
  const assistantTurns = transcript
    .filter((entry) => entry.kind === 'assistant')
    .map((entry) => entry.body)
    .filter(Boolean);

  return [
    '# Session Summary',
    '',
    '## Topics Covered',
    userTurns.length ? userTurns.slice(0, 5).map((turn) => `- ${turn}`).join('\n') : '- No user topics captured yet.',
    '',
    '## Decisions Made',
    assistantTurns.length ? `- ${assistantTurns.at(-1)?.split('\n')[0] ?? 'No decisions recorded.'}` : '- No decisions recorded yet.',
    '',
    '## Open Loops',
    '- Confirm provider configuration if richer summaries are needed.',
    '- Review saved artifacts in the session artifacts folder.',
    '',
    '## Suggested Next Steps',
    '- Resume the session and continue the strongest open thread.',
    '- Use `/brainstorm` or `/workflow` if a structured artifact is needed next.'
  ].join('\n');
}
