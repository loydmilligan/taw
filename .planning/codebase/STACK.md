# Technology Stack

**Analysis Date:** 2026-04-14

## Languages

**Primary:**
- TypeScript 5.9.3 - Core application, all source files in `src/`, CLI and TUI components

**Secondary:**
- JavaScript - ESLint config, optional browser extension scaffolding

## Runtime

**Environment:**
- Node.js 20+ (specified in `package.json` engines field)

**Package Manager:**
- pnpm 10.33.0 (enforced via `packageManager` field)
- Lockfile: `pnpm-lock.yaml` (present, committed)

## Frameworks

**Core TUI:**
- Ink 6.8.0 - React for terminal UI rendering
- React 19.2.0 - Component model for TUI and chat layout

**Validation & Schema:**
- Zod 4.1.12 - Runtime type validation for config files, API responses, schemas

**Testing:**
- Vitest 3.2.4 - Unit and integration test framework (config: `vitest.config.ts`)
- Test environment: Node.js

**Build/Dev:**
- TypeScript Compiler (tsc) - Compiles `src/` to `dist/`
- tsx 4.20.6 - TypeScript execution for dev scripts (`pnpm dev`, `bridge:dev`)
- ESLint 9.37.0 + TypeScript plugin 8.46.1 - Linting
- Prettier 3.6.2 - Code formatting

## Key Dependencies

**Critical:**
- `@anthropic-ai/sdk` 0.59.0 - Anthropic API provider integration
- `openai` 6.3.0 - OpenAI and OpenAI-compatible API provider integration

**Infrastructure:**
- `node:http` - Built-in HTTP server for bridge (research harness integration)
- `node:fs/promises` - Filesystem operations (sessions, artifacts, config)
- `node:zlib` - Compression for bridge payloads

## Configuration

**Environment:**
- `.env` files: NOT committed, contain API keys (OpenRouter, OpenAI, Anthropic management tokens)
- Environment variable precedence: Project `.ai/.env` > global `~/.config/taw/.env` > system env

**Build:**
- `tsconfig.json` - Strict mode enabled, ES2022 target, NodeNext module resolution
- `tsconfig.eslint.json` - Extended for linting with type awareness
- `.prettierrc.json` - Semi-colons enabled, single quotes, no trailing commas
- `eslint.config.js` - Flat config format, ignores `dist/`, `.ai/`, test fixtures

**Compilation:**
```bash
pnpm build              # TypeScript → dist/
pnpm dev                # tsx watch mode (not compiled)
```

## Platform Requirements

**Development:**
- Node 20+ required
- pnpm 10+ for dependency management
- Docker (optional) for local searxng development

**Production:**
- Node 20+ at runtime
- Deployed as compiled JavaScript in `dist/`
- Executes from installed npm binary: `taw` (entry: `dist/cli/entry.js`)

**Secondary executables:**
- `taw-bridge` → `dist/cli/bridge.js` - Local bridge server for research/wiki ingest
- `taw-research-harness` → `dist/cli/research-harness.ts` - Headless research automation

## External Service Requirements

**AI Provider APIs (pick at least one):**
- OpenRouter (primary, recommended)
- OpenAI-compatible endpoint
- Anthropic-compatible endpoint

**Research Backend (optional):**
- SearXNG 1.x - Local search metaengine (Docker via `infra/docker-compose.yml`)
- Falls back to OpenRouter web search if SearXNG unavailable

**Browser Integration (optional):**
- Chrome/Chromium extension bridge for capturing research payloads

---

*Stack analysis: 2026-04-14*
