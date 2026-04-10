import { execFile } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { promisify } from 'node:util';
import OpenAI from 'openai';
import { access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/loader.js';

const execFileAsync = promisify(execFile);
const HARD_MAX_TURNS = 8;

export interface ResearchHarnessScenario {
  name: string;
  description: string;
  cwd?: string;
  initialUserMessage: string;
  maxTurns: number;
  modelOverride?: string;
  humanGoalPrompt: string;
  verifierRules: {
    requiredSignals: string[];
    forbiddenSignals: string[];
  };
}

export interface HumanTurnDecision {
  action: 'send' | 'stop';
  message: string;
  rationale: string;
}

export interface HarnessRunResult {
  sessionName: string;
  runDir: string;
  transcriptPath: string;
  evaluationPath: string;
  finalPane: string;
}

interface HarnessEvaluation {
  verdict: 'pass' | 'fail';
  findings: string[];
  metrics: {
    researchBriefCount: number;
    clarificationQuestionCount: number;
    sourceCountEstimate: number;
    confirmedMentions: number;
    disputedMentions: number;
    unsupportedMentions: number;
    blockedResearchPhraseCount: number;
  };
}

export async function runResearchHarness(
  scenarioPath: string,
  options: {
    maxTurnsOverride?: number;
    keepSession?: boolean;
  } = {}
): Promise<HarnessRunResult> {
  const scenario = await loadScenario(scenarioPath);
  const cwd = scenario.cwd ? path.resolve(scenario.cwd) : process.cwd();
  const config = await loadConfig(cwd);
  const sessionName = `taw-harness-${Date.now()}`;
  const runDir = path.join(
    os.tmpdir(),
    'taw-harness-runs',
    `${Date.now()}-${sanitizeFileName(scenario.name)}`
  );
  await mkdir(runDir, { recursive: true });

  try {
    await startTmuxSession(sessionName, cwd);
    await waitForPaneContains(sessionName, 'Type a message', 30_000);

    const turnLog: string[] = [];

    await sendMessage(sessionName, scenario.initialUserMessage);
    await waitForPaneContains(
      sessionName,
      'Research Politics is active.',
      30_000
    );
    let pane = await waitForPromptReady(sessionName, 30_000);
    turnLog.push(renderTurnLog(0, scenario.initialUserMessage, pane));

    const maxTurns = Math.min(
      options.maxTurnsOverride ?? scenario.maxTurns,
      HARD_MAX_TURNS
    );

    for (let turn = 1; turn < maxTurns; turn += 1) {
      const decision = await decideHumanResponse(scenario, pane, turnLog, {
        apiKey: config.providerConfig.apiKey,
        baseUrl: config.providerConfig.baseUrl,
        model:
          scenario.modelOverride ??
          config.providerConfig.model ??
          'openrouter/auto'
      });

      turnLog.push(
        [
          `# Human Decision ${turn}`,
          '',
          `Action: ${decision.action}`,
          `Rationale: ${decision.rationale}`,
          '',
          decision.message ? `Message:\n${decision.message}` : ''
        ]
          .filter(Boolean)
          .join('\n')
      );

      if (decision.action === 'stop') {
        break;
      }

      if (!decision.message.trim()) {
        turnLog.push(
          '# Harness Stop\n\nStopping because the simulated human returned an empty message.'
        );
        break;
      }

      await sendMessage(sessionName, decision.message);
      pane = await waitForPaneAfterAssistantTurn(sessionName, 120_000);
      turnLog.push(renderTurnLog(turn, decision.message, pane));
    }

    const transcriptPath = path.join(runDir, 'transcript.md');
    await writeFile(transcriptPath, `${turnLog.join('\n\n---\n\n')}\n`, 'utf8');

    const evaluation = evaluateHarnessRun(pane, scenario.verifierRules);
    const evaluationPath = path.join(runDir, 'evaluation.json');
    await writeFile(
      evaluationPath,
      `${JSON.stringify(evaluation, null, 2)}\n`,
      'utf8'
    );

    return {
      sessionName,
      runDir,
      transcriptPath,
      evaluationPath,
      finalPane: pane
    };
  } finally {
    if (!options.keepSession && process.env.TAW_HARNESS_KEEP_SESSION !== '1') {
      await killTmuxSession(sessionName);
    }
  }
}

export async function loadScenario(
  scenarioPath: string
): Promise<ResearchHarnessScenario> {
  const content = await readFile(scenarioPath, 'utf8');
  return JSON.parse(content) as ResearchHarnessScenario;
}

export function evaluateHarnessRun(
  pane: string,
  rules: ResearchHarnessScenario['verifierRules']
): HarnessEvaluation {
  const assistantPane = extractAssistantVisibleContent(pane);
  const researchBriefCount = countOccurrences(
    assistantPane,
    '# Political Research Brief'
  );
  const clarificationQuestionCount = countOccurrences(
    assistantPane,
    'Here are my follow-up questions'
  );
  const sourceCountEstimate = countOccurrences(assistantPane, 'http');
  const confirmedMentions = countOccurrences(
    assistantPane.toLowerCase(),
    'confirmed'
  );
  const disputedMentions = countOccurrences(
    assistantPane.toLowerCase(),
    'disputed'
  );
  const unsupportedMentions = countOccurrences(
    assistantPane.toLowerCase(),
    'unsupported'
  );
  const blockedResearchPhraseCount = countBlockedResearchPhrases(
    assistantPane.toLowerCase()
  );

  const findings: string[] = [];

  for (const required of rules.requiredSignals) {
    if (!assistantPane.toLowerCase().includes(required.toLowerCase())) {
      findings.push(`Missing required signal: ${required}`);
    }
  }

  for (const forbidden of rules.forbiddenSignals) {
    if (assistantPane.toLowerCase().includes(forbidden.toLowerCase())) {
      findings.push(`Hit forbidden signal: ${forbidden}`);
    }
  }

  if (researchBriefCount > 0) {
    findings.push(
      'Polished research brief output appeared before the harness confirmed meaningful verification behavior.'
    );
  }

  if (clarificationQuestionCount > 0) {
    findings.push(
      'Model asked clarifying questions instead of continuing the research pass.'
    );
  }

  if (blockedResearchPhraseCount > 0) {
    findings.push(
      'Model used blocking setup language instead of proceeding with verification.'
    );
  }

  if (
    confirmedMentions === 0 ||
    disputedMentions === 0 ||
    unsupportedMentions === 0
  ) {
    findings.push('Verification labels were incomplete.');
  }

  return {
    verdict: findings.length === 0 ? 'pass' : 'fail',
    findings,
    metrics: {
      researchBriefCount,
      clarificationQuestionCount,
      sourceCountEstimate,
      confirmedMentions,
      disputedMentions,
      unsupportedMentions,
      blockedResearchPhraseCount
    }
  };
}

async function decideHumanResponse(
  scenario: ResearchHarnessScenario,
  pane: string,
  turnLog: string[],
  modelConfig: {
    apiKey?: string;
    baseUrl?: string;
    model: string;
  }
): Promise<HumanTurnDecision> {
  if (!modelConfig.apiKey) {
    throw new Error(
      'Research harness requires an API key for the simulated human agent.'
    );
  }

  const client = new OpenAI({
    apiKey: modelConfig.apiKey,
    baseURL: modelConfig.baseUrl
  });

  const prompt = [
    'You are acting as the human operator in a TAW research-mode test harness.',
    'Your job is to push the assistant toward meaningful research behavior instead of planning-only behavior.',
    scenario.humanGoalPrompt,
    'Decide the next user message.',
    'Return strict JSON with keys: action, message, rationale.',
    'Allowed actions: "send" or "stop".',
    'Use "stop" only if the assistant has clearly done the requested research work or is irrecoverably stuck.',
    '',
    'Recent harness log:',
    turnLog.slice(-4).join('\n\n'),
    '',
    'Current TAW pane:',
    pane
  ].join('\n\n');

  const completion = await client.chat.completions.create({
    model: modelConfig.model,
    response_format: {
      type: 'json_object'
    },
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ]
  });

  const content = extractJsonObject(
    completion.choices[0]?.message?.content ?? '{}'
  );
  const parsed = JSON.parse(content) as Partial<HumanTurnDecision>;

  return {
    action: parsed.action === 'stop' ? 'stop' : 'send',
    message: parsed.message?.trim() ?? '',
    rationale: parsed.rationale?.trim() ?? 'No rationale provided.'
  };
}

