import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { extractForVoice } from './extract.js';
import type { TranscriptEntry } from '../../types/app.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const FX = join(__dirname, '..', '..', '..', 'tests', 'fixtures', 'voice-transcripts');
const loadFx = (name: string): { entry: TranscriptEntry; mode: string; expected: string } =>
  JSON.parse(readFileSync(join(FX, `${name}.json`), 'utf8'));

describe('extractForVoice', () => {
  it('returns empty string for error entries', () => {
    const fx = loadFx('error');
    expect(extractForVoice(fx.entry, fx.mode)).toBe(fx.expected);
  });

  it('returns empty string for user entries', () => {
    const entry: TranscriptEntry = { id: 'u1', kind: 'user', body: 'hello there' };
    expect(extractForVoice(entry, 'General')).toBe('');
  });

  it('returns empty string for system entries', () => {
    const entry: TranscriptEntry = { id: 's1', kind: 'system', body: 'Session started' };
    expect(extractForVoice(entry, 'General')).toBe('');
  });

  it('returns title only for notice entries', () => {
    const fx = loadFx('notice');
    expect(extractForVoice(fx.entry, fx.mode)).toBe(fx.expected);
  });

  it('extracts first sentence in General mode', () => {
    const fx = loadFx('general');
    expect(extractForVoice(fx.entry, fx.mode)).toBe(fx.expected);
  });

  it('caps General mode at 25 words when no sentence end', () => {
    const body = Array.from({ length: 40 }, (_, i) => `word${i + 1}`).join(' ');
    const entry: TranscriptEntry = { id: 'g2', kind: 'assistant', body };
    const result = extractForVoice(entry, 'General');
    expect(result.split(/\s+/).length).toBe(25);
    expect(result.startsWith('word1 word2')).toBe(true);
  });

  it('extracts [VOICE SUMMARY] prefix + trailing question for Brainstorm P1 fixture', () => {
    const fx = loadFx('brainstorm-p1');
    expect(extractForVoice(fx.entry, fx.mode)).toBe(fx.expected);
  });

  it('extracts [VOICE SUMMARY] prefix + trailing question for Brainstorm P2 fixture', () => {
    const fx = loadFx('brainstorm-p2');
    expect(extractForVoice(fx.entry, fx.mode)).toBe(fx.expected);
  });

  it('strips U+2500 mode footer before extracting', () => {
    const fx = loadFx('mode-footer');
    expect(extractForVoice(fx.entry, fx.mode)).toBe(fx.expected);
  });

  it('returns summary only when no trailing question present', () => {
    const entry: TranscriptEntry = {
      id: 'b3',
      kind: 'assistant',
      body: 'Just a summary line with no question.\n\nMore body text without interrogation.',
    };
    expect(extractForVoice(entry, 'Brainstorm')).toBe('Just a summary line with no question.');
  });

  it('returns empty string for empty body without crashing', () => {
    const entry: TranscriptEntry = { id: 'e1', kind: 'assistant', body: '' };
    expect(extractForVoice(entry, 'General')).toBe('');
  });
});
