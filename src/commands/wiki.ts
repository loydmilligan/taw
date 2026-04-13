import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import {
  buildWikiMode,
  getWikiInfo,
  initWiki,
  listWikiTopics,
  readRecentWikiLogs,
  readWikiFile,
  wikiExists
} from '../services/wiki/manager.js';
import { buildHisterIngestMaterial } from '../services/wiki/hister-ingest.js';
import {
  clearPendingWikiIngest,
  writePendingWikiIngest
} from '../services/wiki/pending-ingest.js';
import {
  formatPendingLinkReviewSummary,
  backfillOperationalFrontmatter,
  buildPendingLinkReview
} from '../services/wiki/link-review.js';
import { writePendingLinkReview } from '../services/wiki/pending-link-review.js';
import {
  buildPendingIndexReview,
  formatPendingIndexReviewSummary
} from '../services/wiki/reindex.js';
import { writePendingIndexReview } from '../services/wiki/pending-index-review.js';
import { readResearchSources } from '../core/research/store.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';
import type { TranscriptEntry } from '../types/app.js';
import { searchHister } from '../services/hister/client.js';

const wikiHisterArgsSchema = z.object({
  max_results: z.number().int().positive().max(10).default(5),
  auto_confirm: z.boolean().default(false)
});

function notice(id: string, title: string, body: string): TranscriptEntry {
  return { id, kind: 'notice' as const, title, body };
}

function error(id: string, title: string, body: string): TranscriptEntry {
  return { id, kind: 'error' as const, title, body };
}

export const wikiCommand: CommandDefinition = {
  name: 'wiki',
  description: 'Manage your personal knowledge wiki.',
  usage:
    '/wiki <init <topic>|ingest <topic> [review] [file]|ingest-hister <topic> [review] <query>|links <topic> [recent]|reindex <topic>|query <topic> <question>|lint <topic>|show [topic]|list>',

  async run(input, context) {
    const sub = input.args[0];

    if (!sub || sub === 'list') {
      return runList();
    }

    if (sub === 'init') {
      return runInit(input.args[1]);
    }

    if (sub === 'ingest') {
      const hasReview = input.args.includes('review');
      const fileArg = input.args.slice(2).find((a) => a !== 'review');
      return runIngest(input.args[1], hasReview, fileArg ?? null, context);
    }

    if (sub === 'ingest-hister') {
      const hasReview = input.args.includes('review');
      const query = input.args.slice(2).filter((a) => a !== 'review').join(' ');
      return runIngestHister(input.args[1], hasReview, query, context);
    }

    if (sub === 'query') {
      return runQuery(input.args[1], input.args.slice(2).join(' '), context);
    }

    if (sub === 'links') {
      return runLinks(input.args[1], input.args.slice(2), context);
    }

    if (sub === 'reindex') {
      return runReindex(input.args[1], context);
    }

    if (sub === 'lint') {
      return runLint(input.args[1]);
    }

    if (sub === 'show') {
      return runShow(input.args[1]);
    }

    return {
      entries: [
        {
          id: createId('wiki-usage'),
          kind: 'error' as const,
          title: 'Wiki Usage',
          body: '/wiki <init <topic>|ingest <topic> [review] [file]|ingest-hister <topic> [review] <query>|links <topic> [recent]|reindex <topic>|query <topic> <question>|lint <topic>|show [topic]|list>'
        }
      ]
    };
  }
};

async function runList() {
  const topics = await listWikiTopics();

  if (topics.length === 0) {
    return {
      entries: [
        {
          id: createId('wiki-list-empty'),
          kind: 'notice' as const,
          title: 'No Wikis Yet',
          body: 'Start one with /wiki init <topic>.\nExample: /wiki init vibecoding'
        }
      ]
    };
  }

  return {
    entries: [
      {
        id: createId('wiki-list'),
        kind: 'notice' as const,
        title: 'Your Wikis',
        body: topics.map((t) => `• ${t}`).join('\n')
      }
    ]
  };
}

