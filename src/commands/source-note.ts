import {
  readResearchSources,
  updateResearchSource
} from '../core/research/store.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const sourceNoteCommand: CommandDefinition = {
  name: 'source-note',
  description: 'Attach a note to a saved research source.',
  usage: '/source-note <index> <note>',
  async run(input, context) {
    const index = Number(input.args[0] ?? '');
    const note = input.args.slice(1).join(' ').trim();
    const sources = await readResearchSources(context.session);

    if (
      !Number.isInteger(index) ||
      index < 1 ||
      index > sources.length ||
      !note
    ) {
      return {
        entries: [
          {
            id: createId('source-note-usage'),
            kind: 'error',
            title: 'Source Note Usage',
            body: 'Usage: /source-note <index> <note>'
          }
        ]
      };
    }

    const source = sources[index - 1];
    const existingNote = source.note?.trim();
    const nextNote = existingNote ? `${existingNote}\n${note}` : note;
    const updated = await updateResearchSource(context.session, index, {
      note: nextNote,
      status: 'reviewed'
    });

    return {
      entries: [
        {
          id: createId('source-note'),
          kind: 'notice',
          title: 'Source Note Saved',
          body: updated
            ? `Source ${index}: ${updated.title}\n${updated.note ?? ''}`
            : `No saved source exists at index ${index}.`
        }
      ]
    };
  }
};
