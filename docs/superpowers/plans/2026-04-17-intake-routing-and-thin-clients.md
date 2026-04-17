# Intake Routing And Thin Clients Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared intake router for extension and PWA that supports adding to existing map/topic, creating a new map shell, and starting one-off research that auto-ingests to a chosen wiki destination.

**Architecture:** Keep the TUI and bridge server authoritative. Add a small shared intake domain for route types and destination payloads, extend the bridge with explicit intake endpoints, then migrate the extension popup and `/app` mobile UI onto the same routing model. Do the bridge/PWA refactor while changing behavior so the mobile client logic is no longer trapped in one giant server file.

**Tech Stack:** TypeScript, Node.js HTTP server, Ink/TUI state, Zod, Vitest, Chromium extension JS, bridge-hosted mobile HTML/JS

---

## File Structure

### Shared intake domain

- Create: `src/intake/schema.ts`
  - Zod schemas and TypeScript types for intake route choice, destination choice, map stub creation, and one-off research submission.
- Create: `src/intake/types.ts`
  - Narrow exported types used by bridge routes and UI renderers if `schema.ts` becomes too crowded.

### Bridge server

- Modify: `src/bridge/server.ts`
  - Wire new API routes, delegate HTML rendering to extracted helpers, and remove inline route-specific UI logic from the main file.
- Create: `src/bridge/app-shell.ts`
  - Mobile app HTML shell renderer for `/app`.
- Create: `src/bridge/app-client.ts`
  - Inline client script string builder or static script source for `/app` interactions.
- Create: `src/bridge/intake-routes.ts`
  - Route handlers for intake destinations, new map creation, and one-off research submission.

### TAW command / state integration

- Modify: `src/commands/research.ts`
  - Add or expose a path that supports one-off research auto-ingest behavior.
- Modify: `src/services/wiki/manager.ts`
  - Reuse or extend topic resolution and creation helpers for one-off research destination handling.
- Modify: `src/types/app.ts`
  - Add any small bridge-visible app state fields needed for active destination reporting.
- Modify: `src/cli/bootstrap.ts`
  - Initialize any new bridge-visible state.

### Browser extension

- Modify: `browser-extension/popup.html`
  - Replace old research/wiki split UI with explicit intake router.
- Modify: `browser-extension/popup.js`
  - Submit new intake requests and destination selections.
- Modify: `browser-extension/popup.css`
  - Style the explicit intake router and shorter forms.
- Modify: `browser-extension/README.md`
  - Document the new three-path behavior.

### Mobile PWA

- Modify: `src/bridge/server.ts`
  - Serve extracted app assets and connect API handlers.
- Create: `src/bridge/app-ui-template.ts`
  - Shared HTML fragment/template for the intake-first mobile UI if needed.
- Create: `src/bridge/app-state-view.ts`
  - Normalize bridge state payload for app rendering if the data logic needs separation.

### Tests

- Modify: `tests/bridge-server.test.ts`
  - Add API coverage for intake router, destination selection, new map creation, and one-off research auto-ingest.
- Create: `tests/intake-schema.test.ts`
  - Validate route payload parsing and failure cases.
- Modify: `tests/research-command.test.ts`
  - Cover the one-off research auto-ingest path.
- Modify: `tests/wiki-command.test.ts`
  - Add any topic-creation or destination resolution cases that become shared dependencies.

### Docs

- Modify: `README.md`
  - Update product model and capture-surface explanation.
- Modify: `docs/command-hierarchy.md`
  - Reflect the new intake model and preserve one-off research as a first-class secondary path.

## Task 1: Add Shared Intake Schemas

**Files:**
- Create: `src/intake/schema.ts`
- Test: `tests/intake-schema.test.ts`

- [ ] **Step 1: Write the failing schema tests**

