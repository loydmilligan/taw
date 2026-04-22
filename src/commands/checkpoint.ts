/**
 * /checkpoint — Save a context bundle: session state, transcript, notes, and any active workflow state.
 *
 * Usage:
 *   /checkpoint <note>       — save a checkpoint with your annotation
 *   /checkpoint              — prompt for a note
 *   /checkpoint --list       — list saved checkpoints
 *
 * Captures:
 *   - Current mode, session metadata, workflow position
 *   - Recent transcript (last 30 entries)
 *   - Active lp-research session if one exists
 *   - Session artifacts
 *   - Your annotation note
 *
 * Saves to: ~/.config/taw/wiki/Checkpoints/YYYY-MM-DD-HH-MM-<slug>/
 */

import { mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';
import type { TranscriptEntry } from '../types/app.js';
import { getGlobalWikiRoot } from '../services/filesystem/paths.js';

const VAULT_DIR = getGlobalWikiRoot();
const CHECKPOINTS_DIR = path.join(VAULT_DIR, 'Checkpoints');
const TMP_BASE = path.join(os.tmpdir(), 'taw-research');
const LP_STATE_FILE = path.join(TMP_BASE, 'active-session.json');
const PAUSED_DIR = path.join(TMP_BASE, 'paused');

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40);
}

function formatTranscript(entries: TranscriptEntry[], limit = 30): string {
  return entries
    .slice(-limit)
    .map((e) => {
      const role = e.kind === 'user' ? '**USER**' : e.kind === 'assistant' ? '**ASSISTANT**' : `**${e.kind.toUpperCase()}**`;
      const title = e.title ? ` — ${e.title}` : '';
      return `${role}${title}\n\n${e.body}`;
    })
    .join('\n\n---\n\n');
}

async function loadLpResearchState(): Promise<object | null> {
  try {
    const raw = await readFile(LP_STATE_FILE, 'utf8');
    return JSON.parse(raw) as object;
  } catch {
    return null;
  }
}

async function listPausedSessions(): Promise<Array<{ id: string; topic: string; passes: number; pausedAt: string }>> {
  try {
    const entries = await readdir(PAUSED_DIR, { withFileTypes: true });
    const sessions = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = await readFile(path.join(PAUSED_DIR, entry.name, 'session.json'), 'utf8');
        const s = JSON.parse(raw) as { id: string; topic: string; passes: { pass: number }[]; pausedAt: string };
        sessions.push({ id: s.id, topic: s.topic, passes: s.passes.length, pausedAt: s.pausedAt });
      } catch { /* skip */ }
    }
    return sessions;
  } catch {
    return [];
  }
}