async function runInit(topic: string | undefined) {
  if (!topic) {
    return {
      entries: [
        {
          id: createId('wiki-init-usage'),
          kind: 'error' as const,
          title: 'Wiki Init Usage',
          body: '/wiki init <topic>  Example: /wiki init vibecoding'
        }
      ]
    };
  }

  const normalized = normalizeTopic(topic);
  const alreadyExists = await wikiExists(normalized);
  const info = await initWiki(normalized);

  const setupPrompt = buildSetupPrompt(normalized, info.schemaPath, info.topicDir);

  return {
    mode: buildWikiMode('Setup', normalized),
    phase: 'idle' as const,
    queuedInputs: [setupPrompt],
    entries: [
      {
        id: createId('wiki-init'),
        kind: 'notice' as const,
        title: alreadyExists ? 'Wiki Already Exists' : 'Wiki Initialized',
        body: [
          `Topic: ${normalized}`,
          `Location: ${info.topicDir}`,
          alreadyExists
            ? 'Directory already existed. Entering setup mode to review or update the schema.'
            : 'Directory structure created. Entering setup mode to generate schema.md.'
        ].join('\n')
      }
    ]
  };
}

async function runIngest(
  topic: string | undefined,
  review: boolean,
  filePath: string | null,
  context: Parameters<typeof wikiCommand.run>[1]
) {
  if (!topic) {
    return {
      entries: [
        {
          id: createId('wiki-ingest-usage'),
          kind: 'error' as const,
          title: 'Wiki Ingest Usage',
          body: '/wiki ingest <topic> [review] [file]\nExamples:\n  /wiki ingest vibecoding\n  /wiki ingest vibecoding review\n  /wiki ingest vibecoding /path/to/article.md'
        }
      ]
    };
  }

  const normalized = normalizeTopic(topic);

  if (!(await wikiExists(normalized))) {
    return {
      entries: [
        {
          id: createId('wiki-ingest-missing'),
          kind: 'error' as const,
          title: 'Wiki Not Found',
          body: `No wiki named "${normalized}". Create it first with /wiki init ${normalized}`
        }
      ]
    };
  }

  const info = getWikiInfo(normalized);
  const { material, source } = await buildIngestMaterial(context, filePath);
  const mode = buildWikiMode(review ? 'Stage' : 'Ingest', normalized);

  // Schema and index are now injected via buildPromptContext — the queued
  // prompt is kept short so it doesn't appear as a wall of text in the transcript.
  const prompt = review
    ? buildStagePrompt(normalized, material, info.topicDir)
    : buildIngestPrompt(normalized, material, info.topicDir);

  return {
    mode,
    phase: 'idle' as const,
    queuedInputs: [prompt],
    entries: [
      {
        id: createId('wiki-ingest'),
        kind: 'notice' as const,
        title: review ? 'Wiki Stage — Review Mode' : 'Wiki Ingest — Auto Mode',
        body: review
          ? [`Wiki: ${normalized}`, `Source: ${source}`, 'TAW will show you what it plans to add. Review it, give feedback, then /finalize to execute.'].join('\n')
          : [`Wiki: ${normalized}`, `Source: ${source}`, 'TAW is writing wiki pages now.'].join('\n')
      }
    ]
  };
}

