import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { sanitizeSlug, updateSessionMetadata } from '../sessions/session-manager.js';
import type { SessionArtifact, SessionRecord } from '../../types/session.js';
import { createId } from '../../utils/ids.js';

interface CreateArtifactInput {
  type: string;
  title: string;
  content: string;
}

export async function createArtifact(
  session: SessionRecord,
  input: CreateArtifactInput
): Promise<SessionArtifact> {
  const timestamp = new Date().toISOString().slice(0, 19).replace('T', '-').replaceAll(':', '-');
  const fileName = `${timestamp}-${sanitizeSlug(input.title)}.md`;
  const filePath = path.join(session.artifactsDir, fileName);

  await writeFile(filePath, `${input.content.trim()}\n`, 'utf8');

  const artifact: SessionArtifact = {
    id: createId('artifact'),
    type: input.type,
    title: input.title,
    path: filePath,
    createdAt: new Date().toISOString()
  };

  session.metadata.artifacts.push(artifact);
  await updateSessionMetadata(session);
  return artifact;
}

export async function createModeArtifact(
  session: SessionRecord,
  mode: string,
  content: string
): Promise<SessionArtifact | null> {
  if (mode === 'Brainstorm') {
    return createArtifact(session, {
      type: 'project-brief',
      title: 'project-brief',
      content
    });
  }

  if (mode === 'Workflow Review') {
    return createArtifact(session, {
      type: 'workflow-review',
      title: 'workflow-review',
      content
    });
  }

  if (mode === 'Workflow Generate') {
    return createArtifact(session, {
      type: 'workflow-generate',
      title: 'workflow-generate',
      content
    });
  }

  return null;
}