function extractJsonObject(content: string): string {
  const trimmed = content.trim();
  const firstBrace = trimmed.indexOf('{');
  const lastBrace = trimmed.lastIndexOf('}');

  if (firstBrace >= 0 && lastBrace > firstBrace) {
    return trimmed.slice(firstBrace, lastBrace + 1);
  }

  if (trimmed.startsWith('```')) {
    const withoutFence = trimmed
      .replace(/^```[a-zA-Z0-9_-]*\s*/, '')
      .replace(/\s*```$/, '');
    return withoutFence.trim();
  }

  return trimmed;
}

async function startTmuxSession(
  sessionName: string,
  cwd: string
): Promise<void> {
  const command = await buildTawLaunchCommand();
  await execFileAsync('tmux', [
    'new-session',
    '-d',
    '-s',
    sessionName,
    `cd '${cwd.replaceAll("'", `'\\''`)}' && ${command}`
  ]);
}

async function killTmuxSession(sessionName: string): Promise<void> {
  try {
    await execFileAsync('tmux', ['kill-session', '-t', sessionName]);
  } catch {
    // The session may already have exited after a harness failure or user action.
  }
}

async function buildTawLaunchCommand(): Promise<string> {
  const builtEntryPath = fileURLToPath(
    new URL('../../../dist/cli/entry.js', import.meta.url)
  );

  try {
    await access(builtEntryPath);
    return `${shellEscape(process.execPath)} ${shellEscape(builtEntryPath)}`;
  } catch {
    const tsxEntryPath = fileURLToPath(
      new URL('../../cli/entry.tsx', import.meta.url)
    );
    return `tsx ${shellEscape(tsxEntryPath)}`;
  }
}

async function sendMessage(
  sessionName: string,
  message: string
): Promise<void> {
  const normalized = normalizeOutgoingMessage(message);
  const bufferName = `taw-harness-${Date.now()}`;
  await execFileAsync('tmux', ['set-buffer', '-b', bufferName, normalized]);
  await execFileAsync('tmux', [
    'paste-buffer',
    '-b',
    bufferName,
    '-t',
    sessionName
  ]);
  await execFileAsync('tmux', ['delete-buffer', '-b', bufferName]);
  await sleep(200);
  await execFileAsync('tmux', ['send-keys', '-t', sessionName, 'C-m']);
}

async function capturePane(sessionName: string): Promise<string> {
  const { stdout } = await execFileAsync('tmux', [
    'capture-pane',
    '-pt',
    sessionName
  ]);

  return stdout;
}

async function waitForPromptReady(
  sessionName: string,
  timeoutMs: number
): Promise<string> {
  return waitForPaneMatch(
    sessionName,
    (pane) => pane.includes('>  Type a message or /help'),
    timeoutMs
  );
}

async function waitForPaneAfterAssistantTurn(
  sessionName: string,
  timeoutMs: number
): Promise<string> {
  return waitForPaneMatch(
    sessionName,
    (pane) => hasCompletedAssistantOutput(pane),
    timeoutMs
  );
}

async function waitForPaneContains(
  sessionName: string,
  value: string,
  timeoutMs: number
): Promise<string> {
  return waitForPaneMatch(
    sessionName,
    (pane) => pane.includes(value),
    timeoutMs
  );
}

async function waitForPaneMatch(
  sessionName: string,
  matcher: (pane: string) => boolean,
  timeoutMs: number
): Promise<string> {
  const timeoutAt = Date.now() + timeoutMs;
  let last = '';

  while (Date.now() < timeoutAt) {
    last = await capturePane(sessionName);
    if (matcher(last)) {
      return last;
    }

    await sleep(1000);
  }

  return last;
}

function renderTurnLog(
  turn: number,
  userMessage: string,
  pane: string
): string {
  return [
    `# Turn ${turn}`,
    '',
    `## User`,
    userMessage,
    '',
    `## TAW Pane`,
    pane
  ].join('\n');
}

function countOccurrences(haystack: string, needle: string): number {
  if (!needle) {
    return 0;
  }

  return haystack.split(needle).length - 1;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    globalThis.setTimeout(resolve, ms);
  });
}