async function runIngestHister(
  topic: string | undefined,
  review: boolean,
  rawQueryAndFlags: string,
  context: Parameters<typeof wikiCommand.run>[1]
) {
  const parsedArgs = parseWikiHisterArgs(rawQueryAndFlags);

  if (!topic || parsedArgs.usageError || !parsedArgs.query.trim()) {
    return {
      entries: [
        {
          id: createId('wiki-ingest-hister-usage'),
          kind: 'error' as const,
          title: 'Wiki Ingest Hister Usage',
          body: '/wiki ingest-hister <topic> [review] <query> [--max-results N] [--yes]\nExamples:\n  /wiki ingest-hister vibecoding "claude code documentation"\n  /wiki ingest-hister vibecoding review "model context protocol" --max-results 3\n  /wiki ingest-hister vibecoding "claude code agent teams" --yes'
        }
      ]
    };
  }

  const query = parsedArgs.query;
  const maxResults = parsedArgs.maxResults;
  const autoConfirm = parsedArgs.autoConfirm;

  const normalized = normalizeTopic(topic);

  if (!(await wikiExists(normalized))) {
    return {
      entries: [
        {
          id: createId('wiki-ingest-hister-missing'),
          kind: 'error' as const,
          title: 'Wiki Not Found',
          body: `No wiki named "${normalized}". Create it first with /wiki init ${normalized}`
        }
      ]
    };
  }

  if (!context.globalConfig.hister.enabled) {
    return {
      entries: [
        {
          id: createId('wiki-ingest-hister-disabled'),
          kind: 'error' as const,
          title: 'Hister Disabled',
          body: 'Enable Hister first with /config hister enabled on.'
        }
      ]
    };
  }

  const info = getWikiInfo(normalized);

  if (!autoConfirm) {
    const preview = await searchHister(
      query,
      context.globalConfig.hister,
      maxResults
    );

    if (!preview.ok) {
      return {
        entries: [
          {
            id: createId('wiki-ingest-hister-preview-error'),
            kind: 'error' as const,
            title: 'Hister Preview Failed',
            body: preview.error ?? 'Could not load Hister results.'
          }
        ]
      };
    }

    if (preview.results.length === 0) {
      return {
        entries: [
          {
            id: createId('wiki-ingest-hister-preview-empty'),
            kind: 'error' as const,
            title: 'No Hister Results',
            body: `No browser history results matched "${query}".`
          }
        ]
      };
    }

    const confirmCommand = buildWikiIngestHisterConfirmCommand(
      normalized,
      review,
      query,
      maxResults
    );

    await writePendingWikiIngest(context.session, {
      kind: 'hister',
      topic: normalized,
      review,
      query,
      maxResults,
      createdAt: new Date().toISOString(),
      results: preview.results
    });

    return {
      entries: [
        {
          id: createId('wiki-ingest-hister-preview'),
          kind: 'notice' as const,
          title: 'Wiki Ingest Hister Preview',
          body: [
            `Wiki: ${normalized}`,
            `Query: ${query}`,
            `Showing ${preview.results.length} result${preview.results.length === 1 ? '' : 's'} (default cap ${maxResults}).`,
            '',
            ...preview.results.map(
              (result, index) =>
                `${index + 1}. ${result.title}\n   ${result.url}\n   /open-source ${index + 1}`
            ),
            '',
            'No content has been fetched or ingested yet.',
            'Use /open-source <number> to inspect one of these preview results.',
            'Use /confirm to fetch and ingest exactly this preview set.',
            'Use /cancel to discard this preview.',
            `Direct confirm command: ${confirmCommand}`
          ].join('\n')
        }
      ]
    };
  }

  await clearPendingWikiIngest(context.session);

  const ingest = await buildHisterIngestMaterial(
    query,
    context.globalConfig.hister,
    maxResults
  );

  if (!ingest.ok) {
    return {
      entries: [
        {
          id: createId('wiki-ingest-hister-error'),
          kind: 'error' as const,
          title: 'Hister Ingest Failed',
          body: ingest.error ?? 'Could not build wiki ingest material from browser history.'
        }
      ]
    };
  }

  const mode = buildWikiMode(review ? 'Stage' : 'Ingest', normalized);
  const prompt = review
    ? buildStagePrompt(normalized, ingest.material, info.topicDir)
    : buildIngestPrompt(normalized, ingest.material, info.topicDir);

  return {
    mode,
    phase: 'idle' as const,
    queuedInputs: [prompt],
    entries: [
      {
        id: createId('wiki-ingest-hister'),
        kind: 'notice' as const,
        title: review ? 'Wiki Stage — Review Mode' : 'Wiki Ingest — Auto Mode',
        body: [
          `Wiki: ${normalized}`,
          `Source: ${ingest.sourceLabel}`,
          review
            ? 'TAW will show you what it plans to add from the fetched history pages. Review it, give feedback, then /finalize to execute.'
            : 'TAW is writing wiki pages now from the fetched history pages.'
        ].join('\n')
      }
    ]
  };
}

