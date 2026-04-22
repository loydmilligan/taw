import { afterEach, describe, expect, it } from 'vitest';
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  rm,
  writeFile
} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  getWikiInfo,
  initWiki,
  listWikiTopics,
  migrateLegacyWikiLayout,
  readWikiFile,
  wikiExists,
  writeWikiPage
} from '../src/services/wiki/manager.js';

const originalHome = process.env.HOME;

describe('wiki manager layout', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('initializes new topics under the topics directory', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-wiki-manager-'));
    process.env.HOME = tempDir;

    const info = await initWiki('vibecoding');

    expect(info.topicDir).toBe(
      path.join(tempDir, '.config', 'taw', 'wiki', 'topics', 'vibecoding')
    );
    await access(path.join(info.topicDir, 'index.md'));
    await access(path.join(tempDir, '.config', 'taw', 'wiki', 'research'));
  });

  it('finds legacy top-level topics during the migration window', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-wiki-manager-'));
    process.env.HOME = tempDir;

    const legacyTopicDir = path.join(
      tempDir,
      '.config',
      'taw',
      'wiki',
      'legacy-topic'
    );
    await mkdir(path.join(legacyTopicDir, 'pages', 'entities'), {
      recursive: true
    });
    await writeFile(path.join(legacyTopicDir, 'index.md'), '# legacy index\n');
    await writeFile(
      path.join(legacyTopicDir, 'pages', 'entities', 'claude-code.md'),
      '# Claude Code\n'
    );

    expect(await wikiExists('legacy-topic')).toBe(true);
    expect(await readWikiFile('legacy-topic', 'index.md')).toContain('legacy index');
    expect(await listWikiTopics()).toContain('legacy-topic');
    expect(getWikiInfo('legacy-topic').topicDir).toBe(legacyTopicDir);
  });

  it('moves legacy top-level topics into the topics directory without losing content', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-wiki-manager-'));
    process.env.HOME = tempDir;

    const legacyTopicDir = path.join(
      tempDir,
      '.config',
      'taw',
      'wiki',
      'legacy-topic'
    );
    await mkdir(path.join(legacyTopicDir, 'pages', 'sources'), {
      recursive: true
    });
    await writeFile(path.join(legacyTopicDir, 'index.md'), '# legacy index\n');
    await writeFile(
      path.join(legacyTopicDir, 'pages', 'sources', 'note.md'),
      '# Source Note\n'
    );

    const migrated = await migrateLegacyWikiLayout();

    expect(migrated).toEqual(['legacy-topic']);
    expect(getWikiInfo('legacy-topic').topicDir).toBe(
      path.join(tempDir, '.config', 'taw', 'wiki', 'topics', 'legacy-topic')
    );
    expect(
      await readFile(
        path.join(
          tempDir,
          '.config',
          'taw',
          'wiki',
          'topics',
          'legacy-topic',
          'pages',
          'sources',
          'note.md'
        ),
        'utf8'
      )
    ).toContain('Source Note');
  });

  it('writes new content into the migrated topics directory', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-wiki-manager-'));
    process.env.HOME = tempDir;

    await initWiki('vibecoding');
    const resolvedPath = await writeWikiPage(
      'vibecoding',
      'pages/entities/claude-code.md',
      '# Claude Code\n'
    );

    expect(resolvedPath).toBe(
      path.join(
        tempDir,
        '.config',
        'taw',
        'wiki',
        'topics',
        'vibecoding',
        'pages',
        'entities',
        'claude-code.md'
      )
    );
  });
});