```ts
import { describe, expect, it } from 'vitest';
import {
  intakeRouteSchema,
  existingDestinationSchema,
  createMapRequestSchema,
  oneOffResearchRequestSchema
} from '../src/intake/schema.js';

describe('intake schemas', () => {
  it('accepts add-to-existing route payload', () => {
    const parsed = intakeRouteSchema.parse({
      route: 'existing',
      destination: { kind: 'map', id: 'map-123' },
      note: 'Attach this article'
    });

    expect(parsed.route).toBe('existing');
    expect(parsed.destination.kind).toBe('map');
  });

  it('accepts create-map payload', () => {
    const parsed = createMapRequestSchema.parse({
      title: 'Claude Code hooks',
      mapType: 'learning',
      note: 'Seeded from extension capture'
    });

    expect(parsed.mapType).toBe('learning');
  });

  it('rejects one-off research payload without destination mode', () => {
    expect(() =>
      oneOffResearchRequestSchema.parse({
        topic: 'Claude Code hooks',
        source: { url: 'https://example.com/post' }
      })
    ).toThrow(/destination/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/intake-schema.test.ts`
Expected: FAIL with `Cannot find module '../src/intake/schema.js'`

- [ ] **Step 3: Write minimal schema implementation**

```ts
import { z } from 'zod';

export const destinationKindSchema = z.enum(['map', 'topic']);

export const existingDestinationSchema = z.object({
  kind: destinationKindSchema,
  id: z.string().min(1),
  label: z.string().min(1).optional()
});

export const intakeRouteSchema = z.object({
  route: z.enum(['existing', 'new-map', 'one-off-research']),
  destination: existingDestinationSchema.optional(),
  note: z.string().trim().max(4000).optional()
});

export const createMapRequestSchema = z.object({
  title: z.string().min(1),
  mapType: z.enum(['problem', 'idea', 'learning']),
  note: z.string().trim().max(4000).optional()
});

export const oneOffResearchRequestSchema = z.object({
  topic: z.string().min(1),
  source: z.object({
    url: z.string().url().optional(),
    text: z.string().min(1).optional()
  }),
  destinationMode: z.enum(['new-topic', 'existing-topic']),
  existingTopic: z.string().min(1).optional(),
  newTopic: z.string().min(1).optional(),
  note: z.string().trim().max(4000).optional()
});
```

- [ ] **Step 4: Run test to verify it passes**

Run: `corepack pnpm test -- tests/intake-schema.test.ts`
Expected: PASS with `1 passed file`

- [ ] **Step 5: Commit**

```bash
git add src/intake/schema.ts tests/intake-schema.test.ts
git commit -m "feat: add intake routing schemas"
```

## Task 2: Expose Destination Selection From Bridge State

**Files:**
- Modify: `src/bridge/server.ts`
- Modify: `src/types/app.ts`
- Modify: `src/cli/bootstrap.ts`
- Test: `tests/bridge-server.test.ts`

- [ ] **Step 1: Write the failing bridge state test**

```ts
it('returns active and available destinations for intake clients', async () => {
  const response = await request(server)
    .get('/app/api/state')
    .set('cookie', [sessionCookie]);

  expect(response.statusCode).toBe(200);
  expect(response.body.destinations).toEqual(
    expect.objectContaining({
      active: expect.anything(),
      available: expect.any(Array)
    })
  );
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/bridge-server.test.ts`
Expected: FAIL because `destinations` is missing from `/app/api/state`

- [ ] **Step 3: Add destination fields to app state and bridge response**

```ts
export interface IntakeDestinationSummary {
  id: string;
  kind: 'map' | 'topic';
  label: string;
  isActive: boolean;
}

export interface AppState {
  // existing fields...
  activeDestination: IntakeDestinationSummary | null;
}
```

```ts
writeJson(response, 200, {
  ok: true,
  topics: await listWikiTopics(),
  destinations: {
    active: appState.activeDestination,
    available: await listAvailableDestinations(appState)
  }
});
```

- [ ] **Step 4: Run the bridge test to verify it passes**

Run: `corepack pnpm test -- tests/bridge-server.test.ts`
Expected: PASS with the new `destinations` assertion

- [ ] **Step 5: Commit**

