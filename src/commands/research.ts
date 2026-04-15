import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { updateSessionMetadata } from '../core/sessions/session-manager.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';
import type { SessionRecord } from '../types/session.js';

interface MapOpenItem {
  id: string;
  text: string;
  tag: string;
  status: string;
}

function parseMapFile(content: string): {
  topic: string;
  sessionType: string;
  openItems: MapOpenItem[];
} {
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---/);
  if (!fmMatch) return { topic: '', sessionType: '', openItems: [] };

  const fm = fmMatch[1];

  const topic = fm.match(/^topic:\s*"([^"]*)"/m)?.[1] ?? '';
  const sessionType = fm.match(/^session_type:\s*(\S+)/m)?.[1] ?? '';

  const openItems: MapOpenItem[] = [];
  const itemRegex =
    /-\s+id:\s*(\S+)\s*\n\s*text:\s*"([^"]*)"\s*\n\s*tag:\s*(\S+)\s*\n\s*status:\s*(\S+)/g;
  let match;
  while ((match = itemRegex.exec(fm)) !== null) {
    openItems.push({
      id: match[1],
      text: match[2],
      tag: match[3],
      status: match[4]
    });
  }

  return { topic, sessionType, openItems };
}

async function loadBrainstormContext(
  session: SessionRecord
): Promise<{ topic: string; sessionType: string; researchItems: string[] } | null> {
  const mapArtifact = [...session.metadata.artifacts]
    .reverse()
    .find((a) => a.type === 'exploration-map');

  if (!mapArtifact) return null;

  const artifactDir = path.dirname(mapArtifact.path);
  const artifactBasename = path.basename(mapArtifact.path, '.md');
  const mapFilePath = path.join(artifactDir, `${artifactBasename}-data.md`);

  try {
    const content = await readFile(mapFilePath, 'utf8');
    const { topic, sessionType, openItems } = parseMapFile(content);
    const researchItems = openItems
      .filter((item) => item.tag === 'RESEARCH' && item.status !== 'resolved')
      .map((item) => item.text);
    if (researchItems.length === 0) return null;
    return { topic, sessionType, researchItems };
  } catch {
    return null;
  }
}

function buildResearchContextPrompt(
  topic: string,
  sessionType: string,
  researchItems: string[]
): string {
  const numberedItems = researchItems
    .map((item, i) => `${i + 1}. ${item}`)
    .join('\n');

  return [
    `Context from brainstorm: ${topic}`,
    sessionType ? `Session type: ${sessionType}` : '',
    '',
    'The following open items were tagged [RESEARCH] in the brainstorm map:',
    numberedItems,
    '',
    'Convert these into specific research questions. Prioritize by dependency — which question needs to be answered before others can proceed? Start with a brief research plan, then begin on the first question.'
  ]
    .filter((line) => line !== null)
    .join('\n');
}

const researchModeMap = {
  politics: 'Research Politics',
  tech: 'Research Tech',
  repo: 'Research Repo',
  video: 'Research Video'
} as const;

export const researchCommand: CommandDefinition = {
  name: 'research',
  description:
    'Enter typed research mode for politics, tech, repos, or videos.',
  usage: '/research <politics|tech|repo|video> [question]',
  async run(input, context) {
    const type = input.args[0] as keyof typeof researchModeMap | undefined;

    if (!type || !(type in researchModeMap)) {
      return {
        entries: [
          {
            id: createId('research-usage'),
            kind: 'error',
            title: 'Research Mode Usage',
            body: 'Usage: /research <politics|tech|repo|video> [question]'
          }
        ]
      };
    }

    const mode = researchModeMap[type];
    context.session.metadata.modeHistory.push(`research-${type}`);
    await updateSessionMetadata(context.session);

    const question = input.args.slice(1).join(' ').trim();

    // Job 10: Inject brainstorm context if a map file with RESEARCH items exists
    const brainstormContext = await loadBrainstormContext(context.session);
    const queuedInputs: string[] = [];
    if (brainstormContext && !question) {
      // Only inject automatically when no explicit question was provided
      queuedInputs.push(
        buildResearchContextPrompt(
          brainstormContext.topic,
          brainstormContext.sessionType,
          brainstormContext.researchItems
        )
      );
    }

    const noticeBody = question
      ? `${mode} is active. Initial research focus: ${question}\nUse /finalize when you want to save the research artifact.`
      : brainstormContext
        ? `${mode} is active. Loading brainstorm context — ${brainstormContext.researchItems.length} [RESEARCH] item${brainstormContext.researchItems.length === 1 ? '' : 's'} from "${brainstormContext.topic}".\nUse /finalize when you want to save the research artifact.`
        : `${mode} is active. Add sources or ask a question, then use /finalize when you want to save the research artifact.`;

    return {
      session: context.session,
      mode,
      phase: 'idle',
      entries: [
        {
          id: createId('research'),
          kind: 'notice',
          title: mode,
          body: noticeBody
        }
      ],
      ...(queuedInputs.length > 0 ? { queuedInputs } : {})
    };
  }
};
