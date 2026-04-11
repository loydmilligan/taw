import { execFile, spawn } from 'node:child_process';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { promisify } from 'node:util';
import {
  readResearchSources,
  readResearchSourceViews,
  removeResearchSourceView,
  upsertResearchSourceView
} from '../core/research/store.js';
import type { ResearchSourceView } from '../core/research/types.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

const execFileAsync = promisify(execFile);

interface ManagedSourceTarget {
  command: string;
  openKind: 'snapshot' | 'url';
}

interface TmuxWindowRecord {
  id: string;
  name: string;
}

export const openSourceCommand: CommandDefinition = {
  name: 'open-source',
  description:
    'Open a saved research source in a managed tmux window when available.',
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
                ? `No tmux window available. Open this url manually:\n${source.url}`
                : 'This source has no snapshot file or URL to open.'
          }
        ]
      };
    }

    const target = await buildOpenTarget(source.snapshotPath, source.url);

    if (!target) {
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

    const viewState = await ensureManagedSourceView(
      context.session,
      source.id,
      index,
      source.title,
      target
    );

    return {
      entries: [
        {
          id: createId('open-source'),
          kind: 'notice',
          title: viewState.reused ? 'Source View Reused' : 'Source View Opened',
          body: [
            viewState.reused
              ? `Jumped to existing source view for source ${index}.`
              : `Opened source ${index} in tmux window ${viewState.view.tmuxWindowName}.`,
            target.openKind === 'url'
              ? 'w3m basics: arrows/PageUp/PageDown scroll, / searches, Enter follows a link, B goes back, q quits the source window.'
              : 'Snapshot view: arrows/PageUp/PageDown scroll, / searches, q quits the source window.',
            `To record what you learned: /source-note ${index} <note>`,
            'To see or jump between open source views: /source-views',
            'To return to the TAW discussion quickly: tmux last-window'
          ].join('\n')
        }
      ]
    };
  }
};

export const sourceViewsCommand: CommandDefinition = {
  name: 'source-views',
  description: 'List open source windows or jump to one of them.',
  usage: '/source-views [index]',
  async run(input, context) {
    if (!process.env.TMUX) {
      return {
        entries: [
          {
            id: createId('source-views-no-tmux'),
            kind: 'notice',
            title: 'Tmux Not Detected',
            body: 'Managed source views are only available inside tmux.'
          }
        ]
      };
    }

    const views = await listManagedSourceViews(context.session);
    const requestedIndex = Number(input.args[0] ?? '');

    if (input.args.length === 0) {
      return {
        entries: [
          {
            id: createId('source-views'),
            kind: 'notice',
            title: 'Open Source Views',
            body:
              views.length > 0
                ? [
                    views
                      .map(
                        (view) =>
                          `${view.sourceIndex}. ${view.title}\n   ${view.tmuxWindowName} (${view.tmuxWindowId})`
                      )
                      .join('\n'),
                    'Jump to one with /source-views <index>.',
                    'Return to the TAW discussion with tmux last-window.'
                  ].join('\n')
                : 'No managed source views are open right now.'
          }
        ]
      };
    }

    if (!Number.isInteger(requestedIndex) || requestedIndex < 1) {
      return {
        entries: [
          {
            id: createId('source-views-usage'),
            kind: 'error',
            title: 'Source Views Usage',
            body: 'Usage: /source-views [index]'
          }
        ]
      };
    }

    const view = views.find((item) => item.sourceIndex === requestedIndex);

    if (!view) {
      return {
        entries: [
          {
            id: createId('source-views-missing'),
            kind: 'error',
            title: 'Source View Not Found',
            body: `No open source view exists for source ${requestedIndex}.`
          }
        ]
      };
    }

    await selectTmuxWindow(view.tmuxWindowId);

    return {
      entries: [
        {
          id: createId('source-views-jump'),
          kind: 'notice',
          title: 'Source View Selected',
          body: [
            `Jumped to source ${view.sourceIndex}: ${view.title}`,
            'Return to the TAW discussion with tmux last-window.'
          ].join('\n')
        }
      ]
    };
  }
};

async function ensureManagedSourceView(
  session: Parameters<CommandDefinition['run']>[1]['session'],
  sourceId: string,
  sourceIndex: number,
  title: string,
  target: ManagedSourceTarget
): Promise<{ view: ResearchSourceView; reused: boolean }> {
  const existingViews = await listManagedSourceViews(session);
  const existing = existingViews.find((view) => view.sourceId === sourceId);

  if (existing) {
    await selectTmuxWindow(existing.tmuxWindowId);
    const touched: ResearchSourceView = {
      ...existing,
      lastOpenedAt: new Date().toISOString()
    };
    await upsertResearchSourceView(session, touched);
    return { view: touched, reused: true };
  }

  const windowName = buildManagedWindowName(sourceIndex, title);
  const windowId = await createTmuxWindow(target.command, windowName);
  const now = new Date().toISOString();
  const view: ResearchSourceView = {
    sourceId,
    sourceIndex,
    title,
    tmuxWindowId: windowId,
    tmuxWindowName: windowName,
    openedAt: now,
    lastOpenedAt: now
  };
  await upsertResearchSourceView(session, view);
  return { view, reused: false };
}

async function listManagedSourceViews(
  session: Parameters<CommandDefinition['run']>[1]['session']
): Promise<ResearchSourceView[]> {
  const stored = await readResearchSourceViews(session);
  if (stored.length === 0) {
    return [];
  }

  const openWindows = await listCurrentTmuxWindows();
  const openWindowIds = new Set(openWindows.map((window) => window.id));
  const stillOpen = stored
    .filter((view) => openWindowIds.has(view.tmuxWindowId))
    .map((view) => {
      const openWindow = openWindows.find(
        (window) => window.id === view.tmuxWindowId
      );
      return openWindow
        ? {
            ...view,
            tmuxWindowName: openWindow.name
          }
        : view;
    })
    .sort((left, right) => left.sourceIndex - right.sourceIndex);

  if (stillOpen.length !== stored.length) {
    await writeCleanSourceViews(session, stored, stillOpen);
  }

  return stillOpen;
}

