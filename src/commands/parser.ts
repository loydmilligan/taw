import type { ParsedCommand } from './types.js';

export function isSlashCommand(input: string): boolean {
  return input.trim().startsWith('/');
}

export function parseCommand(input: string): ParsedCommand {
  const trimmed = input.trim();

  if (!trimmed.startsWith('/')) {
    throw new Error('Not a slash command.');
  }

  const parts = splitArgs(trimmed.slice(1));
  const [name, ...args] = parts;

  if (!name) {
    throw new Error('Command name is required.');
  }

  return {
    name,
    args,
    raw: trimmed
  };
}

function splitArgs(value: string): string[] {
  const matches = value.match(/"([^"]*)"|'([^']*)'|[^\s]+/g);

  if (!matches) {
    return [];
  }

  return matches.map((part) => part.replace(/^['"]|['"]$/g, ''));
}
