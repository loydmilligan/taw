# Coding Conventions

**Analysis Date:** 2026-04-14

## Naming Patterns

**Files:**
- kebab-case for all files: `session-manager.ts`, `command-parser.ts`, `brainstorm.ts`
- Component files use `.tsx` extension: `App.tsx`, `Header.jsx`, `InputBar.tsx`
- Test files use `.test.ts` suffix: `command-parser.test.ts`, `session-manager.test.ts`
- Command files: one file per slash command with name matching command: `/brainstorm` → `brainstorm.ts`, `/research` → `research.ts`

**Functions:**
- camelCase for all functions: `createSession()`, `parseCommand()`, `getCommandDefinition()`, `isSlashCommand()`
- Async functions explicitly return `Promise<T>`: `async function executeCommand(): Promise<CommandResult>`
- Helper/utility functions prefixed with action verb: `buildInitialNotes()`, `updateSessionMetadata()`, `extractMapAnchor()`
- Private/internal functions prefixed with underscore: `_buildPrompt()` (rare; prefer exporting when possible)

**Variables:**
- camelCase for all variables and parameters: `const appState`, `let tempDir`, `const session`
- Boolean variables often prefixed with `is`, `has`, `should`: `isSlashCommand`, `hasLocalTools`, `shouldExit`
- React component state variables follow pattern: `[value, setValue]` with descriptive names: `[inputState, setInputState]`, `[selectedSuggestion, setSelectedSuggestion]`
- Constants in ALL_CAPS when truly immutable and top-level: `const PHASE1_ENTRY = [...]` in `src/commands/brainstorm.ts`, `const WIKI_WRITE_MIN_TOKENS = 4096` in `src/core/chat/engine.ts`

**Types:**
- PascalCase for all types and interfaces: `CommandContext`, `CommandResult`, `TranscriptEntry`, `SessionRecord`
- Prefix types with descriptive noun: `AppState`, `InputState`, `MapPickerState`
- Union types spelled out: `kind: 'system' | 'assistant' | 'user' | 'notice' | 'error'` (not abbreviations)
- Optional properties marked with `?`: `title?: string`, `draftState?: 'pending' | 'complete' | 'interrupted' | 'failed'`

## Code Style

**Formatting:**
- Prettier with configuration in `.prettierrc.json`:
  - Semicolons: required (semi: true)
  - Quotes: single quotes (singleQuote: true)
  - Trailing commas: none (trailingComma: "none")
  - Line width: default 80 characters
- All code is auto-formatted on save via Prettier

**Linting:**
- ESLint enforces TypeScript best practices
- Config in `eslint.config.js` with flat config format (ESLint v9+)
- Key rule: `@typescript-eslint/consistent-type-imports: error` — always use `import type` for types/interfaces
- Parser: `@typescript-eslint/parser` targeting TypeScript strict mode
- Extends: `@eslint/js` recommended + `@typescript-eslint` recommended + `prettier`

**Example of type imports (enforced):**
```typescript
import type { CommandContext, CommandResult } from './types.js';
import { parseCommand } from './parser.js';
```

NOT:
```typescript
import { CommandContext, CommandResult, parseCommand } from './types.js';
```

## Import Organization

**Order:**
1. Built-in Node.js modules first: `import { readFile, writeFile } from 'node:fs/promises';`, `import path from 'node:path';`, `import os from 'node:os';`
2. Third-party packages: `import React from 'react';`, `import { Box } from 'ink';`, `import { z } from 'zod';`
3. Type imports from third-party: `import type { ReactNode } from 'react';`
4. Relative imports from project (with explicit paths): `import { createSession } from '../core/sessions/session-manager.js';`
5. Type imports from project: `import type { SessionRecord } from '../../types/session.js';`

**Path style:**
- Always use explicit relative paths with `../` and `.js` extensions (ES modules): `from './types.js'`, `from '../sessions/session-manager.js'`
- Never use path aliases or `@` imports in current codebase
- Organize imports alphabetically within each group

**Example from `src/commands/brainstorm.ts`:**
```typescript
import { updateSessionMetadata } from '../core/sessions/session-manager.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';
import type { TranscriptEntry } from '../types/app.js';
```

## Error Handling

**Patterns:**
- Use explicit `throw new Error(message)` for validation failures: `throw new Error('Command name is required.')` in `parser.ts`
- Errors are caught and logged via `logError(scope, error)` from `src/services/logging/logger.ts`
- Each command handler wraps user-facing errors with clear messages
- Type `unknown` is normalized to string when logging: `error instanceof Error ? error.message : String(error)`
- Secrets redacted from logs: `redactSecrets()` function matches `sk-*` patterns

**Error logging pattern:**
```typescript
import { logError } from '../services/logging/logger.js';

try {
  await someAsyncOperation();
} catch (err) {
  await logError('command-name', err);
  // Return error transcript entry or handle gracefully
}
```

