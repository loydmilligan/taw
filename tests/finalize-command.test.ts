import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import { finalizeCommand } from '../src/commands/finalize.js';
import type { TranscriptEntry } from '../src/types/app.js';

const originalHome = process.env.HOME;

describe('finalize command', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('saves the latest assistant draft as an artifact and exits the mode', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-finalize-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    const transcript: TranscriptEntry[] = [
      { id: 'u1', kind: 'user', body: 'help me brainstorm' },
      {
        id: 'a1',
        kind: 'assistant',
        title: 'Draft Response',
        body: '# Project Brief\n\nDraft',
        draftState: 'complete'
      }
    ];

    const result = await finalizeCommand.run(
      { name: 'finalize', args: [], raw: '/finalize' },
      {
        cwd,
        session,
        transcript,
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'Brainstorm',
        globalConfig: {
          defaultProvider: 'openrouter',
          defaultModel: 'openrouter/auto',
          theme: {},
          outputBehavior: { autoSaveNotes: true },
          allowedContextDirs: [],
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    expect(result.mode).toBe('General');
    expect(session.metadata.artifacts).toHaveLength(1);
    expect(
      result.entries.some((entry) => entry.title === 'Artifact Saved')
    ).toBe(true);
  });

  it('ignores stale assistant replies and requires a completed draft response', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-finalize-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    const transcript: TranscriptEntry[] = [
      {
        id: 'a0',
        kind: 'assistant',
        title: 'Assistant',
        body: 'Earlier general reply'
      },
      {
        id: 'n1',
        kind: 'notice',
        title: 'Brainstorm Mode',
        body: 'Brainstorm mode is active.'
      }
    ];

    const result = await finalizeCommand.run(
      { name: 'finalize', args: [], raw: '/finalize' },
      {
        cwd,
        session,
        transcript,
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'Brainstorm',
        globalConfig: {
          defaultProvider: 'openrouter',
          defaultModel: 'openrouter/auto',
          theme: {},
          outputBehavior: { autoSaveNotes: true },
          allowedContextDirs: [],
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    expect(result.mode).toBeUndefined();
    expect(session.metadata.artifacts).toHaveLength(0);
    expect(result.entries[0]?.title).toBe('No Draft Available');
  });

  it('rejects interrupted drafts', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-finalize-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    const transcript: TranscriptEntry[] = [
      {
        id: 'a1',
        kind: 'assistant',
        title: 'Draft Response',
        body: '# Project Brief\n\nPartial draft',
        draftState: 'interrupted'
      }
    ];

    const result = await finalizeCommand.run(
      { name: 'finalize', args: [], raw: '/finalize' },
      {
        cwd,
        session,
        transcript,
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'Brainstorm',
        globalConfig: {
          defaultProvider: 'openrouter',
          defaultModel: 'openrouter/auto',
          theme: {},
          outputBehavior: { autoSaveNotes: true },
          allowedContextDirs: [],
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    expect(result.mode).toBeUndefined();
    expect(session.metadata.artifacts).toHaveLength(0);
    expect(result.entries[0]?.title).toBe('No Draft Available');
  });
});