async function runQuery(
  topic: string | undefined,
  question: string,
  context: Parameters<typeof wikiCommand.run>[1]
) {
  if (!topic) {
    return {
      entries: [
        {
          id: createId('wiki-query-usage'),
          kind: 'error' as const,
          title: 'Wiki Query Usage',
          body: '/wiki query <topic> <question>'
        }
      ]
    };
  }

  const normalized = normalizeTopic(topic);

  if (!(await wikiExists(normalized))) {
    return {
      entries: [
        {
          id: createId('wiki-query-missing'),
          kind: 'error' as const,
          title: 'Wiki Not Found',
          body: `No wiki named "${normalized}". Create it first with /wiki init ${normalized}`
        }
      ]
    };
  }

  const prompt = [
    `Answer this question using the ${normalized} wiki: ${question || 'Give me an overview of the wiki.'}`,
    `Wiki pages are at ${getWikiInfo(normalized).pagesDir}`,
    'Use the wiki schema and index in your context to find relevant pages, then synthesize an answer.',
    'If the answer is worth keeping, use write_wiki_page to save it as an analysis page under analyses/.'
  ].join('\n\n');

  return {
    mode: buildWikiMode('Query', normalized),
    phase: 'idle' as const,
    queuedInputs: [prompt],
    entries: [
      {
        id: createId('wiki-query'),
        kind: 'notice' as const,
        title: `Wiki Query — ${normalized}`,
        body: question || 'Overview requested'
      }
    ]
  };
}

async function runLint(topic: string | undefined) {
  if (!topic) {
    return {
      entries: [
        {
          id: createId('wiki-lint-usage'),
          kind: 'error' as const,
          title: 'Wiki Lint Usage',
          body: '/wiki lint <topic>'
        }
      ]
    };
  }

  const normalized = normalizeTopic(topic);

  if (!(await wikiExists(normalized))) {
    return {
      entries: [
        {
          id: createId('wiki-lint-missing'),
          kind: 'error' as const,
          title: 'Wiki Not Found',
          body: `No wiki named "${normalized}".`
        }
      ]
    };
  }

  const info = getWikiInfo(normalized);
  const recentLog = await readRecentWikiLogs(normalized, 2);

  const prompt = [
    `Health-check the ${normalized} wiki. The schema and index are in your context.`,
    recentLog ? `## Recent Activity\n\n${recentLog.slice(0, 2000)}` : null,
    `Wiki pages directory: ${info.pagesDir}`,
    'Look for: contradictions between pages, stale claims, orphan pages, concepts without their own page, missing cross-references, data gaps.',
    'Use write_wiki_page to fix what you find. Report findings and suggest what to research next.'
  ]
    .filter(Boolean)
    .join('\n\n');

  return {
    mode: buildWikiMode('Lint', normalized),
    phase: 'idle' as const,
    queuedInputs: [prompt],
    entries: [
      {
        id: createId('wiki-lint'),
        kind: 'notice' as const,
        title: `Wiki Lint — ${normalized}`,
        body: 'Checking wiki health...'
      }
    ]
  };
}

