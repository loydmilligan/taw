import type { TranscriptEntry } from '../../types/app.js';

const FOOTER_DIVIDER_RE = /\u2500{5,}[\s\S]*?\u2500{5,}/g;
const BANNER_DIVIDER_RE = /\u2501{5,}[\s\S]*?\u2501{5,}/g;
const MODE_FOOTER_RE = /[\u2500\u2501]{5,}[\s\S]+?(?:Options:|phase \d+)[^\n]*[\u2500\u2501]{5,}/gi;

export function extractForVoice(entry: TranscriptEntry, mode: string): string {
  if (entry.kind === 'system') return '';
  if (entry.kind === 'error') return '';
  if (entry.kind === 'user') return '';
  if (entry.kind === 'notice') return entry.title?.trim() ?? '';

  const body = stripFooters(entry.body ?? '');
  if (!body) return '';

  if (mode === 'Brainstorm' || mode === 'Brainstorm Phase 2') {
    return extractBrainstorm(body);
  }
  return extractGeneral(body);
}

function stripFooters(text: string): string {
  return text.replace(MODE_FOOTER_RE, '').replace(FOOTER_DIVIDER_RE, '').replace(BANNER_DIVIDER_RE, '').trim();
}

function extractBrainstorm(body: string): string {
  const lines = body.split('\n').map(l => l.trim()).filter(Boolean);
  const summary = lines[0] ?? '';
  const sentences = body.split(/(?<=[.!?])\s+/);
  const question = [...sentences].reverse().find(s => s.trim().endsWith('?'))?.trim() ?? '';
  if (summary && question && summary !== question) return `${summary} ${question}`;
  return summary || question;
}

function extractGeneral(body: string): string {
  const firstSentenceMatch = body.match(/^[^.!?\n]+[.!?]/);
  const firstSentence = firstSentenceMatch?.[0]?.trim() ?? '';
  const words = body.split(/\s+/);
  const first25 = words.slice(0, 25).join(' ');
  if (firstSentence && firstSentence.split(/\s+/).length <= 25) return firstSentence;
  return first25;
}
