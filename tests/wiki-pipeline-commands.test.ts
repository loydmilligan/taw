/**
 * Vitest coverage for the five new wiki pipeline commands.
 * Each command is tested against a fixture map file in a temp directory.
 * Tests verify both happy-path behavior and error/not-found paths.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createSession } from '../src/core/sessions/session-manager.js';
import { wikiAddResearchCommand } from '../src/commands/wiki-add-research.js';
import { wikiFinalizeItemCommand } from '../src/commands/wiki-finalize-item.js';
import { wikiResolveItemCommand } from '../src/commands/wiki-resolve-item.js';
import { wikiSaveItemCommand } from '../src/commands/wiki-save-item.js';
import { wikiItemCommand } from '../src/commands/wiki-item.js';
import { readMapFile } from '../src/commands/map-file.js';
import { globalConfigSchema } from '../src/services/config/schema.js';
import type { CommandContext } from '../src/commands/types.js';

const originalHome = process.env.HOME;

// ─── Fixture helpers ──────────────────────────────────────────────────────────

const FIXTURE_MAP_CONTENT = `---
topic: "Test Exploration Topic"
session_type: brainstorm
phase: tagged
created: 2026-01-01
map_artifact: "/some/path/map.md"
open_items:
  - id: oi-001
    text: "Should we use PostgreSQL or SQLite?"
    tag: DECIDE
    status: open
  - id: oi-002
    text: "Research background job libraries"
    tag: RESEARCH
    status: open
---

# Test Map Body
`;

function makeInput(name: string, args: string[]): import('../src/commands/types.js').ParsedCommand {
  return { name, args, raw: `/${name} ${args.join(' ')}` };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

describe('wiki-add-research', () => {
  let tempDir = '';
  let mapFilePath = '';
  let context: CommandContext;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-test-'));
    process.env.HOME = tempDir;

    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'test' })
    );

    const session = await createSession({ cwd });

    // Write a fixture map file in the session's artifacts dir
    mapFilePath = path.join(session.artifactsDir, 'map-data.md');
    await writeFile(mapFilePath, FIXTURE_MAP_CONTENT, 'utf8');

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

  it('appends a new RESEARCH item with spawnedFrom set to parent id', async () => {
    const result = await wikiAddResearchCommand.run(
      makeInput('wiki-add-research', ['Additional', 'angle', 'to', 'explore', '--from', 'oi-001']),
      context
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.kind).toBe('notice');

    const mapData = await readMapFile(mapFilePath);
    expect(mapData.openItems).toHaveLength(3);

    const newItem = mapData.openItems.find((i) => i.spawnedFrom === 'oi-001');
    expect(newItem).toBeDefined();
    expect(newItem!.tag).toBe('RESEARCH');
    expect(newItem!.spawnedFrom).toBe('oi-001');
    expect(newItem!.status).toBe('open');
  });

  it('appends a RESEARCH item without spawnedFrom when --from not given', async () => {
    const result = await wikiAddResearchCommand.run(
      makeInput('wiki-add-research', ['Standalone', 'research', 'question']),
      context
    );

    expect(result.entries[0]!.kind).toBe('notice');

    const mapData = await readMapFile(mapFilePath);
    expect(mapData.openItems).toHaveLength(3);
    const newItem = mapData.openItems[2]!;
    expect(newItem.spawnedFrom).toBeUndefined();
    expect(newItem.tag).toBe('RESEARCH');
  });

  it('returns error entry when no question text is given', async () => {
    const result = await wikiAddResearchCommand.run(
      makeInput('wiki-add-research', []),
      context
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.kind).toBe('error');
    expect(result.entries[0]!.title).toBe('Usage');
  });

  it('does not throw on expected failure paths', async () => {
    await expect(
      wikiAddResearchCommand.run(makeInput('wiki-add-research', []), context)
    ).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wiki-finalize-item', () => {
  let tempDir = '';
  let mapFilePath = '';
  let context: CommandContext;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-test-'));
    process.env.HOME = tempDir;

    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'test' })
    );

    const session = await createSession({ cwd });
    mapFilePath = path.join(session.artifactsDir, 'map-data.md');
    await writeFile(mapFilePath, FIXTURE_MAP_CONTENT, 'utf8');

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

  it('queues generation prompt and wiki-save-item for a DECIDE item', async () => {
    const result = await wikiFinalizeItemCommand.run(
      makeInput('wiki-finalize-item', ['oi-001']),
      context
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.kind).toBe('notice');
    expect(result.queuedInputs).toHaveLength(2);
    expect(result.queuedInputs![1]).toBe('/wiki-save-item oi-001');

    // Other items in map should be undisturbed
    const mapData = await readMapFile(mapFilePath);
    expect(mapData.openItems[1]!.id).toBe('oi-002');
    expect(mapData.openItems[1]!.tag).toBe('RESEARCH');
  });

  it('returns error entry for unknown item id', async () => {
    const result = await wikiFinalizeItemCommand.run(
      makeInput('wiki-finalize-item', ['oi-999']),
      context
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.kind).toBe('error');
    expect(result.entries[0]!.title).toBe('Item Not Found');
  });

  it('returns error entry when no item id provided', async () => {
    const result = await wikiFinalizeItemCommand.run(
      makeInput('wiki-finalize-item', []),
      context
    );

    expect(result.entries[0]!.kind).toBe('error');
  });

  it('returns error when trying to finalize a RESEARCH item', async () => {
    const result = await wikiFinalizeItemCommand.run(
      makeInput('wiki-finalize-item', ['oi-002']),
      context
    );

    expect(result.entries[0]!.kind).toBe('error');
    expect(result.entries[0]!.title).toBe('Wrong Command');
  });

  it('does not throw on expected failure paths', async () => {
    await expect(
      wikiFinalizeItemCommand.run(makeInput('wiki-finalize-item', ['oi-999']), context)
    ).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wiki-resolve-item', () => {
  let tempDir = '';
  let mapFilePath = '';
  let context: CommandContext;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-test-'));
    process.env.HOME = tempDir;

    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'test' })
    );

    const session = await createSession({ cwd });
    mapFilePath = path.join(session.artifactsDir, 'map-data.md');
    await writeFile(mapFilePath, FIXTURE_MAP_CONTENT, 'utf8');

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

  it('marks item as resolved and returns notice entry', async () => {
    const result = await wikiResolveItemCommand.run(
      makeInput('wiki-resolve-item', ['oi-002']),
      context
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.kind).toBe('notice');

    const mapData = await readMapFile(mapFilePath);
    expect(mapData.openItems[1]!.status).toBe('resolved');
    // Other item should be undisturbed
    expect(mapData.openItems[0]!.id).toBe('oi-001');
    expect(mapData.openItems[0]!.tag).toBe('DECIDE');
    expect(mapData.openItems[0]!.status).toBe('open');
  });

  it('returns error entry for unknown item id', async () => {
    const result = await wikiResolveItemCommand.run(
      makeInput('wiki-resolve-item', ['oi-999']),
      context
    );

    expect(result.entries[0]!.kind).toBe('error');
    expect(result.entries[0]!.title).toBe('Item Not Found');
  });

  it('returns error entry when no item id provided', async () => {
    const result = await wikiResolveItemCommand.run(
      makeInput('wiki-resolve-item', []),
      context
    );

    expect(result.entries[0]!.kind).toBe('error');
  });

  it('does not throw on expected failure paths', async () => {
    await expect(
      wikiResolveItemCommand.run(makeInput('wiki-resolve-item', ['oi-999']), context)
    ).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wiki-save-item', () => {
  let tempDir = '';
  let mapFilePath = '';
  let context: CommandContext;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-test-'));
    process.env.HOME = tempDir;

    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'test' })
    );

    const session = await createSession({ cwd });
    mapFilePath = path.join(session.artifactsDir, 'map-data.md');
    await writeFile(mapFilePath, FIXTURE_MAP_CONTENT, 'utf8');

    context = {
      cwd,
      session,
      // Provide a mock transcript with a completed assistant message
      transcript: [
        {
          id: 'entry-001',
          kind: 'assistant',
          body: '# Decision: PostgreSQL vs SQLite\n\n**Decision:** PostgreSQL\n\nWe chose PostgreSQL for production readiness.'
        }
      ],
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

  it('writes wiki_artifact path to the target item and marks it resolved', async () => {
    const result = await wikiSaveItemCommand.run(
      makeInput('wiki-save-item', ['oi-001']),
      context
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.kind).toBe('notice');
    expect(result.entries[0]!.title).toBe('Artifact Saved');

    const mapData = await readMapFile(mapFilePath);
    const savedItem = mapData.openItems.find((i) => i.id === 'oi-001');
    expect(savedItem).toBeDefined();
    expect(savedItem!.wikiArtifact).toBeDefined();
    expect(savedItem!.wikiArtifact).toContain(context.session.artifactsDir);
    expect(savedItem!.status).toBe('resolved');

    // Other item should be undisturbed
    expect(mapData.openItems[1]!.id).toBe('oi-002');
    expect(mapData.openItems[1]!.status).toBe('open');
  });

  it('returns error entry for unknown item id', async () => {
    const result = await wikiSaveItemCommand.run(
      makeInput('wiki-save-item', ['oi-999']),
      context
    );

    expect(result.entries[0]!.kind).toBe('error');
    expect(result.entries[0]!.title).toBe('Item Not Found');
  });

  it('returns error entry when no item id provided', async () => {
    const result = await wikiSaveItemCommand.run(
      makeInput('wiki-save-item', []),
      context
    );

    expect(result.entries[0]!.kind).toBe('error');
  });

  it('returns error when no assistant transcript entry is present', async () => {
    context.transcript = [];
    const result = await wikiSaveItemCommand.run(
      makeInput('wiki-save-item', ['oi-001']),
      context
    );

    expect(result.entries[0]!.kind).toBe('error');
    expect(result.entries[0]!.title).toBe('No Document Found');
  });

  it('does not throw on expected failure paths', async () => {
    await expect(
      wikiSaveItemCommand.run(makeInput('wiki-save-item', ['oi-999']), context)
    ).resolves.toBeDefined();
  });
});

// ─────────────────────────────────────────────────────────────────────────────

describe('wiki-item', () => {
  let tempDir = '';
  let mapFilePath = '';
  let context: CommandContext;

  beforeEach(async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-test-'));
    process.env.HOME = tempDir;

    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(
      path.join(cwd, '.ai', 'config.json'),
      JSON.stringify({ projectName: 'test' })
    );

    const session = await createSession({ cwd });
    mapFilePath = path.join(session.artifactsDir, 'map-data.md');
    await writeFile(mapFilePath, FIXTURE_MAP_CONTENT, 'utf8');

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

  it('returns notice entry for existing DECIDE item with item text in body', async () => {
    const result = await wikiItemCommand.run(
      makeInput('wiki-item', ['oi-001']),
      context
    );

    expect(result.entries).toHaveLength(1);
    expect(result.entries[0]!.kind).toBe('notice');
    expect(result.entries[0]!.body).toContain('Should we use PostgreSQL or SQLite?');

    // Item should be marked in-progress
    const mapData = await readMapFile(mapFilePath);
    expect(mapData.openItems[0]!.status).toBe('in-progress');
  });

  it('returns notice for RESEARCH item pointing to /research command', async () => {
    const result = await wikiItemCommand.run(
      makeInput('wiki-item', ['oi-002']),
      context
    );

    expect(result.entries[0]!.kind).toBe('notice');
    expect(result.entries[0]!.body).toContain('/research');
    expect(result.entries[0]!.body).toContain('wiki-resolve-item');
  });

  it('returns error entry for unknown item id', async () => {
    const result = await wikiItemCommand.run(
      makeInput('wiki-item', ['oi-999']),
      context
    );

    expect(result.entries[0]!.kind).toBe('error');
    expect(result.entries[0]!.title).toBe('Item Not Found');
  });

  it('returns error entry when no item id provided', async () => {
    const result = await wikiItemCommand.run(
      makeInput('wiki-item', []),
      context
    );

    expect(result.entries[0]!.kind).toBe('error');
    expect(result.entries[0]!.title).toBe('Usage');
  });

  it('does not throw on expected failure paths', async () => {
    await expect(
      wikiItemCommand.run(makeInput('wiki-item', ['oi-999']), context)
    ).resolves.toBeDefined();
  });
});