function sanitizeFileName(value: string): string {
  return (
    value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'run'
  );
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}

function normalizeOutgoingMessage(message: string): string {
  return message.replace(/\s+/g, ' ').trim();
}

function hasCompletedAssistantOutput(pane: string): boolean {
  const hasTerminalState =
    pane.includes('Provider Error') ||
    pane.includes('Response Interrupted') ||
    pane.includes('Artifact Saved') ||
    pane.includes('Review the draft');
  const draftVisible = pane.includes('Draft Response');
  const stillStreaming =
    pane.includes('Assistant is thinking') ||
    pane.includes('Streaming response.') ||
    pane.includes('Input locked while a response is active.');

  return (hasTerminalState || draftVisible) && !stillStreaming;
}

function extractAssistantVisibleContent(pane: string): string {
  const markers = [
    'Draft Response',
    'Provider Error',
    'Response Interrupted',
    'Artifact Saved'
  ];

  const startIndex = Math.max(
    ...markers.map((marker) => pane.lastIndexOf(marker))
  );

  if (startIndex < 0) {
    return pane;
  }

  return pane.slice(startIndex);
}

function countBlockedResearchPhrases(content: string): number {
  const phrases = [
    'before i begin',
    'i need a bit more information',
    'what is the url',
    'once i have',
    'could you please provide',
    'this will allow me to accurately assess',
    'please paste the full text',
    'give me the headline and source'
  ];

  return phrases.reduce(
    (count, phrase) => count + countOccurrences(content, phrase),
    0
  );
}