async function runLinks(
  topic: string | undefined,
  flags: string[],
  context: Parameters<typeof wikiCommand.run>[1]
) {
  if (!topic) {
    return {
      entries: [
        error(
          createId('wiki-links-usage'),
          'Wiki Links Usage',
          '/wiki links <topic> [recent]\nExamples:\n  /wiki links vibecoding recent\n  /wiki links vibecoding'
        )
      ]
    };
  }

  const normalized = normalizeTopic(topic);
  if (!(await wikiExists(normalized))) {
    return {
      entries: [
        error(
          createId('wiki-links-missing'),
          'Wiki Not Found',
          `No wiki named "${normalized}". Create it first with /wiki init ${normalized}`
        )
      ]
    };
  }

  const recentOnly = flags.length === 0 || flags.includes('recent');
  if (!recentOnly) {
    return {
      entries: [
        error(
          createId('wiki-links-flags'),
          'Unsupported Link Review Scope',
          'Only recent-link review is implemented right now. Use /wiki links <topic> recent.'
        )
      ]
    };
  }

  const backfilled = await backfillOperationalFrontmatter(normalized);
  const pending = await buildPendingLinkReview(normalized);
  await writePendingLinkReview(context.session, pending);

  return {
    entries: [
      notice(
        createId('wiki-links-review'),
        `Wiki Link Review — ${normalized}`,
        [
          backfilled > 0
            ? `Backfilled operational frontmatter on ${backfilled} note${backfilled === 1 ? '' : 's'}.`
            : null,
          formatPendingLinkReviewSummary(pending)
        ]
          .filter(Boolean)
          .join('\n')
      )
    ]
  };
}

async function runReindex(
  topic: string | undefined,
  context: Parameters<typeof wikiCommand.run>[1]
) {
  if (!topic) {
    return {
      entries: [
        error(
          createId('wiki-reindex-usage'),
          'Wiki Reindex Usage',
          '/wiki reindex <topic>\nExample:\n  /wiki reindex vibecoding'
        )
      ]
    };
  }

  const normalized = normalizeTopic(topic);
  if (!(await wikiExists(normalized))) {
    return {
      entries: [
        error(
          createId('wiki-reindex-missing'),
          'Wiki Not Found',
          `No wiki named "${normalized}". Create it first with /wiki init ${normalized}`
        )
      ]
    };
  }

  const backfilled = await backfillOperationalFrontmatter(normalized);
  const pending = await buildPendingIndexReview(normalized);
  await writePendingIndexReview(context.session, pending);

  return {
    entries: [
      notice(
        createId('wiki-reindex-review'),
        `Wiki Reindex Review — ${normalized}`,
        [
          backfilled > 0
            ? `Backfilled operational frontmatter on ${backfilled} note${backfilled === 1 ? '' : 's'}.`
            : null,
          formatPendingIndexReviewSummary(pending)
        ]
          .filter(Boolean)
          .join('\n')
      )
    ]
  };
}

async function runShow(topic: string | undefined) {
  if (!topic) {
    // Show list of topics
    return runList();
  }

  const normalized = normalizeTopic(topic);

  if (!(await wikiExists(normalized))) {
    return {
      entries: [
        {
          id: createId('wiki-show-missing'),
          kind: 'error' as const,
          title: 'Wiki Not Found',
          body: `No wiki named "${normalized}".`
        }
      ]
    };
  }

  const index = await readWikiFile(normalized, 'index.md');
  const recentLog = await readRecentWikiLogs(normalized, 1);

  return {
    entries: [
      {
        id: createId('wiki-show'),
        kind: 'notice' as const,
        title: `Wiki: ${normalized}`,
        body: index ?? '(Index not yet written — run /wiki init to set up)'
      },
      ...(recentLog
        ? [
            {
              id: createId('wiki-show-log'),
              kind: 'notice' as const,
              title: 'Recent Activity',
              body: recentLog.slice(0, 2000)
            }
          ]
        : [])
    ]
  };
}

// --- helpers ---

