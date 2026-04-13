# Hister Integration Guide

This document is the practical reference for using Hister from another coding project.

It combines:

- the product-level description from the upstream Hister README
- the endpoint inventory captured in [docs/hister_api.go](/home/loydmilligan/Projects/taw/docs/hister_api.go)
- the integration patterns currently used inside TAW

The goal here is not just "how do I call Hister?" but "how should a knowledge-oriented project use browser history well?"

## What Hister Is

Hister is a local search engine over your browsing history.

The important distinction is that it is not just URL history. It is intended to provide full-text search over visited pages, which makes it useful as a personal retrieval layer for:

- articles you read
- docs pages you visited
- technical references
- blog posts
- issue threads
- research pages
- other web content with durable informational value

That makes Hister a good fit for knowledge workflows, research assistants, and wiki-ingest tools.

It is a worse fit for:

- private personal interactions
- ephemeral dashboards
- inboxes
- calendars
- visual-only or app-shell pages
- pages where the "content" is mostly UI state rather than durable text

## Recommended Mental Model

Treat Hister as a **knowledge-biased browser memory**, not as a complete mirror of everything you clicked.

A good downstream project should assume:

- some history entries are high-value knowledge documents
- some are navigational junk
- some are sensitive and should not be indexed or surfaced
- some are useful URLs but poor text sources

That means the best integration is usually:

1. search Hister for candidate pages
2. filter aggressively
3. fetch or retrieve readable text
4. import only the pages worth keeping

## How TAW Uses Hister

TAW currently uses Hister in two different ways:

### 1. CLI search for retrieval

TAW shells out to:

```bash
hister search "<query>"
```

This is used because it is simple, fast, and avoids having to reproduce Hister search behavior over HTTP.

### 2. HTTP API for write/admin actions

TAW uses the HTTP API for actions like:

- adding a URL to the index
- triggering reindex

Those API calls require the CSRF/session flow described below.

### Why that split is reasonable

For many projects, the best default is:

- use CLI for search
- use HTTP API for mutations or admin operations

That gives you:

- a simple retrieval path
- fewer auth complications for search
- explicit handling for privileged operations

## Current TAW Hister Surface

TAW currently exposes:

- `/hister search <query> [--max-results N]`
- `/hister show <index>`
- `/hister open <index>`
- `/hister reindex`
- `/wiki ingest-hister <topic> ...`

And internally supports:

- CLI search via `searchHister()`
- HTTP add via `addToHister()`
- HTTP reindex via `reindexHister()`

Relevant code:

- [src/services/hister/client.ts](/home/loydmilligan/Projects/taw/src/services/hister/client.ts)
- [src/commands/hister.ts](/home/loydmilligan/Projects/taw/src/commands/hister.ts)
- [src/services/wiki/hister-ingest.ts](/home/loydmilligan/Projects/taw/src/services/wiki/hister-ingest.ts)

## Hister Config Model

TAW models Hister as:

```ts
export interface HisterConfig {
  enabled: boolean;
  baseUrl: string;
  token?: string;
}
```

Typical defaults:

- `baseUrl`: `http://localhost:4433`
- optional bearer token if your Hister deployment expects one

## Integration Patterns

## Pattern 1: CLI Search

This is the simplest integration if your project runs on the same machine as Hister.

### Example

```bash
hister search "claude code"
```

TAW expects output in alternating lines:

```text
Claude Code docs
https://docs.example.com/claude-code

Agent Skills paper
https://arxiv.org/abs/2602.08004
```

The current parser:

- ignores debug/info log lines
- pairs `title` then `url`
- keeps only `http://` and `https://` results

### Minimal Node example

```ts
import { spawn } from 'node:child_process';

async function searchHister(query: string): Promise<Array<{ title: string; url: string }>> {
  return new Promise((resolve, reject) => {
    const proc = spawn('hister', ['search', query], { timeout: 10000 });
    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (buf) => {
      stdout += buf.toString();
    });

    proc.stderr.on('data', (buf) => {
      stderr += buf.toString();
    });

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code !== 0 && stdout.trim().length === 0) {
        reject(new Error(stderr.trim() || `hister exited with ${code}`));
        return;
      }

      const lines = stdout
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .filter((line) => !line.includes(' | DEBUG ') && !line.includes(' | INFO '));

      const results: Array<{ title: string; url: string }> = [];
      for (let i = 0; i + 1 < lines.length; i += 2) {
        const title = lines[i];
        const url = lines[i + 1];
        if (url.startsWith('http://') || url.startsWith('https://')) {
          results.push({ title, url });
        }
      }

      resolve(results);
    });
  });
}
```

### When CLI search is the right choice

- your project runs locally
- you control the machine
- you want the easiest search path
- you do not need to expose search over a remote API boundary

## Pattern 2: HTTP API

Use the HTTP API when you need:

- programmatic add
- reindex control
- admin workflows
- browser/session-aware integration

### Important auth note

The API is not "just send a POST."

TAW’s client assumes this sequence:

