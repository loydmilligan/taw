import { appendFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { currentDraftTitle, resolvePhaseAfterCommand } from '../app/state.js';
import type { AppState, TranscriptEntry } from '../types/app.js';
import { isSlashCommand, parseCommand } from '../commands/parser.js';
import { getCommandDefinition } from '../commands/registry.js';
import { executeChatTurn } from '../core/chat/engine.js';
import { createId } from '../utils/ids.js';
import { appendWikiDailyLog, parseWikiMode } from '../services/wiki/manager.js';

export async function runQueuedInputsHeadless(
  initialState: AppState,
  workingDirectory: string
): Promise<AppState> {
  let state = initialState;
  const logPath = path.join(state.session.sessionDir, 'headless.log');

  const log = async (level: 'INFO' | 'ERROR', message: string) => {
    const line = `[${new Date().toISOString()}] [${level}] ${message}\n`;
    try {
      await mkdir(path.dirname(logPath), { recursive: true });
      await appendFile(logPath, line, 'utf8');
    } catch {
      // logging must never crash the runner
    }
  };

  await log('INFO', `Headless run started. ${state.queuedInputs.length} queued input(s). Mode: ${state.mode}`);

  while (state.queuedInputs.length > 0) {
    const nextInput = state.queuedInputs[0] ?? '';
    state = {
      ...state,
      queuedInputs: state.queuedInputs.slice(1)
    };

    if (!nextInput.trim()) {
      continue;
    }

    const preview = nextInput.slice(0, 120).replace(/\n/g, ' ');
    await log('INFO', `Processing: ${preview}`);

    // Detect wiki ingest chat turns (non-command message while in Wiki Ingest mode)
    const wikiIngestTurn =
      !isSlashCommand(nextInput) && parseWikiMode(state.mode)?.type === 'Ingest'
        ? parseWikiMode(state.mode)
        : null;

    const ingestStartedAt = wikiIngestTurn ? new Date().toISOString() : null;

    if (wikiIngestTurn && ingestStartedAt) {
      const timeStr = ingestStartedAt.slice(11, 19);
      await appendWikiDailyLog(
        wikiIngestTurn.topic,
        `## ${timeStr} UTC — Ingest Started\n\n**Started:** ${ingestStartedAt}  `
      ).catch(() => {});
    }

    try {
      if (isSlashCommand(nextInput)) {
        state = await runCommandHeadless(state, nextInput, workingDirectory);
      } else {
        state = await runChatHeadless(state, nextInput);

        // Surface empty response — most likely cause is token-limit truncation
        const lastEntry = state.transcript.at(-1);
        if (lastEntry?.kind === 'assistant' && !lastEntry.body.trim()) {
          await log('ERROR', 'LLM returned an empty response. Check token limit (maxCompletionTokens) or API key. See session transcript for details.');
        }

        if (wikiIngestTurn) {
          const completedAt = new Date().toISOString();
          const summary = lastEntry?.kind === 'assistant' ? lastEntry.body.trim() : '(no summary)';
          await appendWikiDailyLog(
            wikiIngestTurn.topic,
            `**Completed:** ${completedAt}  \n\n${summary.slice(0, 800)}\n\n---`
          ).catch(() => {});
        }
      }
      await log('INFO', `Done. Mode: ${state.mode}, queued remaining: ${state.queuedInputs.length}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await log('ERROR', `Failed: ${message}`);

      if (wikiIngestTurn) {
        const failedAt = new Date().toISOString();
        await appendWikiDailyLog(
          wikiIngestTurn.topic,
          `**Failed:** ${failedAt}  \n\nError: ${message}\n\n---`
        ).catch(() => {});
      }

      // Re-throw so the process exits non-zero — callers can detect failure
      throw error;
    }
  }

  await log('INFO', 'Headless run complete.');
  return state;
}

async function runCommandHeadless(
  state: AppState,
  raw: string,
  workingDirectory: string
): Promise<AppState> {
  const parsed = parseCommand(raw);
  const command = getCommandDefinition(parsed.name);

  if (!command) {
    throw new Error(`Unknown command: /${parsed.name}. Try /help.`);
  }

  const userEntry: TranscriptEntry = {
    id: createId('user'),
    kind: 'user',
    body: raw
  };

  const transcript = [...state.transcript, userEntry];
  const result = await command.run(parsed, {
    cwd: workingDirectory,
    session: state.session,
    transcript,
    providerConfig: state.providerConfig,
    mode: state.mode,
    globalConfig: state.globalConfig,
    projectConfig: state.projectConfig
  });

  return {
    ...state,
    mode: result.mode ?? state.mode,
    phase:
      result.phase ??
      resolvePhaseAfterCommand(result.mode ?? state.mode, state.phase),
    provider: result.provider ?? state.provider,
    model: result.model ?? state.model,
    providerConfig: result.providerConfig ?? state.providerConfig,
    globalConfig: result.globalConfig ?? state.globalConfig,
    projectConfig:
      result.projectConfig === undefined
        ? state.projectConfig
        : result.projectConfig,
    session: result.session ?? state.session,
    queuedInputs: [...(result.queuedInputs ?? []), ...state.queuedInputs],
    transcript: [...transcript, ...result.entries]
  };
}

async function runChatHeadless(
  state: AppState,
  value: string
): Promise<AppState> {
  const trimmed = value.trim();
  const modeAtStart = state.mode;
  const userEntry: TranscriptEntry = {
    id: createId('user'),
    kind: 'user',
    body: trimmed
  };
  const assistantTextResult = await executeChatTurn({
    transcript: [...state.transcript, userEntry],
    latestUserInput: trimmed,
    mode: modeAtStart,
    providerConfig: state.providerConfig,
    globalConfig: state.globalConfig,
    commandReference: state.commandReference,
    session: state.session,
    projectConfig: state.projectConfig,
    onChunk: () => {}
  });

  const assistantEntry: TranscriptEntry = {
    id: createId('assistant'),
    kind: 'assistant',
    title: currentDraftTitle(modeAtStart),
    body: assistantTextResult.assistantText,
    draftState: modeAtStart === 'General' ? undefined : 'complete'
  };

  return {
    ...state,
    transcript: [...state.transcript, userEntry, assistantEntry],
    phase: modeAtStart === 'General' ? 'idle' : 'draft-ready'
  };
}
