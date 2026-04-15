# Testing Patterns

**Analysis Date:** 2026-04-14

## Test Framework

**Runner:**
- Vitest v3.2.4
- Config: `vitest.config.ts`
- Node environment: `environment: 'node'`

**Assertion Library:**
- Vitest built-in: `expect()` (compatible with Jest API)

**Run Commands:**
```bash
pnpm test                           # Run all tests
pnpm test <filename>                # Run single test file
vitest run --passWithNoTests        # CI mode (in package.json scripts)
vitest --watch                      # Watch mode (manual)
vitest --coverage                   # Coverage report
```

## Test File Organization

**Location:**
- All tests in `/home/loydmilligan/Projects/taw/tests/` directory (not co-located with source)
- Tests are separate from source code in this codebase

**Naming:**
- Pattern: `{feature-name}.test.ts`
- Examples: `command-parser.test.ts`, `session-manager.test.ts`, `config-loader.test.ts`

**Structure:**
```
tests/
├── command-parser.test.ts
├── session-manager.test.ts
├── config-loader.test.ts
├── artifact-writer.test.ts
├── research-command.test.ts
└── ... (20+ test files)
```

## Test Structure

**Suite Organization:**
```typescript
import { describe, expect, it } from 'vitest';
import { readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createSession } from '../src/core/sessions/session-manager.js';

describe('session manager', () => {
  let tempDir = '';

  afterEach(async () => {
    // Cleanup after each test
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('creates a general session under user config dir', async () => {
    // Arrange
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-general-'));
    const cwd = path.join(tempDir, 'workspace');

    // Act
    const session = await createSession({ cwd });

    // Assert
    expect(session.storageMode).toBe('general');
    expect(session.sessionDir).toContain('.config/taw/sessions');
  });
});
```

**Patterns:**
- Use `describe()` to group related tests by feature/module
- Use `it()` for individual test cases with clear, descriptive names
- Use `afterEach()` for per-test cleanup (not `beforeEach` unless needed for setup)
- Arrange-Act-Assert pattern: clear sections within test body

## Mocking

**Framework:** None explicitly configured; tests use real I/O

**Patterns:**
- Real filesystem operations via Node.js `fs/promises` API
- Real environment variables via `process.env` (modify in tests, restore after)
- Import sources being tested directly, no mocking layers

**Example with environment manipulation from `config-loader.test.ts`:**
```typescript
const originalHome = process.env.HOME;

describe('config loader', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('loads global config and lets project config override', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-config-'));
    process.env.HOME = tempDir;  // Mock HOME temporarily
    
    const config = await loadConfig(cwd);
    
    expect(config.providerConfig.provider).toBe('openai');
  });
});
```

**What to Mock:**
- Environment variables (HOME, API keys, DEBUG flags)
- Filesystem paths via mkdtemp + process.env manipulation
- Nothing else; let real I/O happen within isolated temp directories

