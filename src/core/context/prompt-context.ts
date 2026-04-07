import { readFile } from 'node:fs/promises';
import type { SessionRecord } from '../../types/session.js';
import type { ProjectConfig } from '../../services/config/schema.js';

export async function buildPromptContext(
  session: SessionRecord,
  projectConfig: ProjectConfig | null
): Promise<string> {
  const sections: string[] = [];

  if (projectConfig) {
    sections.push(
      [
        '## Project Config',
        `- Project Name: ${projectConfig.projectName || 'unspecified'}`,
        `- Preferred Outputs: ${projectConfig.preferredArtifactOutputs.join(', ') || 'artifacts'}`,
        `- Default Attached Dirs: ${projectConfig.defaultAttachedDirs.join(', ') || 'none'}`
      ].join('\n')
    );
  }

  if (session.metadata.attachedDirs.length > 0) {
    sections.push(
      ['## Attached Context', ...session.metadata.attachedDirs.map((item) => `- ${item}`)].join('\n')
    );
  }

  if (session.metadata.artifacts.length > 0) {
    const recentArtifacts = session.metadata.artifacts
      .slice(-3)
      .map((artifact) => `- ${artifact.title}: ${artifact.path}`);
    sections.push(['## Recent Artifacts', ...recentArtifacts].join('\n'));
  }

  const summary = await readOptionalFile(session.summaryPath);

  if (summary) {
    sections.push(['## Session Summary', trimForPrompt(summary, 1200)].join('\n\n'));
  }

  return sections.join('\n\n');
}

async function readOptionalFile(filePath: string): Promise<string | null> {
  try {
    return await readFile(filePath, 'utf8');
  } catch {
    return null;
  }
}

function trimForPrompt(value: string, maxLength: number): string {
  if (value.length <= maxLength) {
    return value;
  }

  return `${value.slice(0, maxLength)}\n\n[truncated]`;
}
