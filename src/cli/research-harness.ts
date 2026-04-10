#!/usr/bin/env node
import path from 'node:path';
import { runResearchHarness } from '../services/testing/research-harness.js';

const scenarioPath =
  readOption('--scenario') ??
  path.resolve(
    process.cwd(),
    'qa-fixtures',
    'research-harness',
    'politics-verification.json'
  );
const maxTurnsOverride = readNumberOption('--max-turns');
const keepSession = process.argv.includes('--keep-session');

const result = await runResearchHarness(scenarioPath, {
  maxTurnsOverride: maxTurnsOverride ?? undefined,
  keepSession
});

process.stdout.write(
  [
    `Research harness run complete.`,
    `Session: ${result.sessionName}`,
    `Run dir: ${result.runDir}`,
    `Transcript: ${result.transcriptPath}`,
    `Evaluation: ${result.evaluationPath}`
  ].join('\n') + '\n'
);

function readOption(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

function readNumberOption(name: string): number | null {
  const value = readOption(name);
  if (!value) {
    return null;
  }

  const numeric = Number(value);
  return Number.isInteger(numeric) && numeric > 0 ? numeric : null;
}