**No throwing from command handlers** — return error entries in `CommandResult` instead:
```typescript
entries: [
  {
    id: createId('error'),
    kind: 'error',
    body: 'Descriptive error message'
  }
]
```

## Logging

**Framework:** Console + file logging via `src/services/logging/logger.ts`

**Patterns:**
- Use `logError(scope: string, error: unknown): Promise<void>` for exceptions
- Use `logDebug(scope: string, message: string): Promise<void>` for debug info (only when `process.env.TAW_DEBUG === '1'`)
- Scope parameter identifies the module: `logError('session-manager', error)`, `logDebug('command-parser', 'parsing /help')`
- Logs written to `~/.config/taw/logs/{YYYY-MM-DD}.log` (one file per day)
- Log format: `{ISO_TIMESTAMP} {LEVEL} [scope] {message}`
- Secrets automatically redacted (API keys matching `sk-*` replaced with `[REDACTED]`)

**Example:**
```typescript
try {
  await createSession({ cwd });
} catch (error) {
  await logError('bootstrap', error);
  process.exit(1);
}
```

## Comments

**When to Comment:**
- Comment non-obvious logic and algorithm reasoning
- Comment workarounds and known limitations (example from `brainstorm.ts`):
  ```typescript
  /**
   * Extracts the current Phase 2 map state from the transcript to use as a
   * context anchor when the user navigates back to Phase 1. Returns null if
   * no meaningful map state is found.
   */
  function extractMapAnchor(transcript: TranscriptEntry[]): string | null {
  ```
- Comment complex regex patterns: `const headingMatch = withoutFooter.match(/\n(##\s)/);`
- Document why a limit exists, not what it does: `// Wiki write modes embed page content inside tool JSON; default 1200-token limit truncates mid-call.`

**JSDoc/TSDoc:**
- Use JSDoc comments for public functions and exports
- Include `@param` and `@returns` for complex signatures
- Example from `src/commands/brainstorm.ts`:
  ```typescript
  /**
   * Extracts the current Phase 2 map state...
   * @returns The map content or null if not found
   */
  ```
- Avoid over-documenting obvious functions: no need to comment `function getName(): string`

## Function Design

**Size:** Keep functions focused and under 100 lines where possible. Larger functions break into helpers.

**Parameters:**
- Use object parameters for functions with 3+ parameters: `createSession(options: CreateSessionOptions)` not `createSession(cwd, provider, model)`
- Optional parameters use `?` in interface: `export interface CreateSessionOptions { cwd: string; provider?: string; model?: string; }`
- Async functions explicitly return `Promise<T>`

**Return Values:**
- Commands return structured `CommandResult` object (never void, never plain values)
- Async operations return `Promise<T>` explicitly typed
- Functions handling optional data return `T | null` when absence is meaningful (example: `extractMapAnchor()` returns `string | null`)
- Array functions default to empty array rather than null: `return [];` not `return null;`

**Example from `src/core/artifacts/writer.ts`:**
```typescript
export async function createArtifact(
  session: SessionRecord,
  input: CreateArtifactInput
): Promise<SessionArtifact> {
  // ... implementation
}

export async function createModeArtifact(
  session: SessionRecord,
  mode: string,
  content: string
): Promise<SessionArtifact | null> {
  // ... can return null if mode has no artifact definition
}
```

## Module Design

**Exports:**
- Named exports preferred: `export function createSession()` not `export default createSession`
- Export interfaces alongside functions: `export interface SessionRecord { ... }`, `export function loadSession() { ... }`
- Group related exports in same file (session manager exports both `SessionRecord` type and all session functions)

**Barrel Files:**
- Used sparingly for provider adapters: `src/core/providers/index.ts` exports `getProviderAdapter()`
- Avoid re-exporting everything from a directory — be explicit about what's public API

**Module organization:**
- Command files self-contained: all logic in one file or delegated to core/services
- `src/commands/types.ts` centralizes shared command types
- `src/types/` contains global types: `app.ts`, `session.ts`, `provider.ts`
- `src/services/` contains reusable infrastructure: filesystem, config, logging, wiki, etc.
- `src/core/` contains business logic: sessions, chat, artifacts, modes, prompts, etc.

## Type Safety

**Settings (tsconfig.json):**
- `strict: true` — enables all strict type checks
- `target: ES2022` — modern JavaScript features available
- `jsx: react-jsx` — React 17+ automatic JSX transform
- `@typescript-eslint/consistent-type-imports: error` — enforce `import type` for types

**Zod validation:**
- Config schemas use Zod for runtime validation: `src/services/config/schema.ts`
- All parsed configs validated before use: `sessionMetadataSchema.parse(metadata)`
- Zod infers TypeScript types from schemas: `type GlobalConfig = z.infer<typeof globalConfigSchema>`

---

*Convention analysis: 2026-04-14*