1. `GET /api/config`
2. read the CSRF token from the `x-csrf-token` response header
3. read the session cookie from `set-cookie`
4. send the follow-up POST with:
   - `X-Csrf-Token`
   - `Cookie`
   - optional `Authorization: Bearer <token>`

That is the key detail many other projects would otherwise miss.

## API Endpoints Worth Knowing

From [docs/hister_api.go](/home/loydmilligan/Projects/taw/docs/hister_api.go), the most relevant endpoints for a coding project are:

### Core informational endpoints

- `GET /api/config`
- `GET /api/document`
- `GET /api/history`
- `GET /api/stats`
- `GET /api/file`
- `GET /api`
- `GET /api/profile`

### Mutation/admin endpoints

- `POST /api/add`
- `POST /add` (legacy alias)
- `POST /api/history`
- `POST /api/delete`
- `POST /api/add_alias`
- `POST /api/delete_alias`
- `POST /api/batch`
- `POST /api/reindex`
- `POST /api/login`
- `POST /api/logout`

### Search endpoint

- `GET /search`

The code labels it as a websocket endpoint. For reuse in another project, treat it as a specialized search surface, but if CLI search already works for you, CLI is simpler.

## Important Endpoint Details

### `GET /api/config`

Purpose:

- bootstrap auth/session state
- retrieve CSRF token and cookie for later POSTs

TAW relies on:

- response header `x-csrf-token`
- response header `set-cookie` containing a `hister=...` cookie

### `POST /api/add`

Purpose:

- add a document or URL to Hister

TAW currently sends form-urlencoded data:

```ts
const body = new URLSearchParams({ url, title });
```

Then POSTs it to:

```text
POST /api/add
Content-Type: application/x-www-form-urlencoded
X-Csrf-Token: <token>
Cookie: hister=<session-cookie>
Authorization: Bearer <token>   // optional
```

### `GET /api/document?url=<url>`

Purpose:

- retrieve the indexed document corresponding to a URL

This is a strong candidate for future use in any history-to-knowledge project, because it lets you prefer **already indexed text** over live re-fetching from the public web.

That is often better than fetching the URL again because:

- the live page may have changed
- the page may now be unavailable
- the indexed text may already represent the version you actually visited

### `POST /api/reindex`

Purpose:

- rebuild the index

The endpoint definition in `docs/hister_api.go` shows two relevant optional flags:

- `skipSensitive`
- `detectLanguages`

TAW currently calls reindex with:

```ts
{ skipSensitive: true }
```

That is a sensible default for knowledge-oriented usage.

## Example: Add URL via HTTP