```bash
git add src/types/app.ts src/cli/bootstrap.ts src/bridge/server.ts tests/bridge-server.test.ts
git commit -m "feat: expose intake destinations in bridge state"
```

## Task 3: Add Bridge Intake Endpoints

**Files:**
- Create: `src/bridge/intake-routes.ts`
- Modify: `src/bridge/server.ts`
- Test: `tests/bridge-server.test.ts`

- [ ] **Step 1: Write failing API tests for the three routes**

```ts
it('creates a new map shell from app intake', async () => {
  const response = await request(server)
    .post('/app/api/intake/new-map')
    .set('cookie', [sessionCookie])
    .send({
      title: 'TAW routing cleanup',
      mapType: 'problem',
      note: 'Seed from mobile capture'
    });

  expect(response.statusCode).toBe(200);
  expect(response.body.ok).toBe(true);
  expect(response.body.map.title).toBe('TAW routing cleanup');
});

it('submits add-to-existing intake', async () => {
  const response = await request(server)
    .post('/app/api/intake/existing')
    .set('cookie', [sessionCookie])
    .send({
      destination: { kind: 'topic', id: 'vibecoding' },
      capturedUrl: 'https://example.com/post',
      note: 'Useful context'
    });

  expect(response.statusCode).toBe(200);
  expect(response.body.ok).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/bridge-server.test.ts`
Expected: FAIL with 404 or missing handler errors

- [ ] **Step 3: Add extracted route handlers**

```ts
export async function handleCreateMapIntake(request: IncomingMessage) {
  const body = createMapRequestSchema.parse(await readJson(request));
  return {
    ok: true,
    map: await createIntakeMapShell(body)
  };
}

export async function handleExistingDestinationIntake(request: IncomingMessage) {
  const body = existingIntakeRequestSchema.parse(await readJson(request));
  await appendCapturedIntake(body);
  return { ok: true };
}
```

```ts
if (request.method === 'POST' && parsedUrl?.pathname === '/app/api/intake/new-map') {
  writeJson(response, 200, await handleCreateMapIntake(request));
  return;
}
```

- [ ] **Step 4: Run the bridge test to verify the endpoints pass**

Run: `corepack pnpm test -- tests/bridge-server.test.ts`
Expected: PASS for the new route coverage

- [ ] **Step 5: Commit**

```bash
git add src/bridge/intake-routes.ts src/bridge/server.ts tests/bridge-server.test.ts
git commit -m "feat: add bridge intake endpoints"
```

## Task 4: Implement One-Off Research Auto-Ingest

**Files:**
- Modify: `src/commands/research.ts`
- Modify: `src/services/wiki/manager.ts`
- Modify: `src/bridge/intake-routes.ts`
- Test: `tests/research-command.test.ts`
- Test: `tests/bridge-server.test.ts`

- [ ] **Step 1: Write the failing research auto-ingest test**

```ts
it('auto-ingests one-off research into an existing wiki topic', async () => {
  const result = await runOneOffResearch({
    topic: 'Claude Code hooks',
    destinationMode: 'existing-topic',
    existingTopic: 'claude-code'
  });

  expect(result.finalized).toBe(true);
  expect(result.ingestedTopic).toBe('claude-code');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/research-command.test.ts`
Expected: FAIL because no one-off research auto-ingest path exists

- [ ] **Step 3: Add minimal one-off research execution path**

```ts
export async function runOneOffResearch(input: OneOffResearchRequest) {
  const artifact = await createModeArtifact(session, 'Research Tech', finalBody);
  const topic = input.destinationMode === 'existing-topic'
    ? input.existingTopic!
    : input.newTopic!;

  await writeWikiPage(topic, buildOneOffResearchFilename(input.topic), finalBody, {
    overwrite: false
  });

  return {
    finalized: true,
    ingestedTopic: topic,
    artifactPath: artifact?.path ?? null
  };
}
```

- [ ] **Step 4: Run research and bridge tests to verify they pass**

