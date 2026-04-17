import { describe, expect, it } from 'vitest';
import { voiceCommand } from './voice.js';

function ctx(voiceMode = false): any {
  return { appState: { voiceMode, voiceState: 'idle' } };
}
function parsed(args: string[] = []): any {
  return { name: 'voice', args, raw: `/voice ${args.join(' ')}`.trim() };
}

describe('voiceCommand', () => {
  it('/voice on enters voice mode and returns voiceMode: true', async () => {
    const r = await voiceCommand.run(parsed(['on']), ctx(false));
    expect(r.voiceMode).toBe(true);
    expect(r.entries[0].kind).toBe('notice');
    expect(r.entries[0].title).toBeTruthy();
  });
  it('/voice off leaves voice mode and returns voiceMode: false', async () => {
    const r = await voiceCommand.run(parsed(['off']), ctx(true));
    expect(r.voiceMode).toBe(false);
    expect(r.entries[0].kind).toBe('notice');
    expect(r.entries[0].title).toBeTruthy();
  });
  it('/voice (no arg) toggles voice mode — off to on', async () => {
    const r = await voiceCommand.run(parsed([]), ctx(false));
    expect(r.voiceMode).toBe(true);
  });
  it('/voice (no arg) toggles voice mode — on to off', async () => {
    const r = await voiceCommand.run(parsed([]), ctx(true));
    expect(r.voiceMode).toBe(false);
  });
  it('/voice status reports current mode without changing it', async () => {
    const r = await voiceCommand.run(parsed(['status']), ctx(true));
    expect(r.voiceMode).toBeUndefined();
    expect(r.entries[0].title!.toLowerCase()).toMatch(/voice mode/);
  });
  it('returns a notice entry with title (shape is TranscriptEntry, no createdAt, no any-cast)', async () => {
    const r = await voiceCommand.run(parsed(['on']), ctx(false));
    expect(r.entries[0].kind).toBe('notice');
    expect(r.entries[0].title).toBeTruthy();
    expect(typeof r.entries[0].body).toBe('string');
    // TranscriptEntry has no createdAt — runtime entry must not carry one
    expect((r.entries[0] as any).createdAt).toBeUndefined();
  });
});