async function writeCleanSourceViews(
  session: Parameters<CommandDefinition['run']>[1]['session'],
  previous: ResearchSourceView[],
  next: ResearchSourceView[]
): Promise<void> {
  const removedIds = previous
    .filter(
      (item) => !next.some((candidate) => candidate.sourceId === item.sourceId)
    )
    .map((item) => item.sourceId);

  if (removedIds.length === 0) {
    for (const view of next) {
      await upsertResearchSourceView(session, view);
    }
    return;
  }

  for (const sourceId of removedIds) {
    await removeResearchSourceView(session, sourceId);
  }

  for (const view of next) {
    await upsertResearchSourceView(session, view);
  }
}

async function buildOpenTarget(
  snapshotPath: string | null,
  url: string | null
): Promise<ManagedSourceTarget | null> {
  if (snapshotPath) {
    try {
      await access(snapshotPath, constants.R_OK);
      return {
        command: buildOpenSnapshotCommand(snapshotPath),
        openKind: 'snapshot'
      };
    } catch {
      // fall through to URL handling
    }
  }

  if (url) {
    return {
      command: buildOpenUrlCommand(url),
      openKind: 'url'
    };
  }

  return null;
}

function buildOpenSnapshotCommand(snapshotPath: string): string {
  return [
    `printf '%s\\n\\n' ${shellEscape('Source snapshot. less basics: arrows/PageUp/PageDown scroll, / searches, q closes this window. Use tmux last-window to return to TAW.')};`,
    `exec less ${shellEscape(snapshotPath)}`
  ].join(' ');
}

function buildOpenUrlCommand(url: string): string {
  const escapedUrl = shellEscape(url);

  return [
    'if command -v w3m >/dev/null 2>&1; then',
    `printf '%s\\n\\n' ${shellEscape('Source browser. w3m basics: arrows/PageUp/PageDown scroll, / searches, Enter follows links, B goes back, q closes this window. Use tmux last-window to return to TAW.')}; sleep 2; exec w3m ${escapedUrl};`,
    'elif command -v lynx >/dev/null 2>&1; then',
    `printf '%s\\n\\n' ${shellEscape('Source browser. lynx basics: arrows scroll, / searches, Enter follows links, left goes back, q closes this window. Use tmux last-window to return to TAW.')}; sleep 2; exec lynx ${escapedUrl};`,
    'elif command -v elinks >/dev/null 2>&1; then',
    `printf '%s\\n\\n' ${shellEscape('Source browser. elinks basics: arrows scroll, / searches, Enter follows links, q opens the quit prompt. Use tmux last-window to return to TAW.')}; sleep 2; exec elinks ${escapedUrl};`,
    'else',
    `printf '%s\\n\\n%s\\n\\n%s\\n' 'No terminal browser found for this source.' ${shellEscape(url)} 'Install w3m, lynx, or elinks, or open the URL in your browser. Press Enter to close this window.';`,
    'read -r _;',
    'fi'
  ].join(' ');
}

async function createTmuxWindow(
  command: string,
  windowName: string
): Promise<string> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'tmux',
      ['new-window', '-P', '-F', '#{window_id}', '-n', windowName, command],
      { stdio: ['ignore', 'pipe', 'ignore'] }
    );

    let output = '';
    child.stdout.on('data', (chunk) => {
      output += String(chunk);
    });
    child.on('exit', (code) => {
      if (code === 0) {
        resolve(output.trim());
        return;
      }

      reject(
        new Error(`tmux new-window failed with exit code ${code ?? 'unknown'}.`)
      );
    });
    child.on('error', reject);
  });
}

async function listCurrentTmuxWindows(): Promise<TmuxWindowRecord[]> {
  const sessionName = await getCurrentTmuxSessionName();
  const { stdout } = await execFileAsync('tmux', [
    'list-windows',
    '-t',
    sessionName,
    '-F',
    '#{window_id}\t#{window_name}'
  ]);

  return stdout
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      const [id, name] = line.split('\t');
      return {
        id: id ?? '',
        name: name ?? ''
      };
    })
    .filter((window) => Boolean(window.id));
}

async function getCurrentTmuxSessionName(): Promise<string> {
  const { stdout } = await execFileAsync('tmux', [
    'display-message',
    '-p',
    '#S'
  ]);
  return stdout.trim();
}

async function selectTmuxWindow(target: string): Promise<void> {
  await execFileAsync('tmux', ['select-window', '-t', target]);
}

function buildManagedWindowName(sourceIndex: number, title: string): string {
  const normalized = stripControlCharacters(title).replace(/\s+/g, ' ').trim();
  const label = normalized ? normalized.slice(0, 60) : 'source';
  return normalizeTmuxWindowName(`src ${sourceIndex}: ${label}`);
}

function normalizeTmuxWindowName(value: string): string {
  const normalized = stripControlCharacters(value).replace(/\s+/g, ' ').trim();
  return normalized ? normalized.slice(0, 80) : 'taw source';
}

function stripControlCharacters(value: string): string {
  return Array.from(value)
    .map((char) => {
      const code = char.charCodeAt(0);
      return code < 32 || code === 127 ? ' ' : char;
    })
    .join('');
}

function shellEscape(value: string): string {
  return `'${value.replaceAll("'", `'\\''`)}'`;
}
