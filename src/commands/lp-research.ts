/**
 * /lp-research — AI-planned research session with SearXNG + lightpanda ingest
 *
 * Usage:
 *   /lp-research "<topic>" [--results N] [--no-flashcards]
 *                          — generate research plan (auto-triggers pass 1)
 *   /lp-research run       — execute the current plan (auto-queued after plan)
 *   /lp-research deeper    — run another pass on the active session
 *   /lp-research pause     — save session state and step away (resumable later)
 *   /lp-research resume [topic-or-id] — resume a paused session
 *   /lp-research finalize  — end session permanently, move notes to vault (no resume)
 *   /lp-research status    — show current session summary
 */

import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile, copyFile, rm, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { promisify } from 'node:util';
import { getProviderAdapter } from '../core/providers/index.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition, CommandResult } from './types.js';
import type { ProviderConfig } from '../types/provider.js';

const execFileAsync = promisify(execFile);

const SEARXNG_URL = 'http://127.0.0.1:8080';
const VAULT_DIR = path.join(os.homedir(), '.config', 'taw', 'wiki');
export const TMP_BASE = path.join(os.tmpdir(), 'taw-research');
export const STATE_FILE = path.join(TMP_BASE, 'active-session.json');
const PAUSED_DIR = path.join(TMP_BASE, 'paused');

// ── State ─────────────────────────────────────────────────────────────────

interface ResearchQuestion {
  question: string;
}

interface ResearchPass {
  pass: number;
  focus: string;
  queries: string[];
  urls: string[];
  savedFiles: string[];
  summary: string;
  timestamp: string;
}

interface ResearchPlan {
  questions: string[];
  primarySources: string[];
  contemporaneousAccounts: string[];
  onlineChatter: string[];
  searchQueries: string[];
}

interface ResearchSession {
  id: string;
  topic: string;
  tmpDir: string;
  plan: ResearchPlan;
  questions: ResearchQuestion[];
  passes: ResearchPass[];
  startedAt: string;
  pausedAt?: string;
  options: { results: number; flashcards: boolean };
  status: 'planned' | 'running' | 'pass-complete' | 'paused' | 'finalizing';
}

async function loadSession(): Promise<ResearchSession | null> {
  try {
    const raw = await readFile(STATE_FILE, 'utf8');
    return JSON.parse(raw) as ResearchSession;
  } catch {
    return null;
  }
}

async function saveSession(session: ResearchSession): Promise<void> {
  await mkdir(TMP_BASE, { recursive: true });
  await writeFile(STATE_FILE, JSON.stringify(session, null, 2), 'utf8');
}

async function clearSession(): Promise<void> {
  try { await rm(STATE_FILE); } catch { /* ok */ }
}

async function listPausedSessions(): Promise<ResearchSession[]> {
  try {
    const entries = await readdir(PAUSED_DIR, { withFileTypes: true });
    const sessions: ResearchSession[] = [];
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      try {
        const raw = await readFile(path.join(PAUSED_DIR, entry.name, 'session.json'), 'utf8');
        sessions.push(JSON.parse(raw) as ResearchSession);
      } catch { /* skip */ }
    }
    return sessions.sort((a, b) => (b.pausedAt ?? b.startedAt).localeCompare(a.pausedAt ?? a.startedAt));
  } catch {
    return [];
  }
}

// ── Helpers ───────────────────────────────────────────────────────────────

async function searxngSearch(query: string, n: number): Promise<string[]> {
  const encoded = encodeURIComponent(query);
  const url = `${SEARXNG_URL}/search?q=${encoded}&format=json&categories=general`;
  try {
    const { stdout } = await execFileAsync('curl', ['-sf', '--max-time', '10', url]);
    const data = JSON.parse(stdout) as { results?: { url: string }[] };
    return (data.results ?? []).slice(0, n).map((r) => r.url);
  } catch {
    return [];
  }
}

async function searxngAvailable(): Promise<boolean> {
  try {
    await execFileAsync('curl', ['-sf', '--max-time', '5', SEARXNG_URL]);
    return true;
  } catch {
    return false;
  }
}

async function ingestUrl(url: string, saveDir: string, flashcards: boolean): Promise<string | null> {
  const lpBin = path.join(os.homedir(), 'bin', 'lp-research');
  const args = [url, '--deep', '--intel', '--save', '--save-path', saveDir, '--quiet'];
  if (flashcards) args.push('--flashcards');
  try {
    const { stdout } = await execFileAsync(lpBin, args, { timeout: 120_000 });
    const fp = stdout.trim();
    return fp && existsSync(fp) ? fp : null;
  } catch {
    return null;
  }
}