export const checkpointCommand: CommandDefinition = {
  name: 'checkpoint',
  description: 'Save an annotated context bundle: transcript, session state, active workflow, your notes.',
  usage: '/checkpoint <note>  |  /checkpoint --list',

  async run(input, context) {
    const sub = input.args[0];

    // ── list ────────────────────────────────────────────────────────────
    if (sub === '--list') {
      try {
        const dirs = await readdir(CHECKPOINTS_DIR, { withFileTypes: true });
        const entries = dirs.filter((d) => d.isDirectory()).map((d) => d.name).reverse();
        if (entries.length === 0) {
          return {
            entries: [{
              id: createId('cp'),
              kind: 'notice' as const,
              title: 'No Checkpoints',
              body: 'No checkpoints saved yet. Run `/checkpoint <note>` to save one.'
            }]
          };
        }
        return {
          entries: [{
            id: createId('cp'),
            kind: 'assistant' as const,
            title: 'Saved Checkpoints',
            body: `## Checkpoints (${entries.length})\n\n` + entries.map((e) => `- \`${e}\``).join('\n') +
              `\n\nLocation: \`${CHECKPOINTS_DIR}\``
          }]
        };
      } catch {
        return {
          entries: [{
            id: createId('cp'),
            kind: 'notice' as const,
            title: 'No Checkpoints',
            body: `No checkpoints directory yet at \`${CHECKPOINTS_DIR}\`.`
          }]
        };
      }
    }

    // ── prompt if no note ────────────────────────────────────────────────
    const note = input.args.join(' ').trim();
    if (!note) {
      return {
        entries: [{
          id: createId('cp'),
          kind: 'notice' as const,
          title: 'Checkpoint',
          body: 'Add a note describing what you want to capture:\n\n`/checkpoint <your note here>`\n\nExample: `/checkpoint finished pass 4 on scientist deaths, want to review findings before going deeper`'
        }]
      };
    }

    // ── save checkpoint ──────────────────────────────────────────────────
    const now = new Date();
    const ts = now.toISOString().replace(/[:.]/g, '-').slice(0, 16);
    const slug = slugify(note);
    const bundleDir = path.join(CHECKPOINTS_DIR, `${ts}-${slug}`);
    await mkdir(bundleDir, { recursive: true });

    // Detect active workflow
    const lpState = await loadLpResearchState();
    const pausedSessions = await listPausedSessions();
    const workflowSection = lpState
      ? `## Active lp-research Session\n\n\`\`\`json\n${JSON.stringify(lpState, null, 2)}\n\`\`\``
      : pausedSessions.length > 0
        ? `## Paused lp-research Sessions\n\n${pausedSessions.map((s) => `- **${s.topic}** (${s.passes} passes, paused ${s.pausedAt})`).join('\n')}`
        : '## Workflow State\n\n_No active research session._';

    const modeHistory = context.session.metadata.modeHistory;
    const artifacts = context.session.metadata.artifacts;

    // Write checkpoint.md
    const checkpointMd = [
      `---`,
      `type: taw-checkpoint`,
      `captured: "${now.toISOString()}"`,
      `mode: "${context.mode}"`,
      `session_id: "${context.session.metadata.id}"`,
      `session_slug: "${context.session.metadata.slug}"`,
      `---`,
      ``,
      `# Checkpoint`,
      ``,
      `**When:** ${now.toLocaleString()}`,
      `**Mode:** ${context.mode}`,
      `**Session:** ${context.session.metadata.slug}`,
      ``,
      `## Note`,
      ``,
      note,
      ``,
      `---`,
      ``,
      `## Session Context`,
      ``,
      `**Mode history:** ${modeHistory.join(' → ') || '_none_'}`,
      `**Provider:** ${context.session.metadata.provider} / ${context.session.metadata.model}`,
      `**Session dir:** \`${context.session.sessionDir}\``,
      ``,
      artifacts.length > 0
        ? `**Artifacts:**\n${artifacts.map((a) => `- \`${a.type}\` — ${a.title} (\`${a.path}\`)`).join('\n')}`
        : '**Artifacts:** none',
      ``,
      `---`,
      ``,
      workflowSection,
      ``,
      `---`,
      ``,
      `## Recent Transcript`,
      ``,
      formatTranscript(context.transcript, 30)
    ].join('\n');

    await writeFile(path.join(bundleDir, 'checkpoint.md'), checkpointMd, 'utf8');

    // Write raw transcript
    await writeFile(
      path.join(bundleDir, 'transcript.json'),
      JSON.stringify(context.transcript.slice(-50), null, 2),
      'utf8'
    );

    // Write lp-research state if active
    if (lpState) {
      await writeFile(path.join(bundleDir, 'research-state.json'), JSON.stringify(lpState, null, 2), 'utf8');
    }

    return {
      entries: [{
        id: createId('cp'),
        kind: 'notice' as const,
        title: 'Checkpoint Saved',
        body: [
          `**Note:** ${note}`,
          `**Bundle:** \`${bundleDir}\``,
          `**Captured:** transcript (${Math.min(context.transcript.length, 30)} entries), session state${lpState ? ', research session' : ''}`,
          ``,
          `\`/checkpoint --list\` to see all checkpoints`
        ].join('\n')
      }]
    };
  }
};