**What NOT to Mock:**
- Actual filesystem operations (use real temp dirs)
- Provider APIs (not tested in this suite; integration tests manual)
- Time/dates (tests don't manipulate clock)

## Fixtures and Factories

**Test Data:**
- Created inline in tests or via factory functions
- Example from `session-manager.test.ts`:
  ```typescript
  const session = await createSession({ cwd });
  expect(session.storageMode).toBe('general');
  ```

**Location:**
- No separate fixtures directory; data created per-test
- Factories are real source code (e.g., `createSession()`, `createArtifact()`)

**Example from `config-loader.test.ts`:**
```typescript
await writeFile(
  path.join(tempDir, '.config', 'taw', 'config.json'),
  JSON.stringify({
    defaultProvider: 'openrouter',
    defaultModel: 'openrouter/auto',
    providers: { openrouter: { apiKey: 'router-key' }, ... }
  })
);
```

## Coverage

**Requirements:** Not enforced (no `.nyc_` or coverage config)

**View Coverage:**
```bash
vitest --coverage                   # Generate coverage report
```

No minimum coverage gate; tests focus on critical paths (session management, command parsing, config loading, artifact writing).

## Test Types

**Unit Tests:**
- Scope: Single module or function in isolation
- Approach: Test boundary conditions, error cases, and happy paths
- Example: `command-parser.test.ts` tests `parseCommand()` with valid/invalid inputs
- Environment: Real filesystem (via isolated temp directories), real Node.js APIs

**Integration Tests:**
- Scope: Multiple modules working together (session manager + config loader + artifact writer)
- Approach: End-to-end flow from config load to session creation to artifact writing
- Example: `artifact-writer.test.ts` creates session, then writes artifact, then verifies metadata updated
- Environment: Real temp filesystem to verify actual file I/O behavior

**E2E Tests:**
- Framework: Manual testing via QA checklist (see `docs/testing-strategy.md`)
- Not automated; skipped in test suite
- Focus: Full terminal UI flows, streaming behavior, user interactions
- Example: "Start session → brainstorm phase 1 → map it → phase 2 → finalize" via manual user input

## Common Patterns

**Async Testing:**
```typescript
it('creates a session asynchronously', async () => {
  const session = await createSession({ cwd });
  expect(session.storageMode).toBe('general');
});
```

All async functions properly awaited; Vitest waits for promise resolution automatically.

**Error Testing:**
```typescript
// From command-parser.test.ts
it('throws a clear error for missing command names', () => {
  expect(() => parseCommand('/')).toThrow('Command name is required.');
});
```

Use `expect(() => func()).toThrow()` for sync error cases; use `expect(async () => await func()).rejects.toThrow()` for async.

**File I/O Verification:**
```typescript
// From artifact-writer.test.ts
const artifact = await createArtifact(session, {
  type: 'project-brief',
  title: 'project brief',
  content: '# Project Brief\n'
});

expect(artifact.path).toContain(session.artifactsDir);
expect(await readFile(artifact.path, 'utf8')).toContain('# Project Brief');
```

Read files back to verify actual filesystem state, don't mock writes.

**JSON Parsing in Tests:**
```typescript
// From session-manager.test.ts
const sessionJson = JSON.parse(await readFile(session.sessionJsonPath, 'utf8'));
expect(sessionJson.cwdAtLaunch).toBe(cwd);
```

Parse JSON files to verify structured data integrity.

## Test Examples by Feature

### Session Management (`session-manager.test.ts`)
- Create general session: temp directory, no `.ai/config.json` → storage at `~/.config/taw/sessions/`
- Create project session: `.ai/config.json` exists → storage at `.ai/sessions/`
- Metadata validation via Zod schema

### Command Parsing (`command-parser.test.ts`)
- Detect slash commands: `/help` → true, `hello` → false
- Parse arguments with quotes: `/attach-dir "./docs folder"` → args: `['./docs folder']`
- Throw clear errors: `/` (no name) → "Command name is required."

### Config Loading (`config-loader.test.ts`)
- Global config at `~/.config/taw/config.json`
- Project config at `.ai/config.json` overrides global (provider, model)
- API keys loaded from env file `.config/taw/.env` or process.env vars

### Artifact Writing (`artifact-writer.test.ts`)
- Write markdown file to session `artifacts/` directory
- Timestamp + slug naming: `2026-04-14-12-34-56-project-brief.md`
- Metadata appended to session.json artifact array

### Command Execution (`research-command.test.ts`, `finalize-command.test.ts`)
- Command receives `CommandContext` (session, transcript, config, etc.)
- Command returns `CommandResult` (entries, updated state, queued inputs)
- Verify transcript entries added with correct kind/body

## Running Tests in CI

```bash
# From package.json
pnpm test                           # runs: vitest run --passWithNoTests
```

The `--passWithNoTests` flag allows the test suite to pass even if no tests are found (useful when tests are being scaffolded).

## Test Isolation

**Environment:**
- Each test gets fresh `process.env.HOME` pointing to mkdtemp directory
- Cleanup in `afterEach()` removes temp directories
- No global state pollution between tests

**Filesystem:**
- Tests create isolated temp directories under `os.tmpdir()`
- Pattern: `mkdtemp(path.join(os.tmpdir(), 'taw-{feature}-'))`
- Cleanup removes temp directory recursively

**Example isolation from `config-loader.test.ts`:**
```typescript
const originalHome = process.env.HOME;

afterEach(async () => {
  process.env.HOME = originalHome;  // Restore global state
  if (tempDir) {
    await rm(tempDir, { recursive: true, force: true });
  }
});
```

---

*Testing analysis: 2026-04-14*