async function aiComplete(prompt: string, system: string, config: ProviderConfig): Promise<string> {
  const adapter = getProviderAdapter(config);
  return adapter.sendMessage(
    [{ role: 'system', content: system }, { role: 'user', content: prompt }],
    config
  );
}

async function collectFileSummaries(files: string[]): Promise<string> {
  const parts: string[] = [];
  for (const f of files) {
    try {
      const content = await readFile(f, 'utf8');
      parts.push(`### ${path.basename(f)}\n${content.split('\n').slice(0, 60).join('\n')}`);
    } catch { /* skip */ }
  }
  return parts.join('\n\n---\n\n');
}

function notice(title: string, body: string): CommandResult {
  return { entries: [{ id: createId('lpr'), kind: 'notice', title, body }] };
}

function content(title: string, body: string, extra?: Partial<CommandResult>): CommandResult {
  return { entries: [{ id: createId('lpr'), kind: 'assistant', title, body }], ...extra };
}

// ── Phase 1: Plan ──────────────────────────────────────────────────────────

async function generatePlan(
  topic: string,
  results: number,
  flashcards: boolean,
  config: ProviderConfig
): Promise<{ session: ResearchSession; planDisplay: string }> {
  const id = createId('lpr');
  const tmpDir = path.join(TMP_BASE, id);
  await mkdir(tmpDir, { recursive: true });

  const planRaw = await aiComplete(
    `Research topic: "${topic}"`,
    `You are a research strategist. Generate a structured research plan as JSON:
{
  "questions": ["question1", ...],           // 4-7 specific questions to answer
  "primarySources": ["source type", ...],    // 3-5 authoritative sources
  "contemporaneousAccounts": ["type", ...],  // 2-4 firsthand/original sources
  "onlineChatter": ["reddit, HN, etc", ...], // 2-3 community discussion venues
  "searchQueries": ["exact query", ...]      // 4-6 SearXNG queries to run
}
Respond with ONLY the JSON object.`,
    config
  );

  let plan: ResearchPlan;
  try {
    const m = planRaw.match(/\{[\s\S]*\}/);
    plan = JSON.parse(m?.[0] ?? planRaw);
  } catch {
    plan = {
      questions: [`What is ${topic}?`, `What are the key facts about ${topic}?`],
      primarySources: ['Wikipedia', 'official documentation'],
      contemporaneousAccounts: ['news archives', 'press releases'],
      onlineChatter: ['Reddit', 'Hacker News'],
      searchQueries: [topic, `${topic} overview`, `${topic} analysis`, `${topic} discussion`]
    };
  }

  const session: ResearchSession = {
    id, topic, tmpDir, plan,
    questions: plan.questions.map((q) => ({ question: q })),
    passes: [],
    startedAt: new Date().toISOString(),
    options: { results, flashcards },
    status: 'planned'
  };
  await saveSession(session);

  const planDisplay = [
    `## Research Plan — "${topic}"`,
    ``,
    `### Questions to Answer`,
    ...plan.questions.map((q, i) => `${i + 1}. ${q}`),
    ``,
    `### Sources`,
    `**Primary:** ${plan.primarySources.join(', ')}`,
    `**Contemporaneous:** ${plan.contemporaneousAccounts.join(', ')}`,
    `**Community:** ${plan.onlineChatter.join(', ')}`,
    ``,
    `### Search Queries`,
    ...plan.searchQueries.map((q) => `- ${q}`),
    ``,
    `---`,
    `_Ingesting sources now..._`
  ].join('\n');

  return { session, planDisplay };
}

// ── Phase 2: Run pass ──────────────────────────────────────────────────────

