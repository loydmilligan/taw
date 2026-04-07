import { appendFile } from 'node:fs/promises';
import type { SessionRecord } from '../../types/session.js';

export async function appendConversationTurn(
  session: SessionRecord,
  role: 'user' | 'assistant',
  content: string
): Promise<void> {
  const label = role === 'user' ? 'User' : 'Assistant';
  const block = [`### ${label}`, '', content.trim(), ''].join('\n');
  await appendFile(session.notesPath, `${block}\n`, 'utf8');
}
