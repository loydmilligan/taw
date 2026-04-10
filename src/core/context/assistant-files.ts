import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandDefinition } from '../../commands/types.js';
import type { SessionRecord } from '../../types/session.js';
import {
  getGlobalAssistantDir,
  getProjectAssistantDir
} from '../../services/filesystem/paths.js';

const DEFAULT_AGENTS = `# AGENTS

TAW is a terminal-native AI workspace for planning, research, workflow design, workflow review, and markdown-first artifact generation.

- Be clear, practical, and concise.
- Do not behave like an autonomous coding agent.
- Prefer useful drafts over premature final answers.
- Ask for clarification when it materially improves the result.
`;

const DEFAULT_SOUL = `# SOUL

This file defines assistant voice only. It is not the assistant's name.

The assistant should refer to itself as TAW or TAWd if a name is needed.

You are sharp, calm, structured, and practical.

- Value clarity over flourish.
- Prefer directness over chatter.
- Help the user think better, not just produce text.
`;

const DEFAULT_USER = `# USER

## Background

Add stable facts about the user here.

## Preferences

Add durable preferences and working style here.
`;

const DEFAULT_MEMORY = `# MEMORY

## Durable Context

Add cross-session facts, recurring themes, and important prior decisions here.
`;

export async function ensureAssistantReferenceFiles(
  cwd: string,
  session: SessionRecord,
  commands: CommandDefinition[]
): Promise<{ commandReference: string }> {
  const markdown = renderCommandsMarkdown(commands);
  await ensureAssistantFilesAtDir(getGlobalAssistantDir(), markdown);

  if (session.storageMode === 'project') {
    const projectAssistantDir = getProjectAssistantDir(cwd);
    await ensureAssistantFilesAtDir(projectAssistantDir, markdown);
  }

  return { commandReference: markdown };
}

export async function ensureProjectAssistantReferenceFiles(
  cwd: string,
  commands: CommandDefinition[]
): Promise<void> {
  await ensureAssistantFilesAtDir(
    getProjectAssistantDir(cwd),
    renderCommandsMarkdown(commands)
  );
}

export async function loadCommandReference(
  cwd: string,
  session: SessionRecord
): Promise<string | null> {
  const projectPath = path.join(getProjectAssistantDir(cwd), 'COMMANDS.md');
  const globalPath = path.join(getGlobalAssistantDir(), 'COMMANDS.md');

  try {
    if (session.storageMode === 'project') {
      return await readFile(projectPath, 'utf8');
    }

    return await readFile(globalPath, 'utf8');
  } catch {
    return null;
  }
}

export function renderCommandsMarkdown(commands: CommandDefinition[]): string {
  const lines = commands.map(
    (command) => `- \`${command.usage}\` — ${command.description}`
  );

  return ['# Available Slash Commands', '', ...lines, ''].join('\n');
}

export interface AssistantPromptMaterials {
  globalAgents: string | null;
  projectAgents: string | null;
  globalSoul: string | null;
  projectSoul: string | null;
  globalUserSummary: string | null;
  projectUserSummary: string | null;
  globalMemorySummary: string | null;
  projectMemorySummary: string | null;
  retrievedUserContext: string[];
  retrievedMemoryContext: string[];
}

export async function loadAssistantPromptMaterials(
  cwd: string,
  session: SessionRecord,
  latestUserInput: string
): Promise<AssistantPromptMaterials> {
  const globalDir = getGlobalAssistantDir();
  const projectDir =
    session.storageMode === 'project' ? getProjectAssistantDir(cwd) : null;

  const globalUser = await readOptionalFile(path.join(globalDir, 'USER.md'));
  const projectUser = projectDir
    ? await readOptionalFile(path.join(projectDir, 'USER.md'))
    : null;
  const globalMemory = await readOptionalFile(
    path.join(globalDir, 'MEMORY.md')
  );
  const projectMemory = projectDir
    ? await readOptionalFile(path.join(projectDir, 'MEMORY.md'))
    : null;

  return {
    globalAgents: await readOptionalFile(path.join(globalDir, 'AGENTS.md')),
    projectAgents: projectDir
      ? await readOptionalFile(path.join(projectDir, 'AGENTS.md'))
      : null,
    globalSoul: await readOptionalFile(path.join(globalDir, 'SOUL.md')),
    projectSoul: projectDir
      ? await readOptionalFile(path.join(projectDir, 'SOUL.md'))
      : null,
    globalUserSummary: await readOptionalFile(
      path.join(globalDir, 'USER.summary.md')
    ),
    projectUserSummary: projectDir
      ? await readOptionalFile(path.join(projectDir, 'USER.summary.md'))
      : null,
    globalMemorySummary: await readOptionalFile(
      path.join(globalDir, 'MEMORY.summary.md')
    ),
    projectMemorySummary: projectDir
      ? await readOptionalFile(path.join(projectDir, 'MEMORY.summary.md'))
      : null,
    retrievedUserContext: [
      ...retrieveRelevantSections(globalUser, latestUserInput),
      ...retrieveRelevantSections(projectUser, latestUserInput)
    ],
    retrievedMemoryContext: [
      ...retrieveRelevantSections(globalMemory, latestUserInput),
      ...retrieveRelevantSections(projectMemory, latestUserInput)
    ]
  };
}