async function runPass(
  session: ResearchSession,
  passNum: number,
  queries: string[],
  focus: string,
  config: ProviderConfig
): Promise<{ updated: ResearchSession; summary: string }> {
  session.status = 'running';
  await saveSession(session);

  const passDir = path.join(session.tmpDir, `pass-${passNum}`);
  await mkdir(passDir, { recursive: true });

  const allUrls = new Set<string>();
  const prevUrls = new Set(session.passes.flatMap((p) => p.urls));

  for (const query of queries.slice(0, 4)) {
    const urls = await searxngSearch(query, Math.ceil(session.options.results / 2));
    urls.filter((u) => !prevUrls.has(u)).forEach((u) => allUrls.add(u));
    if (allUrls.size >= session.options.results * 2) break;
  }

  const urlsToIngest = [...allUrls].slice(0, session.options.results);
  const savedFiles: string[] = [];

  for (const url of urlsToIngest) {
    const fp = await ingestUrl(url, passDir, session.options.flashcards);
    if (fp) savedFiles.push(fp);
  }

  const contentSummary = savedFiles.length > 0
    ? await collectFileSummaries(savedFiles)
    : 'No content was successfully ingested.';

  const evaluation = await aiComplete(
    `Research topic: "${session.topic}"\n\nOriginal questions:\n${session.questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}\n\nIngested content (pass ${passNum}):\n${contentSummary}`,
    `You are a research analyst. Review the ingested content and produce a concise markdown evaluation:

## What We Found
(key findings from this pass)

## Questions Answered
(which questions have clear answers — with brief evidence)

## Gaps Remaining
(unanswered questions and what types of sources would help)

## Recommended Next Angles
(2-3 specific search angles for a follow-up pass)`,
    config
  );

  session.passes.push({
    pass: passNum, focus, queries,
    urls: urlsToIngest, savedFiles,
    summary: evaluation,
    timestamp: new Date().toISOString()
  });
  session.status = 'pass-complete';
  await saveSession(session);

  const allSaved = session.passes.flatMap((p) => p.savedFiles);
  const summary = [
    `## Pass ${passNum} Complete — "${session.topic}"`,
    ``,
    `**Focus:** ${focus}`,
    `**Queries run:** ${queries.join(', ')}`,
    `**Ingested:** ${savedFiles.length}/${urlsToIngest.length} URLs → \`${passDir}\``,
    ``,
    evaluation,
    ``,
    `---`,
    `**Total passes:** ${passNum}  ·  **Total notes:** ${allSaved.length}`,
    ``,
    `\`/lp-research deeper\` — another pass  ·  \`/lp-research pause\` — step away  ·  \`/lp-research finalize\` — finish permanently`
  ].join('\n');

  return { updated: session, summary };
}

// ── Deeper pass ────────────────────────────────────────────────────────────

async function planDeeperPass(
  session: ResearchSession,
  config: ProviderConfig
): Promise<{ queries: string[]; focus: string }> {
  const lastSummary = session.passes[session.passes.length - 1].summary;
  const raw = await aiComplete(
    `Topic: "${session.topic}"\n\nPrevious pass summary:\n${lastSummary}\n\nOriginal questions:\n${session.questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}`,
    `You are a research strategist. Based on gaps remaining, generate the next research pass as JSON:
{
  "searchQueries": ["query1", "query2", "query3", "query4"],
  "focus": "brief description of this pass's angle"
}
Focus on: contradictory accounts, primary sources, different perspectives, community discussion, deeper technical details. Respond with ONLY JSON.`,
    config
  );

  try {
    const m = raw.match(/\{[\s\S]*\}/);
    const parsed = JSON.parse(m?.[0] ?? raw) as { searchQueries: string[]; focus: string };
    return { queries: parsed.searchQueries, focus: parsed.focus };
  } catch {
    return {
      queries: [`${session.topic} criticism`, `${session.topic} alternative view`, `${session.topic} reddit`],
      focus: 'alternative perspectives and community discussion'
    };
  }
}

// ── Pause ─────────────────────────────────────────────────────────────────

async function pauseSession(session: ResearchSession): Promise<string> {
  const pausedAt = new Date().toISOString();
  session.status = 'paused';
  session.pausedAt = pausedAt;

  const pauseDir = path.join(PAUSED_DIR, session.id);
  await mkdir(pauseDir, { recursive: true });

  // Copy all ingested notes into paused dir for safekeeping
  const allFiles = session.passes.flatMap((p) => p.savedFiles);
  for (const file of allFiles) {
    if (existsSync(file)) {
      const dest = path.join(pauseDir, path.basename(file));
      try { await copyFile(file, dest); } catch { /* skip */ }
    }
  }

  // Update paths in session to point to paused dir
  const updatedSession = {
    ...session,
    passes: session.passes.map((p) => ({
      ...p,
      savedFiles: p.savedFiles.map((f) => path.join(pauseDir, path.basename(f)))
    }))
  };

  await writeFile(path.join(pauseDir, 'session.json'), JSON.stringify(updatedSession, null, 2), 'utf8');
  await clearSession();

  const allSaved = session.passes.flatMap((p) => p.savedFiles);
  return [
    `**Topic:** ${session.topic}`,
    `**Passes completed:** ${session.passes.length}`,
    `**Notes preserved:** ${allSaved.length} files → \`${pauseDir}\``,
    `**Paused at:** ${new Date(pausedAt).toLocaleString()}`,
    ``,
    `Resume anytime: \`/lp-research resume\` to see all paused sessions`,
    `or \`/lp-research resume ${session.id}\` to jump straight back in.`
  ].join('\n');
}

