import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSession } from '../src/core/sessions/session-manager.js';
import { commitMapCommand } from '../src/commands/commit-map.js';
import { globalConfigSchema } from '../src/services/config/schema.js';
import type { CommandContext } from '../src/commands/types.js';

const FIXTURE_MAP_WITH_RESOLVED = `---
topic: "E2E Test Topic"
session_type: brainstorm
phase: tagged
created: 2026-01-01
map_artifact: "/tmp/fake-map-artifact.md"
open_items:
  - id: oi-001
    text: "Should we use PostgreSQL or SQLite?"
    tag: DECIDE
    status: resolved
    wiki_artifact: "/tmp/fake-decision.md"
  - id: oi-002
    text: "Research caching strategies"
    tag: RESEARCH
    status: open
---

# E2E Test Map Body
`;

const originalHome = process.env.HOME;

describe('commitMapCommand integration', () => {
  let tempDir = '';
  let context: CommandContext;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-commit-map-'));
    process.env.HOME = tempDir;

    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'test' })
    );

    const session = await createSession({ cwd });
    await writeFile(
      path.join(session.artifactsDir, 'map-data.md'),
      FIXTURE_MAP_WITH_RESOLVED,
      'utf8'
    );

    context = {
      cwd,
      session,
      transcript: [],
      providerConfig: { provider: 'openrouter', model: 'openrouter/auto' },
      mode: 'General',
      globalConfig: {
        ...globalConfigSchema.parse({}),
        providers: { openrouter: {}, openai: {}, anthropic: {} }
      },
      projectConfig: null
    };
  });

  afterEach(async () => {
    process.env.HOME = originalHome;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('creates index.md at expected path on success', async () => {
    const result = await commitMapCommand.run(
      { name: 'commit-map', args: [], raw: '/commit-map' },
      context
    );
    expect(result.entries[0]?.kind).toBe('notice');
    expect(result.entries[0]?.title).toBe('Map Committed to Vault');

    const indexPath = path.join(tempDir, '.config', 'taw', 'wiki', 'E2E Test Topic', 'index.md');
    const content = await readFile(indexPath, 'utf8');
    expect(content.length).toBeGreaterThan(0);
  });

  it('index.md contains YAML frontmatter with topic and resolved_count', async () => {
    await commitMapCommand.run(
      { name: 'commit-map', args: [], raw: '/commit-map' },
      context
    );
    const indexPath = path.join(tempDir, '.config', 'taw', 'wiki', 'E2E Test Topic', 'index.md');
    const content = await readFile(indexPath, 'utf8');
    expect(content.startsWith('---')).toBe(true);
    expect(content).toContain('topic: "E2E Test Topic"');
    expect(content).toContain('resolved_count: 1');
  });

  it('index.md contains [[wikilink]] for each resolved item with wiki_artifact', async () => {
    await commitMapCommand.run(
      { name: 'commit-map', args: [], raw: '/commit-map' },
      context
    );
    const indexPath = path.join(tempDir, '.config', 'taw', 'wiki', 'E2E Test Topic', 'index.md');
    const content = await readFile(indexPath, 'utf8');
    expect(content).toContain('[[fake-decision]]');
    // The open RESEARCH item has no wiki_artifact, so no wikilink for it
    expect(content).not.toContain('Research caching strategies');
  });

  it('returns error entry with title "No Map Found" when no map file exists', async () => {
    await rm(path.join(context.session.artifactsDir, 'map-data.md'));
    const result = await commitMapCommand.run(
      { name: 'commit-map', args: [], raw: '/commit-map' },
      context
    );
    expect(result.entries[0]?.kind).toBe('error');
    expect(result.entries[0]?.title).toBe('No Map Found');
  });
});
