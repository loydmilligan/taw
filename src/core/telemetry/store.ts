import { appendFile, readFile } from 'node:fs/promises';
import path from 'node:path';
import { telemetrySummarySchema } from './schema.js';
import type { SessionRecord } from '../../types/session.js';
import type { TelemetryRecord, TelemetryRequestSummary } from './types.js';

export function getTelemetryPath(session: SessionRecord): string {
  return path.join(session.sessionDir, 'ai-telemetry.jsonl');
}

export async function appendTelemetryRecord(
  session: SessionRecord,
  record: TelemetryRecord
): Promise<void> {
  await appendFile(getTelemetryPath(session), `${JSON.stringify(record)}\n`, 'utf8');
}

export async function readTelemetrySummaries(
  session: SessionRecord
): Promise<TelemetryRequestSummary[]> {
  try {
    const content = await readFile(getTelemetryPath(session), 'utf8');
    return content
      .split('\n')
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .filter((entry) => entry.event_type === 'request_summary')
      .map((entry) => telemetrySummarySchema.parse(entry));
  } catch {
    return [];
  }
}
