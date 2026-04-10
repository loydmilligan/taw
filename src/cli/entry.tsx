#!/usr/bin/env node
import React from 'react';
import { render } from 'ink';
import { App } from '../app/App.js';
import { bootstrapApp } from './bootstrap.js';
import { readBrowserResearchPayload } from '../core/research/browser-payload.js';

const browserPayloadPath = readOption('--research-from-browser');
const state = await bootstrapApp(process.cwd(), {
  browserPayload: browserPayloadPath
    ? await readBrowserResearchPayload(browserPayloadPath)
    : null
});

render(<App state={state} />);

function readOption(name: string): string | null {
  const index = process.argv.indexOf(name);
  return index >= 0 ? (process.argv[index + 1] ?? null) : null;
}