```ts
async function getHisterAuthContext(baseUrl: string, token?: string) {
  const res = await fetch(`${baseUrl}/api/config`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {}
  });

  if (!res.ok) {
    throw new Error(`Config fetch failed: ${res.status}`);
  }

  const csrfToken = res.headers.get('x-csrf-token');
  const sessionCookie = res.headers
    .get('set-cookie')
    ?.split(';')
    .find((part) => part.trim().startsWith('hister='))
    ?.trim();

  if (!csrfToken || !sessionCookie) {
    throw new Error('Missing Hister CSRF/session bootstrap data');
  }

  return { csrfToken, sessionCookie };
}

async function addToHister(baseUrl: string, url: string, title: string, token?: string) {
  const auth = await getHisterAuthContext(baseUrl, token);
  const body = new URLSearchParams({ url, title });

  const res = await fetch(`${baseUrl}/api/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Csrf-Token': auth.csrfToken,
      Cookie: auth.sessionCookie,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body.toString()
  });

  if (!res.ok) {
    throw new Error(`Add failed: ${res.status}`);
  }
}
```

## Example: Reindex via HTTP

```ts
async function reindexHister(
  baseUrl: string,
  token?: string,
  options: { skipSensitive?: boolean; detectLanguages?: boolean } = {}
) {
  const auth = await getHisterAuthContext(baseUrl, token);
  const body = new URLSearchParams();

  if (options.skipSensitive !== undefined) {
    body.set('skipSensitive', String(options.skipSensitive));
  }
  if (options.detectLanguages !== undefined) {
    body.set('detectLanguages', String(options.detectLanguages));
  }

  const res = await fetch(`${baseUrl}/api/reindex`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'X-Csrf-Token': auth.csrfToken,
      Cookie: auth.sessionCookie,
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: body.toString()
  });

  if (!res.ok) {
    throw new Error(`Reindex failed: ${res.status}`);
  }
}
```

## Example: Recommended Project Workflow

If your new project is meant to review history and surface useful knowledge:

1. search Hister for candidates
2. score/filter results
3. retrieve indexed text when possible
4. fallback to live fetch if indexed text is unavailable
5. extract readable text
6. file only durable knowledge into your downstream system

That is exactly the logic TAW follows in [src/services/wiki/hister-ingest.ts](/home/loydmilligan/Projects/taw/src/services/wiki/hister-ingest.ts).

## TAW’s Retrieval Strategy

TAW’s Hister ingest does this:

1. run Hister search
2. get top matching URLs
3. try to retrieve indexed content for each result
4. if indexed content is not available, fetch the live URL
5. extract readable text
6. import the text into the session or wiki workflow

That is a good general pattern because it balances:

- historical fidelity
- resilience
- simplicity

## Indexing Policy Recommendations

This is the most important section if your downstream project is knowledge-focused.

Hister can index visited pages, but your project should not assume all pages are equally useful.

### Strong candidates for indexing and retrieval

- official docs
- technical blog posts
- standards/specs
- GitHub READMEs and issue discussions
- research papers
- forum threads with substantive content
- tutorials
- product docs
- long-form essays and analyses

### Usually poor candidates

- Gmail and personal inboxes
- calendars
- banking or finance dashboards
- admin dashboards
- project-management dashboards
- ticket queues with mostly status chrome
- chat apps and private messaging UIs
- social feeds without durable article content
- pages whose value is mostly visual layout

### Not automatically excluded, but lower-value by default

- dashboards with embedded reports
- data-heavy apps
- charts without text explanation
- image galleries
- rich SaaS UIs

These pages can still be useful if:

- the text payload is meaningful
- the page contains an explanation, report, or incident narrative
- your project explicitly wants operational history, not just knowledge pages

## Suggested Rule Categories

If you are maintaining Hister rules, the most useful categories to add are:

### 1. Sensitive-content exclusions

Exclude or strongly downrank:

- webmail
- calendars
- banking
- health portals
- HR systems
- auth/account/security settings pages

Reason:

- privacy risk
- usually poor knowledge value

### 2. App-shell exclusions

Exclude or downrank:

- dashboards
- kanban boards
- issue backlogs
- analytics homepages
- generic workspace landing pages

Reason:

- these are often navigational shells, not durable content pages

### 3. Knowledge-source priority rules

Prioritize:

- docs domains
- standards bodies
- research repositories
- engineering blogs
- technical reference sites

Reason:

- these are the pages most likely to produce valuable retrieval later

### 4. Authenticated personal-content exclusions

Be especially skeptical of:

- `mail.*`
- `calendar.*`
- `app.*`
- personal dashboards
- internal SaaS instances with private content

Reason:

- even if technically indexable, they are often bad retrieval targets for a knowledge assistant

## Practical Heuristics for a Knowledge Project

When deciding whether to keep or use a Hister result, ask:

### Does the page contain durable information?

Good:

- definitions
- explanations
- procedures
- comparisons
- arguments
- docs

Bad:

- "open tab state"
- today's inbox
- current dashboard widgets

### Is the text likely meaningful outside the original app context?

Good:

- an article still makes sense when extracted

Bad:

- a CRM page that only makes sense in the live UI

### Would you want this page to appear in a research result six months later?

If not, it probably should not be heavily indexed or imported downstream.

## API/Integration Advice for Another Project

If you are building another project on top of Hister, I would recommend:

### Use CLI search first

It is the least fragile path for local retrieval.

### Prefer indexed document retrieval over live re-fetch

If your project can query `GET /api/document?url=...`, do that before live fetch.

### Keep your own filtering layer

Do not trust raw browser history as already curated knowledge.

### Model "history usefulness" explicitly

Your project should score or classify pages:

- knowledge
- ephemeral
- sensitive
- visual-only
- operational

### Separate retrieval from ingestion

Searching Hister is cheap.

Importing history into your own wiki, memory store, or research corpus should be much more selective.

## Example Exclusion/Downranking Policy

This is a good starting policy for a knowledge-oriented assistant:

- exclude personal email
- exclude calendar and scheduling apps
- exclude banking and private portals
- exclude generic dashboards
- downrank homepages and app roots
- prioritize docs/article/research/repo pages
- only ingest pages with meaningful extracted text

## Example Use Cases

Hister is especially useful for:

- "find that doc page I read last week"
- "search my browser history for prior reading on this topic"
- "turn recently visited technical sources into a wiki ingest set"
- "recover useful references from exploratory browsing"
- "resurface high-value material from past sessions"

## TAW-Specific Commands

If you want to mirror TAW’s current ergonomics in another project, these are the useful verbs:

- search
- inspect saved result
- open saved result
- add URL
- reindex
- ingest selected results into another knowledge system

TAW’s command layer is here:

- [src/commands/hister.ts](/home/loydmilligan/Projects/taw/src/commands/hister.ts)
- [src/commands/wiki.ts](/home/loydmilligan/Projects/taw/src/commands/wiki.ts)

## Bottom Line

Hister is best thought of as:

- a local memory of the web pages you actually visited
- a strong candidate source for research retrieval
- a poor raw source if you do not layer filtering and policy on top

For another coding project, the best default architecture is:

1. CLI search for retrieval
2. HTTP API for add/reindex/admin actions
3. indexed-text-first retrieval when possible
4. aggressive filtering for sensitive, ephemeral, and low-information pages
5. selective downstream ingestion into your own knowledge system

That is the most practical way to use browser history as knowledge infrastructure instead of as a noisy dump of everything you clicked.
