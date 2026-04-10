import { spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { readResearchSources } from '../core/research/store.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

export const openSourceCommand: CommandDefinition = {
  name: 'open-source',
  description:
    'Open a saved research source in a tmux side pane when available.',
  usage: '/open-source <index>',
  async run(input, context) {
    const index = Number(input.args[0] ?? '');
    const sources = await readResearchSources(context.session);

    if (!Number.isInteger(index) || index < 1 || index > sources.length) {
      return {
        entries: [
          {
            id: createId('open-source-usage'),
            kind: 'error',
            title: 'Open Source Usage',
            body: 'Usage: /open-source <index>'
          }
        ]
      };
    }

    const source = sources[index - 1];

    if (!source) {
      return {
        entries: [
          {
            id: createId('open-source-missing'),
            kind: 'error',
            title: 'Source Not Found',
            body: `No saved source exists at index ${index}.`
          }
        ]
      };
    }

    if (!process.env.TMUX) {
      return {
        entries: [
          {
            id: createId('open-source-no-tmux'),
            kind: 'notice',
            title: 'Tmux Not Detected',
            body: source.snapshotPath
              ? `Open this snapshot manually:\n${source.snapshotPath}`
              : source.url
                ? `No tmux pane available. Open this url manually:\n${source.url}`
                : 'This source has no snapshot file or URL to open.'
          }
        ]
      };
    }

    const command = await buildOpenCommand(source.snapshotPath, source.url);

    if (!command) {
      return {
        entries: [
          {
            id: createId('open-source-no-target'),
            kind: 'error',
            title: 'Source Not Openable',
            body: 'This source does not have a usable snapshot file or URL.'
          }
        ]
      };
    }

    await runTmuxSplit(command);

    return {
      entries: [
        {
          id: createId('open-source'),
          kind: 'notice',
          title: 'Source Opened',
          body: [
            `Opened source ${index} in a tmux side pane.`,
            'w3m basics: arrows/PageUp/PageDown scroll, / searches, Enter follows a link, B goes back, q quits the source pane.',
            `To capture what you learned: /source-note ${index} <note>`
          ].join('\n')
        }
      ]
    };
  }
};

async function buildOpenCommand(
  snapshotPath: string | null,
  url: string | null
): Promise<string | null> {
  if (snapshotPath) {
    try {
      await access(snapshotPath, constants.R_OK);
      return buildOpenSnapshotCommand(snapshotPath);
    } catch {
      // fall through to URL handling
    }
  }

  if (url) {
    return buildOpenUrlCommand(url);
  }

  return null;
}

function buildOpenSnapshotCommand(snapshotPath: string): string {
  return [
    `printf '%s\\n\\n' ${shellEscape('Source snapshot. less basics: arrows/PageUp/PageDown scroll, / searches, q closes this pane.')};`,
    `exec less ${shellEscape(snapshotPath)}`
  ].join(' ');
}

function buildOpenUrlCommand(url: string): string {
  const escapedUrl = shellEscape(url);

  return [
    'if command -v w3m >/dev/null 2>&1; then',
    `printf '%s\\n\\n' ${shellEscape('Source browser. w3m basics: arrows/PageUp/PageDown scroll, / searches, Enter follows links, B goes back, q closes this pane.')}; sleep 2; exec w3m ${escapedUrl};`,
    'elif command -v lynx >/dev/null 2>&1; then',
    `printf '%s\\n\\n' ${shellEscape('Source browser. lynx basics: arrows scroll, / searches, Enter follows links, left goes back, q closes this pane.')}; sleep 2; exec lynx ${escapedUrl};`,
    'elif command -v elinks >/dev/null 2>&1; then',
    `printf '%s\\n\\n' ${shellEscape('Source browser. elinks basics: arrows scroll, / searches, Enter follows links, q opens the quit prompt.')}; sleep 2; exec elinks ${escapedUrl};`,
    'else',
    `printf '%s\\n\\n%s\\n\\n%s\\n' 'No terminal browser found for this source.' ${shellEscape(url)} 'Install w3m, lynx, or elinks, or open the URL in your browser. Press Enter to close this pane.';`,
    'read -r _;',
    'fi'
  ].join(' ');
}

function runTmuxSplit(command: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn('tmux', ['split-window', '-h', command], {
      stdio: 'ignore'
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }

      reject(
        new Error(
          `tmux split-window failed with exit code ${code ?? 'unknown'}.`
        )
      );
    });
    child.on('error', reject);
  });
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
