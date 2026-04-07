import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';
import { captureFeedback, loadFeedback } from '../src/core/feedback/store.js';
import type { TranscriptEntry } from '../src/types/app.js';

const originalHome = process.env.HOME;

describe('feedback store', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;

    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('stores issue captures in the issue store with latest transcript context', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-feedback-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(path.join(cwd, '.ai', 'config.json'), JSON.stringify({ projectName: 'project' }));

    const session = await createSession({ cwd });
    const transcript: TranscriptEntry[] = [
      { id: 'u1', kind: 'user', body: 'Can you detail slash commands?' },
      { id: 'a1', kind: 'assistant', body: 'Here is an incorrect notification list.' }
    ];

    await captureFeedback(
      'issue',
      session,
      transcript,
      'General',
      'command list incorrect',
      'AI guessed unsupported commands'
    );

    const issues = await loadFeedback('issue', session);
    const ideas = await loadFeedback('idea', session);

    expect(issues).toHaveLength(1);
    expect(ideas).toHaveLength(0);
    expect(issues[0]?.latestUserMessage).toContain('slash commands');
    expect(issues[0]?.latestAssistantMessage).toContain('notification');
  });
});