Run: `corepack pnpm test -- tests/research-command.test.ts tests/bridge-server.test.ts`
Expected: PASS with one-off research ingestion covered for new and existing topics

- [ ] **Step 5: Commit**

```bash
git add src/commands/research.ts src/services/wiki/manager.ts src/bridge/intake-routes.ts tests/research-command.test.ts tests/bridge-server.test.ts
git commit -m "feat: auto-ingest one-off research"
```

## Task 5: Migrate Browser Extension To Explicit Intake Routing

**Files:**
- Modify: `browser-extension/popup.html`
- Modify: `browser-extension/popup.js`
- Modify: `browser-extension/popup.css`
- Modify: `browser-extension/README.md`

- [ ] **Step 1: Add the router markup in the popup**

```html
<section class="router">
  <label for="intakeRoute">Send To</label>
  <select id="intakeRoute">
    <option value="existing">Add to existing map/topic</option>
    <option value="new-map">Create new map</option>
    <option value="one-off-research">One-off research</option>
  </select>
</section>
```

- [ ] **Step 2: Run lint-style smoke check in the browser extension locally**

Run: `corepack pnpm lint browser-extension/popup.js`
Expected: either PASS or the known browser-global issues only; no new syntax errors

- [ ] **Step 3: Replace the old research/wiki split submit logic**

```js
async function submitIntake() {
  const route = intakeRouteInput.value;

  if (route === 'existing') {
    return submitExistingDestination();
  }

  if (route === 'new-map') {
    return submitNewMap();
  }

  return submitOneOffResearch();
}
```

- [ ] **Step 4: Update the extension README**

```md
## What the extension can do

- add captured browser content to any existing map or wiki topic
- create a new map shell with title, type, and optional note
- start one-off research that auto-ingests to a new or existing wiki topic
- keep the TUI as the main place where captured work is developed
```

- [ ] **Step 5: Commit**

```bash
git add browser-extension/popup.html browser-extension/popup.js browser-extension/popup.css browser-extension/README.md
git commit -m "feat: migrate extension to intake router"
```

## Task 6: Extract Mobile App UI From Bridge Server

**Files:**
- Create: `src/bridge/app-shell.ts`
- Create: `src/bridge/app-client.ts`
- Modify: `src/bridge/server.ts`
- Test: `tests/bridge-server.test.ts`

- [ ] **Step 1: Write the failing bridge render test**

```ts
it('serves the app shell from the extracted renderer', async () => {
  const response = await request(server).get('/app').set('cookie', [sessionCookie]);
  expect(response.statusCode).toBe(200);
  expect(response.text).toContain('data-intake-router');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/bridge-server.test.ts`
Expected: FAIL because the extracted renderer does not exist yet

- [ ] **Step 3: Move the app shell into extracted modules**

```ts
export function renderAppShell({ hasSession }: { hasSession: boolean }) {
  return `
    <main data-intake-router="true">
      <section id="panel-capture">...</section>
    </main>
    <script>${renderAppClientScript()}</script>
  `;
}
```

- [ ] **Step 4: Run the bridge test to verify it passes**

Run: `corepack pnpm test -- tests/bridge-server.test.ts`
Expected: PASS and no route regressions for `/app`

- [ ] **Step 5: Commit**

```bash
git add src/bridge/app-shell.ts src/bridge/app-client.ts src/bridge/server.ts tests/bridge-server.test.ts
git commit -m "refactor: extract mobile app shell from bridge server"
```

## Task 7: Migrate Mobile PWA To Explicit Intake Routing

**Files:**
- Modify: `src/bridge/app-shell.ts`
- Modify: `src/bridge/app-client.ts`
- Modify: `src/bridge/server.ts`
- Test: `tests/bridge-server.test.ts`

- [ ] **Step 1: Write the failing PWA behavior test**

