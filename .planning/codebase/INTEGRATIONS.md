# External Integrations

**Analysis Date:** 2026-04-14

## APIs & External Services

**AI Provider Layer:**
- OpenRouter - Primary provider (streaming completions, web search tools, model routing)
  - SDK/Client: `@anthropic-ai/sdk` fallback via OpenAI-compatible endpoint
  - Auth: `OPENROUTER_API_KEY` env var
  - Management API: `OPENROUTER_MANAGEMENT_KEY` (optional, for account credits/usage)
  
- OpenAI - Direct OpenAI-compatible endpoint
  - SDK/Client: `openai` 6.3.0
  - Auth: `OPENAI_API_KEY` env var
  - Base URL configurable via `OPENAI_BASE_URL` (supports compatible endpoints)
  
- Anthropic - Direct or compatible API
  - SDK/Client: `@anthropic-ai/sdk` 0.59.0
  - Auth: `ANTHROPIC_API_KEY` env var

**Web Search:**
- SearXNG metaengine - Local self-hosted search backend
  - Connection: HTTP to `http://127.0.0.1:8080` (configurable in global config)
  - Managed by: `src/services/search/searxng-manager.ts`
  - Docker compose: `infra/docker-compose.yml`
  - Auto-start: Configurable (`searchBackend.searxng.autoStart`)
  - Idle timeout: Configurable (default 45 minutes)

- OpenRouter Web Search fallback
  - Used if SearXNG unavailable
  - Enabled: `searchBackend.openrouterFallback.enabled`
  - Max results: Configurable (default 5)

**Browser Integration:**
- Local bridge HTTP server listens on configurable port
  - Entry point: `src/cli/bridge.ts` (launched via `pnpm bridge:dev` or `taw-bridge`)
  - Payload format: Compressed research data with browser context
  - Endpoints handle: session launch, research ingest, wiki operations
  - Payloads compressed with `zlib` for efficiency

## Data Storage

**Databases:**
- SQLite (implicit via Node fs) - Session metadata stored as JSON
  - Session store: `~/.config/taw/sessions/` (general mode) or `.ai/sessions/` (project mode)
  - Config store: `~/.config/taw/config.json` (global) and `.ai/config.json` (project)
  - Session record: `session.json` per session
  - Telemetry: `telemetry/` directory per session

**File Storage:**
- Local filesystem only (no cloud integration)
  - Session artifacts: `session.json` + `artifacts/` directory
  - Notes: `notes.md` per session
  - Session summaries: `session-summary.md`
  - Wiki storage: User-configurable, typically `wiki/` directory
  - Logs: `~/.config/taw/logs/*.log` (daily rotation)

**Caching:**
- In-memory: App state (React hooks in `src/app/App.tsx`)
- Session-scoped: Research sources, wiki cache, context summaries
- No persistent external cache (local session directories act as cache)

## Authentication & Identity

**Auth Provider:**
- No centralized auth required
- Session-scoped identity: Session ID + slug (generated via `src/utils/ids.ts`)
- API key management: Environment variables per provider
  - Global config can store provider selection, not keys
  - Keys read from `.env` files (never committed)

## Monitoring & Observability

**Error Tracking:**
- None (no external error tracking service)
- Errors logged locally to `~/.config/taw/logs/`

**Logs:**
- Local file system: `~/.config/taw/logs/taw-YYYY-MM-DD.log`
- One file per calendar day
- Format: Plaintext with timestamps
- API key redaction implemented in `src/services/logging/logger.js`
- Debug mode: User prompt logging requires explicit debug flag

**Telemetry:**
- Local session-scoped telemetry stored in `session.json` and per-request summaries
- Collected metrics: Token usage, cost, latency, mode history, context size
- No external telemetry transmission
- Schema: `src/core/telemetry/types.ts` (TelemetryRequestSummary, TelemetrySessionSummary)

## CI/CD & Deployment

**Hosting:**
- Self-hosted: User's local machine or server (terminal-first)
- Container support: Optional Docker for reproducible environments

**CI Pipeline:**
- None configured (GitHub Actions or similar not required for beta)
- Local: `pnpm test`, `pnpm lint`, `pnpm build`

**Deployment Method:**
- npm package: `npm install -g taw`
- Source checkout: `git clone` + `pnpm install && pnpm build`

## Environment Configuration

**Required env vars (critical):**
- At least one AI provider API key:
  - `OPENROUTER_API_KEY` (recommended)
  - `OPENAI_API_KEY` (if using OpenAI)
  - `ANTHROPIC_API_KEY` (if using Anthropic)

**Optional env vars:**
- `OPENROUTER_MANAGEMENT_KEY` - For account credits/usage fetching
- `TAW_PROJECT_ROOT` - Override project detection
- `TAW_SESSION_MODE` - Force project or general mode
- `TAW_DEBUG` - Enable verbose logging

**Secrets location:**
- Global: `~/.config/taw/.env` (user-created)
- Project: `.ai/.env` (project-scoped override)
- Never committed to git (listed in `.gitignore`)

## Webhooks & Callbacks

**Incoming:**
- Bridge server (`src/cli/bridge.ts`) accepts POST requests for:
  - Session launch requests
  - Research payload ingest
  - Wiki operations (read, write, reindex, link-review)
  - Background job status polling

**Outgoing:**
- None (TAW is reactive to user input, not autonomous)

## Research & Wiki Integration

**Research Storage:**
- Sources stored in `session/research-sources.json`
- Schema: URL, title, excerpt, metadata, user rating
- Accessible via `/sources` command
- Searchable via `/search-source` with local fuzzy search

**Wiki System:**
- Local wiki directories (user-specified or `wiki/`)
- Markdown frontmatter-based organization (YAML front matter)
- Indexing via `src/services/wiki/` suite:
  - `manager.ts` - Wiki topic/page discovery
  - `reindex.ts` - Rebuild wiki index
  - `link-review.ts` - Cross-link validation
  - `hister-ingest.ts` - Browser history ingest
- Bridge operations: Create, read, update pages; reindex; link review

---

*Integration audit: 2026-04-14*