// ── Resume ────────────────────────────────────────────────────────────────

async function resumeSession(sessionId: string): Promise<{ session: ResearchSession; body: string }> {
  const pauseDir = path.join(PAUSED_DIR, sessionId);
  const raw = await readFile(path.join(pauseDir, 'session.json'), 'utf8');
  const session = JSON.parse(raw) as ResearchSession;

  // Restore to active tmpDir
  const newTmpDir = path.join(TMP_BASE, session.id);
  await mkdir(newTmpDir, { recursive: true });

  // Copy notes back to tmpDir passes
  for (const pass of session.passes) {
    const passDir = path.join(newTmpDir, `pass-${pass.pass}`);
    await mkdir(passDir, { recursive: true });
    for (const file of pass.savedFiles) {
      if (existsSync(file)) {
        try { await copyFile(file, path.join(passDir, path.basename(file))); } catch { /* skip */ }
      }
    }
    pass.savedFiles = pass.savedFiles.map((f) => path.join(passDir, path.basename(f)));
  }

  session.tmpDir = newTmpDir;
  session.status = 'pass-complete';
  delete session.pausedAt;
  await saveSession(session);

  const allSaved = session.passes.flatMap((p) => p.savedFiles);
  const lastPass = session.passes[session.passes.length - 1];
  const body = [
    `**Topic:** ${session.topic}`,
    `**Passes:** ${session.passes.length}  ·  **Notes:** ${allSaved.length}`,
    `**Resumed from:** \`${pauseDir}\``,
    ``,
    `### Where We Left Off`,
    lastPass ? lastPass.summary : '_No passes completed yet._',
    ``,
    `---`,
    `\`/lp-research deeper\` — continue  ·  \`/lp-research finalize\` — finish permanently`
  ].join('\n');

  return { session, body };
}

// ── Finalize ───────────────────────────────────────────────────────────────

async function finalizeSession(session: ResearchSession, config: ProviderConfig): Promise<string> {
  const safeName = session.topic.slice(0, 50).replace(/[^a-z0-9]/gi, '-').replace(/-+/g, '-');
  const destDir = path.join(VAULT_DIR, 'Research', safeName);
  await mkdir(destDir, { recursive: true });

  const allFiles = session.passes.flatMap((p) => p.savedFiles);
  let copied = 0;
  for (const file of allFiles) {
    if (existsSync(file)) {
      await copyFile(file, path.join(destDir, path.basename(file)));
      copied++;
    }
  }

  const allSummaries = session.passes.map((p) => `## Pass ${p.pass}: ${p.focus}\n${p.summary}`).join('\n\n---\n\n');
  const report = await aiComplete(
    `Research topic: "${session.topic}"\n\nAll pass summaries:\n${allSummaries}\n\nOriginal questions:\n${session.questions.map((q, i) => `${i + 1}. ${q.question}`).join('\n')}`,
    `Write a final research report in markdown:

# Research Report: [TOPIC]

## Executive Summary
(3-5 sentence overview)

## Questions — Answered
(each question with the answer and key evidence)

## Questions — Still Open
(unanswered questions)

## Key Sources
(most valuable sources found, by category)

## Confidence Assessment
(how solid are these findings, what might be missing)

## Suggested Further Research`,
    config
  );

  await writeFile(path.join(destDir, '_RESEARCH-REPORT.md'), report, 'utf8');
  await clearSession();

  // Clean up paused copy if it exists
  const pauseDir = path.join(PAUSED_DIR, session.id);
  if (existsSync(pauseDir)) {
    try { await rm(pauseDir, { recursive: true, force: true }); } catch { /* ok */ }
  }
  try { await rm(session.tmpDir, { recursive: true, force: true }); } catch { /* ok */ }

  return [
    `## Research Finalized — Permanent`,
    ``,
    `**Topic:** ${session.topic}`,
    `**Passes:** ${session.passes.length}  ·  **Notes:** ${copied}`,
    `**Vault:** \`${destDir}\``,
    ``,
    `> This session is closed and cannot be resumed. Notes are in the vault.`,
    ``,
    `---`,
    report
  ].join('\n');
}

