#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { readFile } from 'node:fs/promises';
import { App } from '../app/App.js';
import { bootstrapApp } from './bootstrap.js';
import { readBrowserResearchPayload } from '../core/research/browser-payload.js';
import { runQueuedInputsHeadless } from './run-queued-headless.js';

const browserPayloadPath = readOption('--research-from-browser');
const queuedInputsPath = readOption('--queued-inputs-file');
const runQueuedAndExit = process.argv.includes('--run-queued-and-exit');
const state = await bootstrapApp(process.cwd(), {
  browserPayload: browserPayloadPath
    ? await readBrowserResearchPayload(browserPayloadPath)
    : null,
  queuedInputs: queuedInputsPath ? await readQueuedInputs(queuedInputsPath) : []
});

if (runQueuedAndExit) {
  await runQueuedInputsHeadless(state, process.cwd());
} else {
  render(<App state={state} />);
}

function readOption(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}

async function readQueuedInputs(filePath: string): Promise<string[]> {
  const content = await readFile(filePath, 'utf8');
  const parsed = JSON.parse(content) as unknown;
  return Array.isArray(parsed)
    ? parsed.filter((item): item is string => typeof item === 'string')
    : [];
}
