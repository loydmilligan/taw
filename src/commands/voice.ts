import { createId } from '../utils/ids.js';
import type { TranscriptEntry } from '../types/app.js';
import type { CommandContext, CommandDefinition, CommandResult } from './types.js';

function notice(title: string, body = ''): CommandResult {
  const entry: TranscriptEntry = {
    id: createId('voice'),
    kind: 'notice',
    title,
    body,
  };
  return { entries: [entry] };
}

export const voiceCommand: CommandDefinition = {
  name: 'voice',
  description: 'Toggle voice mode (STT input + TTS output).',
  usage: '/voice [on|off|status]',
  async run(input, context) {
    const action = (input.args[0] ?? '').toLowerCase();
    const current = isVoiceModeEnabled(context);

    if (action === 'status') {
      return notice(`Voice Mode: ${current ? 'ON' : 'OFF'}`, '');
    }
    if (action === 'on') {
      return { voiceMode: true, ...notice('Voice Mode On', 'Push-to-talk: Ctrl+V. Any key cuts TTS.') };
    }
    if (action === 'off') {
      return { voiceMode: false, ...notice('Voice Mode Off') };
    }
    // toggle
    const next = !current;
    return { voiceMode: next, ...notice(next ? 'Voice Mode On' : 'Voice Mode Off', next ? 'Push-to-talk: Ctrl+V. Any key cuts TTS.' : '') };
  },
};

function isVoiceModeEnabled(context: CommandContext): boolean {
  return 'appState' in (context as object) &&
    typeof (context as { appState?: { voiceMode?: boolean } }).appState?.voiceMode === 'boolean'
    ? Boolean((context as { appState?: { voiceMode?: boolean } }).appState?.voiceMode)
    : false;
}