// ── Command ────────────────────────────────────────────────────────────────

export const lpResearchCommand: CommandDefinition = {
  name: 'lp-research',
  description: 'AI-planned research session: SearXNG search + lightpanda ingest + iterative deepening.',
  usage: '/lp-research "<topic>"  |  run  |  deeper  |  pause  |  resume [id]  |  finalize  |  status',

  async run(input, context) {
    const sub = input.args[0];

    // ── status ────────────────────────────────────────────────────────────
    if (sub === 'status') {
      const session = await loadSession();
      if (!session) {
        const paused = await listPausedSessions();
        if (paused.length === 0) return notice('No Active Session', 'Start one: `/lp-research "<topic>"`');
        const body = [
          `_No active session. ${paused.length} paused session${paused.length !== 1 ? 's' : ''}:_`,
          ``,
          ...paused.map((s) => `- **${s.topic}** — ${s.passes.length} passes, paused ${s.pausedAt ? new Date(s.pausedAt).toLocaleDateString() : 'unknown'} — \`/lp-research resume ${s.id}\``)
        ].join('\n');
        return content('Research Status', body);
      }
      const allFiles = session.passes.flatMap((p) => p.savedFiles);
      const body = [
        `**Topic:** ${session.topic}`,
        `**Status:** ${session.status}`,
        `**Started:** ${new Date(session.startedAt).toLocaleString()}`,
        `**Passes:** ${session.passes.length}  ·  **Notes:** ${allFiles.length}`,
        `**Holding:** \`${session.tmpDir}\``,
        ``,
        `### Questions`,
        ...session.questions.map((q, i) => `${i + 1}. ${q.question}`),
        session.passes.length > 0
          ? `\n### Last Pass\n${session.passes[session.passes.length - 1].summary}`
          : '',
        ``,
        `\`/lp-research deeper\`  ·  \`/lp-research pause\`  ·  \`/lp-research finalize\``
      ].join('\n');
      return content('Research Status', body);
    }

    // ── run (auto-queued after plan) ──────────────────────────────────────
    if (sub === 'run') {
      const session = await loadSession();
      if (!session) return notice('No Active Session', 'Start one: `/lp-research "<topic>"`');
      if (session.status !== 'planned') {
        return notice('Already Running', 'Session has passes. Use `/lp-research deeper`, `/lp-research pause`, or `/lp-research finalize`.');
      }
      const { summary } = await runPass(session, 1, session.plan.searchQueries, 'Initial pass — primary sources', context.providerConfig);
      return content(`Pass 1 — ${session.topic}`, summary);
    }

    // ── deeper ────────────────────────────────────────────────────────────
    if (sub === 'deeper') {
      const session = await loadSession();
      if (!session) return notice('No Active Session', 'Start one: `/lp-research "<topic>"`');
      if (!(await searxngAvailable())) return notice('SearXNG Unavailable', `SearXNG not running at ${SEARXNG_URL}`);

      // Allow passing additional context/instructions after "deeper"
      const hint = input.args.slice(1).join(' ').trim();
      let { queries, focus } = await planDeeperPass(session, context.providerConfig);

      // If user provided a hint/direction, incorporate it into the focus and queries
      if (hint) {
        focus = hint.length > 80 ? hint.slice(0, 80) + '…' : hint;
        const hintQueries = await aiComplete(
          `Topic: "${session.topic}"\n\nUser's direction for this pass: "${hint}"\n\nGenerate 4 specific SearXNG search queries that follow this direction. Respond with ONLY a JSON array: ["query1", "query2", "query3", "query4"]`,
          `You are a research strategist. Generate targeted search queries based on the user's direction. Respond with ONLY a JSON array of strings.`,
          context.providerConfig
        );
        try {
          const m = hintQueries.match(/\[[\s\S]*\]/);
          queries = JSON.parse(m?.[0] ?? hintQueries) as string[];
        } catch { /* use AI-planned queries */ }
      }

      const passNum = session.passes.length + 1;
      const { summary } = await runPass(session, passNum, queries, focus, context.providerConfig);
      return content(`Pass ${passNum} — ${session.topic}`, summary);
    }

    // ── pause ─────────────────────────────────────────────────────────────
    if (sub === 'pause') {
      const session = await loadSession();
      if (!session) return notice('No Active Session', 'Nothing to pause.');
      const body = await pauseSession(session);
      return content('Research Paused', body);
    }

    // ── resume ────────────────────────────────────────────────────────────
    if (sub === 'resume') {
      const existing = await loadSession();
      if (existing) {
        return notice('Session Already Active', [
          `"${existing.topic}" is already active. Pause it first: \`/lp-research pause\``,
        ].join('\n'));
      }

      const idOrTopic = input.args.slice(1).join(' ').trim();
      const paused = await listPausedSessions();

      if (paused.length === 0) {
        return notice('No Paused Sessions', 'No paused research sessions found.');
      }

      if (!idOrTopic) {
        if (paused.length === 1) {
          // Auto-resume the only one
          const { body } = await resumeSession(paused[0].id);
          return content(`Resumed — ${paused[0].topic}`, body);
        }
        const list = paused.map((s, i) =>
          `${i + 1}. **${s.topic}** — ${s.passes.length} passes, paused ${s.pausedAt ? new Date(s.pausedAt).toLocaleDateString() : 'unknown'}\n   ID: \`${s.id}\``
        ).join('\n\n');
        return content('Paused Sessions', `${list}\n\nRun \`/lp-research resume <id>\` to resume one.`);
      }

      // Match by id or topic substring
      const match = paused.find((s) => s.id === idOrTopic || s.topic.toLowerCase().includes(idOrTopic.toLowerCase()));
      if (!match) {
        return notice('Not Found', `No paused session matching "${idOrTopic}". Run \`/lp-research resume\` to list them.`);
      }

      const { body } = await resumeSession(match.id);
      return content(`Resumed — ${match.topic}`, body);
    }

    // ── finalize ──────────────────────────────────────────────────────────
    if (sub === 'finalize') {
      const session = await loadSession();
      if (!session) {
        // Allow finalizing a paused session directly
        const idOrTopic = input.args.slice(1).join(' ').trim();
        if (idOrTopic) {
          const paused = await listPausedSessions();
          const match = paused.find((s) => s.id === idOrTopic || s.topic.toLowerCase().includes(idOrTopic.toLowerCase()));
          if (match) {
            const { session: resumed } = await resumeSession(match.id);
            const body = await finalizeSession(resumed, context.providerConfig);
            return content('Research Finalized', body);
          }
        }
        return notice('No Active Session', 'Start one: `/lp-research "<topic>"`');
      }
      const body = await finalizeSession(session, context.providerConfig);
      return content('Research Finalized', body);
    }

    // ── new session ───────────────────────────────────────────────────────
    let topic = '';
    let results = 5;
    let flashcards = true;

    for (let i = 0; i < input.args.length; i++) {
      const a = input.args[i];
      if (a === '--results' && input.args[i + 1]) { results = parseInt(input.args[++i], 10); }
      else if (a === '--no-flashcards') { flashcards = false; }
      else if (!a.startsWith('--') && !['run','deeper','pause','resume','finalize','status'].includes(a)) {
        topic = topic ? `${topic} ${a}` : a;
      }
    }

    if (!topic) {
      return notice('lp-research', [
        '`/lp-research "<topic>"` — start a new research session',
        '`/lp-research deeper [direction]` — run another pass',
        '`/lp-research pause` — step away (resumable)',
        '`/lp-research resume [id]` — pick back up',
        '`/lp-research finalize` — finish permanently, move to vault',
        '`/lp-research status` — show session state',
        '',
        '**Options:** `--results N` (default 5)  ·  `--no-flashcards`'
      ].join('\n'));
    }

    const existing = await loadSession();
    if (existing) {
      return notice('Session Already Active', [
        `Research on **"${existing.topic}"** is in progress (${existing.passes.length} pass${existing.passes.length !== 1 ? 'es' : ''}).`,
        '',
        '`/lp-research deeper`  ·  `/lp-research pause`  ·  `/lp-research finalize`'
      ].join('\n'));
    }

    if (!(await searxngAvailable())) {
      return notice('SearXNG Unavailable', `SearXNG not running at ${SEARXNG_URL} — start it first.`);
    }

    const { planDisplay } = await generatePlan(topic, results, flashcards, context.providerConfig);
    return content(
      `Research Plan — ${topic}`,
      planDisplay,
      { queuedInputs: ['/lp-research run'] }
    );
  }
};