function normalizeTopic(raw: string): string {
  return raw.toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

async function buildIngestMaterial(
  context: Parameters<typeof wikiCommand.run>[1],
  filePath: string | null
): Promise<{ material: string; source: string }> {
  const parts: string[] = [];
  let source = 'current session';

  // 1. Explicit file argument takes priority
  if (filePath) {
    try {
      const content = await readFile(filePath, 'utf8');
      parts.push(`## File: ${filePath}\n\n${content.slice(0, 8000)}`);
      source = filePath;
    } catch {
      parts.push(`## File: ${filePath}\n\n(Could not read file.)`);
      source = filePath;
    }
  }

  // 2. Most recent finalized artifact from this session
  const recentArtifact = context.session.metadata.artifacts.at(-1);
  if (recentArtifact) {
    try {
      const content = await readFile(recentArtifact.path, 'utf8');
      parts.push(`## Finalized Artifact: ${recentArtifact.title}\n\n${content.slice(0, 6000)}`);
      source = recentArtifact.title;
    } catch {
      parts.push(`## Finalized Artifact: ${recentArtifact.title}\n\n(Could not read: ${recentArtifact.path})`);
    }
  }

  // 3. Research sources from this session
  const sources = await readResearchSources(context.session);
  if (sources.length > 0) {
    const summaries = sources
      .map((s, i) =>
        [
          `${i + 1}. ${s.title}`,
          s.url ? `   URL: ${s.url}` : null,
          s.excerpt ? `   Excerpt: ${s.excerpt.slice(0, 400)}` : null,
          s.note ? `   Note: ${s.note}` : null
        ]
          .filter(Boolean)
          .join('\n')
      )
      .join('\n\n');
    parts.push(`## Research Sources\n\n${summaries}`);
    if (source === 'current session') {
      source = `${sources.length} research source${sources.length > 1 ? 's' : ''}`;
    }
  }

  // 4. Fallback: use recent conversation transcript
  if (parts.length === 0) {
    const assistantEntries = context.transcript
      .filter((e) => e.kind === 'assistant' && e.body.trim().length > 100)
      .slice(-3);

    if (assistantEntries.length > 0) {
      const transcriptContent = assistantEntries
        .map((e) => `### ${e.title ?? 'Response'}\n\n${e.body.slice(0, 2000)}`)
        .join('\n\n');
      parts.push(`## Recent Conversation\n\n${transcriptContent}`);
      source = 'recent conversation';
    } else {
      // Last resort: tell the LLM to work from what was discussed
      parts.push('## Source\n\nNo specific source material. Use the current conversation context and your knowledge to add relevant content to the wiki.');
      source = 'conversation context';
    }
  }

  return { material: parts.join('\n\n'), source };
}

function buildSetupPrompt(
  topic: string,
  schemaPath: string,
  topicDir: string
): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `Set up a personal wiki for the topic: ${topic}.`,
    '',
    `The wiki directory is at: ${topicDir}`,
    `Write the schema to: ${schemaPath}`,
    `Today's date: ${today} — use this for created/updated frontmatter fields on starter pages.`,
    '',
    'The schema should define:',
    '- What this wiki is for (the topic purpose and scope)',
    '- What page types exist and what goes in each (e.g. concepts/, entities/, sources/, analyses/)',
    '- Naming conventions for pages',
    '- What a complete ingest looks like (which pages to touch per source)',
    '- Cross-linking conventions',
    '- Obsidian-safe link formatting that preserves slugged filenames, e.g. [[agentic-loops|Agentic Loops]]',
    '',
    topic.includes('vibe') || topic.includes('coding')
      ? [
          'For a vibecoding wiki, the focus is: AI-assisted coding tools and workflows.',
          'Key areas to cover:',
          '- Tools: Claude Code, Cursor, Copilot, Codex, OpenCode, and similar',
          '- Concepts: context management, CLAUDE.md design, prompting patterns, agentic loops, tool use, MCP servers',
          '- Techniques: effective prompting, context window strategies, session workflows, review patterns',
          '- Observations: what works, what breaks, lessons learned',
          'Create entity pages for each tool. Create concept pages for each technique or idea.',
          'Source pages should capture key takeaways and link to the entities/concepts they touch.'
        ].join('\n')
      : `Think about what entities, concepts, and source types will appear most often in ${topic} research.`,
    '',
    'Use write_wiki_page to write schema.md.',
    'Then write a starter pages/overview.md that describes the wiki and what it will contain.',
    'Finally update index.md to reflect these two pages.'
  ].join('\n');
}

