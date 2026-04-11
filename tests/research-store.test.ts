import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import {
  addBrowserPayloadAsSource,
  readResearchSources,
  readResearchSourceViews,
  removeResearchSourceView,
  upsertResearchSourceView,
  updateResearchSource
} from '../src/core/research/store.js';
import { extractRootDomain } from '../src/core/research/source-rating.js';

const originalHome = process.env.HOME;

describe('research store', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('stores browser payloads as session research sources with snapshots', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-research-store-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    const source = await addBrowserPayloadAsSource(session, {
      kind: 'article',
      researchType: 'politics',
      url: 'https://example.com/story',
      title: 'Example Story',
      selectedText: 'selected text',
      pageTextExcerpt: 'excerpt text',
      userNote: 'note',
      sentAt: new Date().toISOString(),
      initialQuestion: 'why does this matter'
    });

    const sources = await readResearchSources(session);

    expect(sources).toHaveLength(1);
    expect(sources[0]?.title).toBe('Example Story');
    expect(source.snapshotPath).toBeTruthy();
    expect(await readFile(source.snapshotPath!, 'utf8')).toContain(
      'excerpt text'
    );
  });

  it('updates source notes and reviewed status', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-research-store-'));
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
      url: 'https://example.com/story',
      title: 'Example Story',
      selectedText: null,
      pageTextExcerpt: null,
      userNote: null,
      sentAt: new Date().toISOString(),
      initialQuestion: null
    });
    const updated = await updateResearchSource(session, 1, {
      note: 'useful source',
      status: 'reviewed'
    });

    expect(updated?.note).toBe('useful source');
    expect((await readResearchSources(session))[0]?.status).toBe('reviewed');
  });

  it('extracts root domains for source ratings', () => {
    expect(extractRootDomain('https://edition.cnn.com/world/story')).toBe(
      'cnn.com'
    );
    expect(extractRootDomain('https://www.bbc.co.uk/news/story')).toBe(
      'bbc.co.uk'
    );
  });

  it('stores managed source views per session', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-research-store-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'project' })
    );
    const session = await createSession({ cwd });

    await upsertResearchSourceView(session, {
      sourceId: 'source-1',
      sourceIndex: 1,
      title: 'Example Story',
      tmuxWindowId: '@1',
      tmuxWindowName: 'src 1: Example Story',
      openedAt: '2026-04-10T00:00:00.000Z',
      lastOpenedAt: '2026-04-10T00:01:00.000Z'
    });

    expect(await readResearchSourceViews(session)).toHaveLength(1);

    await removeResearchSourceView(session, 'source-1');

    expect(await readResearchSourceViews(session)).toHaveLength(0);
  });
});
