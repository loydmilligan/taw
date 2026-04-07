import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import type { CommandDefinition } from '../../commands/types.js';
import type { SessionRecord } from '../../types/session.js';
import { getGlobalAssistantDir, getProjectAssistantDir } from '../../services/filesystem/paths.js';

export async function ensureAssistantReferenceFiles(
  cwd: string,
  session: SessionRecord,
  commands: CommandDefinition[]
): Promise<{ commandReference: string }> {
  const markdown = renderCommandsMarkdown(commands);

  await mkdir(getGlobalAssistantDir(), { recursive: true });
  await writeFile(path.join(getGlobalAssistantDir(), 'COMMANDS.md'), markdown, 'utf8');

  if (session.storageMode === 'project') {
    const projectAssistantDir = getProjectAssistantDir(cwd);
    await mkdir(projectAssistantDir, { recursive: true });
    await writeFile(path.join(projectAssistantDir, 'COMMANDS.md'), markdown, 'utf8');
  }

  return { commandReference: markdown };
}

export async function ensureProjectAssistantReferenceFiles(
  cwd: string,
  commands: CommandDefinition[]
): Promise<void> {
  const projectAssistantDir = getProjectAssistantDir(cwd);
  await mkdir(projectAssistantDir, { recursive: true });
  await writeFile(
    path.join(projectAssistantDir, 'COMMANDS.md'),
    renderCommandsMarkdown(commands),
    'utf8'
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
  const lines = commands.map((command) => `- \`${command.usage}\` — ${command.description}`);

  return ['# Available Slash Commands', '', ...lines, ''].join('\n');
}
