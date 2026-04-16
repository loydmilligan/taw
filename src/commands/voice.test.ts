import { describe, it, expect } from 'vitest';
// RED: ./voice.js does not yet exist — Wave 1 will implement it.
import { voiceCommand } from './voice.js';

describe('voiceCommand', () => {
  it('/voice on enters voice mode and returns voiceMode: true', () => {
    expect(voiceCommand).toBeDefined();
    expect(true).toBe(false);
  });

  it('/voice off leaves voice mode and returns voiceMode: false', () => {
    expect(voiceCommand).toBeDefined();
    expect(true).toBe(false);
  });

  it('/voice (no arg) toggles voice mode', () => {
    expect(voiceCommand).toBeDefined();
    expect(true).toBe(false);
  });

  it('/voice status reports current mode without changing it', () => {
    expect(voiceCommand).toBeDefined();
    expect(true).toBe(false);
  });

  it('returns a notice entry with title', () => {
    expect(voiceCommand).toBeDefined();
    expect(true).toBe(false);
  });
});