function buildIngestPrompt(
  topic: string,
  material: string,
  topicDir: string
): string {
  const today = new Date().toISOString().slice(0, 10);
  return [
    `Ingest the following material into the ${topic} wiki.`,
    `Wiki directory: ${topicDir}`,
    `Today's date: ${today} — use this for created/updated/ingested frontmatter fields.`,
    '',
    `## Material To Ingest\n\n${material}`,
    '',
    'Begin immediately with write_wiki_page calls — do not describe your plan first.',
    'IMPORTANT: The material above is your RAW INPUT SOURCE. Do not write it back as-is. Extract knowledge from it and create new entity, concept, and analysis pages.',
    'If the material is already formatted as a wiki page, treat its content as source information — extract the facts, topics, and links it contains and distribute them into appropriate entity/concept pages.',
    'Follow the wiki schema and index already in your context.',
    'Every page MUST start with a YAML frontmatter block (see schema for field requirements per type). No exceptions — frontmatter before any heading.',
    'Use Obsidian-safe wikilinks that match the actual page filename slugs. Example: [[agentic-loops|Agentic Loops]], [[context-management|Context Management]], [[claude-code|Claude Code]].',
    'Before creating a new page, check the wiki index. If a page with the same path/name already exists, do not create a duplicate — set overwrite=true to update it instead.',
    'For brand-new pages leave overwrite false (default).',
    'Update pages/overview.md and index.md to reflect new content.',
    'Cross-link using [[slug|Display Text]] notation. A good ingest touches 5-10 pages.',
    'After all writes are complete, briefly summarize what was written. Start with totals for notes created and notes updated, then list each page path and whether it was created or updated.'
  ].join('\n\n');
}

function buildStagePrompt(
  topic: string,
  material: string,
  topicDir: string
): string {
  return [
    `Plan what you would add to the ${topic} wiki for this material. Do NOT write any files yet.`,
    `Wiki directory: ${topicDir}`,
    '',
    `## Material To Ingest\n\n${material}`,
    '',
    'Using the wiki schema and index already in your context, show me:',
    '- Which pages you would create (path and content summary)',
    '- Which existing pages you would update (and what changes)',
    '- Cross-links you would add',
    '- Use Obsidian-safe links like [[agentic-loops|Agentic Loops]] when previewing link targets',
    '- Do not create a new page if the index already shows a page with that same path/name',
    '',
    'Do not call write_wiki_page. When I run /finalize, you will execute the plan.'
  ].join('\n\n');
}

function parseWikiHisterArgs(raw: string): {
  query: string;
  maxResults: number;
  autoConfirm: boolean;
  usageError: boolean;
} {
  const tokens = raw
    .split(/\s+/)
    .map((token) => token.trim())
    .filter(Boolean);
  const queryParts: string[] = [];
  let maxResults: number | undefined;
  let autoConfirm = false;

  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];

    if (token === '--yes' || token === '-y') {
      autoConfirm = true;
      continue;
    }

    if (token === '--max-results') {
      const nextToken = tokens[index + 1];
      const parsed = wikiHisterArgsSchema.safeParse({
        max_results: Number(nextToken),
        auto_confirm: autoConfirm
      });

      if (!nextToken || !parsed.success) {
        return {
          query: '',
          maxResults: 5,
          autoConfirm,
          usageError: true
        };
      }

      maxResults = parsed.data.max_results;
      index += 1;
      continue;
    }

    queryParts.push(token);
  }

  const validated = wikiHisterArgsSchema.parse({
    max_results: maxResults,
    auto_confirm: autoConfirm
  });

  return {
    query: queryParts.join(' ').trim(),
    maxResults: validated.max_results,
    autoConfirm: validated.auto_confirm,
    usageError: false
  };
}

function buildWikiIngestHisterConfirmCommand(
  topic: string,
  review: boolean,
  query: string,
  maxResults: number
): string {
  return `/wiki ingest-hister ${topic}${review ? ' review' : ''} "${query}" --max-results ${maxResults} --yes`;
}