```ts
it('shows the three intake routes in the app shell', async () => {
  const response = await request(server).get('/app').set('cookie', [sessionCookie]);
  expect(response.text).toContain('Add to existing map/topic');
  expect(response.text).toContain('Create new map');
  expect(response.text).toContain('One-off research');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `corepack pnpm test -- tests/bridge-server.test.ts`
Expected: FAIL because the current app still centers the old capture/research/topic layout

- [ ] **Step 3: Update the app shell and client script**

```ts
const routeTabs = [
  { id: 'existing', label: 'Add to existing map/topic' },
  { id: 'new-map', label: 'Create new map' },
  { id: 'one-off-research', label: 'One-off research' }
];
```

```ts
async function submitCurrentRoute() {
  if (state.route === 'existing') return postJson('/app/api/intake/existing', buildExistingPayload());
  if (state.route === 'new-map') return postJson('/app/api/intake/new-map', buildNewMapPayload());
  return postJson('/app/api/intake/one-off-research', buildResearchPayload());
}
```

- [ ] **Step 4: Run the bridge test to verify the updated app passes**

Run: `corepack pnpm test -- tests/bridge-server.test.ts`
Expected: PASS with the new intake-first app assertions

- [ ] **Step 5: Commit**

```bash
git add src/bridge/app-shell.ts src/bridge/app-client.ts src/bridge/server.ts tests/bridge-server.test.ts
git commit -m "feat: migrate mobile app to intake router"
```

## Task 8: Update Docs And Repo Hygiene Around The New Model

**Files:**
- Modify: `README.md`
- Modify: `docs/command-hierarchy.md`
- Modify: `eslint.config.js`

- [ ] **Step 1: Write the failing lint/doc expectation**

```js
export default [
  {
    ignores: ['docs/node-ttstt/**', '.superpowers/**']
  }
];
```

```md
TAW uses two capture-aware workflows:

- map-centered deep work
- one-off research with auto-ingest
```

- [ ] **Step 2: Run lint and targeted doc review to verify the gap**

Run: `corepack pnpm lint`
Expected: FAIL on `docs/node-ttstt/**` and other known scope issues before cleanup

- [ ] **Step 3: Apply the doc and lint-scope updates**

```md
The extension and PWA are thin intake clients for:

- add to existing map/topic
- create new map
- one-off research

The TUI remains the main workspace.
```

```js
{
  ignores: ['docs/node-ttstt/**', '.superpowers/**']
}
```

- [ ] **Step 4: Run verification**

Run: `corepack pnpm test -- tests/intake-schema.test.ts tests/bridge-server.test.ts tests/research-command.test.ts`
Expected: PASS

Run: `corepack pnpm typecheck`
Expected: PASS

Run: `corepack pnpm lint`
Expected: PASS, or only known pre-existing non-scope issues that were intentionally deferred and recorded in the task notes

- [ ] **Step 5: Commit**

```bash
git add README.md docs/command-hierarchy.md eslint.config.js
git commit -m "docs: align capture surfaces with intake router"
```

## Spec Coverage Check

- Three explicit intake paths: covered by Tasks 1, 3, 5, and 7.
- Add to existing map/topic with any existing destination: covered by Tasks 2 and 3.
- Create new map with title + type + optional note: covered by Tasks 1 and 3, surfaced in Tasks 5 and 7.
- One-off research with new or existing wiki topic and auto-ingest: covered by Task 4, surfaced in Tasks 5 and 7.
- TUI as primary workspace, thin clients only: reflected in Tasks 5, 7, and 8.
- Bridge/PWA cleanup and extraction: covered by Task 6.
- Docs alignment: covered by Task 8.

## Placeholder Scan

- No `TODO`, `TBD`, or “implement later” placeholders remain.
- Each task includes exact files, commands, and concrete code snippets.
- Cross-task names are consistent: `existing`, `new-map`, `one-off-research`, `destinationMode`, `activeDestination`.

## Type Consistency Check

- Route names stay consistent across schema, bridge handlers, extension, and PWA.
- Destination shape remains `kind + id + label?`.
- Map creation fields remain `title + mapType + note`.
- One-off research fields remain `topic + source + destinationMode + existingTopic/newTopic + note`.
