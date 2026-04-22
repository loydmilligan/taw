import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';
import { getGlobalWikiResearchRoot } from '../services/filesystem/paths.js';

const WIKI_DIR = getGlobalWikiResearchRoot();

interface Flashcard {
  question: string;
  answer: string;
  sourceFile: string;
}

async function collectMdFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return files;
  }
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await collectMdFiles(full)));
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      files.push(full);
    }
  }
  return files;
}

function parseFlashcards(content: string, sourceFile: string): Flashcard[] {
  const cards: Flashcard[] = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (line.startsWith('Q:')) {
      const question = line.slice(2).trim();
      // Look for A: within the next 3 lines
      for (let j = i + 1; j < Math.min(i + 4, lines.length); j++) {
        const next = lines[j].trim();
        if (next.startsWith('A:')) {
          const answer = next.slice(2).trim();
          if (question && answer) {
            cards.push({ question, answer, sourceFile });
          }
          i = j;
          break;
        }
      }
    }
  }
  return cards;
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export const flashcardsCommand: CommandDefinition = {
  name: 'flashcards',
  description: 'Browse flashcards extracted from your research notes.',
  usage: '/flashcards [topic-filter]',
  async run(input) {
    const filter = input.args[0]?.toLowerCase() ?? '';

    const allFiles = await collectMdFiles(WIKI_DIR);
    const filtered = filter
      ? allFiles.filter((f) => path.basename(f).toLowerCase().includes(filter))
      : allFiles;

    const allCards: Flashcard[] = [];
    for (const file of filtered) {
      try {
        const content = await readFile(file, 'utf8');
        allCards.push(...parseFlashcards(content, file));
      } catch {
        // skip unreadable files
      }
    }

    if (allCards.length === 0) {
      return {
        entries: [
          {
            id: createId('flashcards-empty'),
            kind: 'notice' as const,
            title: 'No Flashcards Found',
            body: filter
              ? `No flashcards found matching "${filter}" in ${WIKI_DIR}.`
              : `No flashcards found in ${WIKI_DIR}. Run lp-research with --flashcards to generate some.`
          }
        ]
      };
    }

    const cards = shuffle(allCards);
    const fileCount = new Set(cards.map((c) => c.sourceFile)).size;

    const body =
      `## Flashcards (${cards.length} cards from ${fileCount} file${fileCount !== 1 ? 's' : ''})\n\n` +
      cards.map((c) => `**Q:** ${c.question}\n\n**A:** ${c.answer}`).join('\n\n---\n\n') +
      '\n';

    return {
      entries: [
        {
          id: createId('flashcards'),
          kind: 'assistant' as const,
          title: `Flashcards${filter ? ` — ${filter}` : ''}`,
          body
        }
      ]
    };
  }
};