async function ensureAssistantFilesAtDir(
  dir: string,
  commandsMarkdown: string
): Promise<void> {
  await mkdir(dir, { recursive: true });

  await writeIfMissing(path.join(dir, 'AGENTS.md'), DEFAULT_AGENTS);
  await writeIfMissing(path.join(dir, 'SOUL.md'), DEFAULT_SOUL);
  await writeIfMissing(path.join(dir, 'USER.md'), DEFAULT_USER);
  await writeIfMissing(path.join(dir, 'MEMORY.md'), DEFAULT_MEMORY);
  await writeFile(path.join(dir, 'COMMANDS.md'), commandsMarkdown, 'utf8');

  const userRaw =
    (await readOptionalFile(path.join(dir, 'USER.md'))) ?? DEFAULT_USER;
  const memoryRaw =
    (await readOptionalFile(path.join(dir, 'MEMORY.md'))) ?? DEFAULT_MEMORY;

  await writeFile(
    path.join(dir, 'USER.summary.md'),
    buildSummaryMarkdown('USER Summary', userRaw),
    'utf8'
  );
  await writeFile(
    path.join(dir, 'MEMORY.summary.md'),
    buildSummaryMarkdown('MEMORY Summary', memoryRaw),
    'utf8'
  );
}

async function writeIfMissing(
  filePath: string,
  content: string
): Promise<void> {
  try {
    await readFile(filePath, 'utf8');
  } catch {
    await writeFile(filePath, content, 'utf8');
  }
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function buildSummaryMarkdown(title: string, content: string): string {
  const sections = splitMarkdownSections(content)
    .map((section) => summarizeSection(section))
    .filter(Boolean)
    .slice(0, 6);

  return [
    `# ${title}`,
    '',
    ...(sections.length > 0 ? sections : ['- No summary content yet.']),
    ''
  ].join('\n');
}

function retrieveRelevantSections(
  content: string | null,
  query: string
): string[] {
  if (!content) {
    return [];
  }

  const sections = splitMarkdownSections(content);
  const queryTerms = new Set(
    query
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((term) => term.length >= 4)
  );

  return sections
    .map((section) => ({
      section,
      score: scoreSection(section, queryTerms)
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, 2)
    .map((entry) => entry.section);
}

function splitMarkdownSections(content: string): string[] {
  const lines = content.split('\n');
  const sections: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (/^##\s+/.test(line) && current.length > 0) {
      sections.push(current.join('\n').trim());
      current = [line];
      continue;
    }

    current.push(line);
  }

  if (current.length > 0) {
    sections.push(current.join('\n').trim());
  }

  return sections;
}

function scoreSection(section: string, queryTerms: Set<string>): number {
  if (queryTerms.size === 0) {
    return 0;
  }

  const lower = section.toLowerCase();
  let score = 0;

  for (const term of queryTerms) {
    if (lower.includes(term)) {
      score += 1;
    }
  }

  return score;
}

function summarizeSection(section: string): string | null {
  const lines = section
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  const heading =
    lines.find((line) => /^##\s+/.test(line))?.replace(/^##\s+/, '') ?? null;
  const bullets = lines
    .filter((line) => !line.startsWith('#'))
    .slice(0, 3)
    .map((line) => `- ${line.replace(/^[-*]\s+/, '')}`);

  if (!heading && bullets.length === 0) {
    return null;
  }

  return [heading ? `## ${heading}` : null, ...bullets]
    .filter(Boolean)
    .join('\n');
}
