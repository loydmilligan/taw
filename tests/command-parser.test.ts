import { describe, expect, it } from 'vitest';
import { isSlashCommand, parseCommand } from '../src/commands/parser.js';

describe('command parser', () => {
  it('detects slash commands', () => {
    expect(isSlashCommand('/help')).toBe(true);
    expect(isSlashCommand('hello')).toBe(false);
  });

  it('parses attach-dir arguments', () => {
    expect(parseCommand('/attach-dir "./docs folder"')).toEqual({
      name: 'attach-dir',
      args: ['./docs folder'],
      raw: '/attach-dir "./docs folder"'
    });
  });

  it('throws a clear error for missing command names', () => {
    expect(() => parseCommand('/')).toThrow('Command name is required.');
  });
});
