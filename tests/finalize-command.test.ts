import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import {
  finalizeCommand,
  finalizeGenerateCommand
} from '../src/commands/finalize.js';
import { addBrowserPayloadAsSource } from '../src/core/research/store.js';
import { globalConfigSchema } from '../src/services/config/schema.js';
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
          ...globalConfigSchema.parse({}),
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
          ...globalConfigSchema.parse({}),
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
          ...globalConfigSchema.parse({}),
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    expect(result.mode).toBeUndefined();
    expect(session.metadata.artifacts).toHaveLength(0);
    expect(result.entries[0]?.title).toBe('No Draft Available');
  });

  it('explains how to proceed when research finalize has no completed draft', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-finalize-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    const result = await finalizeCommand.run(
      { name: 'finalize', args: [], raw: '/finalize' },
      {
        cwd,
        session,
        transcript: [],
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'Research Politics',
        globalConfig: {
          ...globalConfigSchema.parse({}),
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    expect(result.entries[0]?.title).toBe('No Draft Available');
    expect(result.entries[0]?.body).toContain(
      'There is no completed research draft to save yet.'
    );
    expect(result.entries[0]?.body).toContain('/finalize-gen');
  });

  it('queues draft generation followed by finalize when no draft exists', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-finalize-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    const result = await finalizeGenerateCommand.run(
      { name: 'finalize-gen', args: [], raw: '/finalize-gen' },
      {
        cwd,
        session,
        transcript: [],
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'Research Politics',
        globalConfig: {
          ...globalConfigSchema.parse({}),
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    expect(result.queuedInputs).toHaveLength(2);
    expect(result.queuedInputs?.[0]).toContain(
      'Produce the complete final research draft now'
    );
    expect(result.queuedInputs?.[1]).toBe('/finalize');
    expect(result.entries[0]?.title).toBe('Draft Requested');
  });

  it('includes research sources and session notes in finalized research artifacts', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-finalize-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });
    await addBrowserPayloadAsSource(session, {
      kind: 'article',
      researchType: 'politics',
      url: 'https://example.com/source',
      title: 'Research Source',
      selectedText: null,
      pageTextExcerpt: 'source excerpt',
      userNote: 'source note',
      sentAt: new Date().toISOString(),
      initialQuestion: null
    });
    await writeFile(session.notesPath, '# Session Notes\n\nImportant branch');

    const result = await finalizeCommand.run(
      { name: 'finalize', args: [], raw: '/finalize' },
      {
        cwd,
        session,
        transcript: [
          {
            id: 'a1',
            kind: 'assistant',
            title: 'Draft Response',
            body: 'Latest research draft',
            draftState: 'complete'
          }
        ],
        providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
        mode: 'Research Politics',
        globalConfig: {
          ...globalConfigSchema.parse({}),
          providers: { openrouter: {}, openai: {}, anthropic: {} }
        },
        projectConfig: null
      }
    );

    const artifactPath = session.metadata.artifacts[0]?.path;
    expect(result.mode).toBe('General');
    expect(artifactPath).toBeTruthy();
    const artifact = await readFile(artifactPath!, 'utf8');
    expect(artifact).toContain('# Research Politics Dossier');
    expect(artifact).toContain('Latest research draft');
    expect(artifact).toContain('Research Source');
    expect(artifact).toContain('Important branch');
  });
});
