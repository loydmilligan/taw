import { z } from 'zod';
import { voiceConfigSchema } from '../voice/config.js';

export const projectConfigSchema = z.object({
  projectName: z.string().default(''),
  defaultAttachedDirs: z.array(z.string()).default([]),
  preferredArtifactOutputs: z.array(z.string()).default(['artifacts']),
  promptOverrides: z.record(z.string(), z.string()).default({}),
  maxCompletionTokens: z.number().int().positive().max(8192).optional(),
  provider: z.enum(['openrouter', 'openai', 'anthropic']).optional(),
  model: z.string().optional()
});

export const globalConfigSchema = z.object({
  defaultProvider: z
    .enum(['openrouter', 'openai', 'anthropic'])
    .default('openrouter'),
  defaultModel: z.string().default('openrouter/auto'),
  maxCompletionTokens: z.number().int().positive().max(8192).default(1200),
  searchBackend: z
    .object({
      searxng: z
        .object({
          enabled: z.boolean().default(true),
          autoStart: z.boolean().default(true),
          baseUrl: z.string().default('http://127.0.0.1:8080'),
          composeFile: z.string().optional(),
          serviceName: z.string().default('searxng'),
          idleMinutes: z.number().int().nonnegative().max(1440).default(45)
        })
        .default({
          enabled: true,
          autoStart: true,
          baseUrl: 'http://127.0.0.1:8080',
          serviceName: 'searxng',
          idleMinutes: 45
        }),
      openrouterFallback: z
        .object({
          enabled: z.boolean().default(false),
          maxResults: z.number().int().positive().max(10).default(5)
        })
        .default({
          enabled: false,
          maxResults: 5
        })
    })
    .default({
      searxng: {
        enabled: true,
        autoStart: true,
        baseUrl: 'http://127.0.0.1:8080',
        serviceName: 'searxng',
        idleMinutes: 45
      },
      openrouterFallback: {
        enabled: false,
        maxResults: 5
      }
    }),
  budget: z
    .object({
      highTurnCostWarning: z.number().nonnegative().default(0.05),
      highSessionCostWarning: z.number().nonnegative().default(0.25),
      highPromptTokensWarning: z.number().int().nonnegative().default(12000),
      highContextCharsWarning: z.number().int().nonnegative().default(50000)
    })
    .default({
      highTurnCostWarning: 0.05,
      highSessionCostWarning: 0.25,
      highPromptTokensWarning: 12000,
      highContextCharsWarning: 50000
    }),
  sourceRatings: z
    .object({
      dbPath: z.string().optional()
    })
    .default({}),
  theme: z
    .object({
      accent: z.string().optional()
    })
    .default({}),
  ui: z
    .object({
      compactMode: z.boolean().default(false),
      showHeaderDetails: z.boolean().default(true),
      showUsage: z.boolean().default(true),
      showHints: z.boolean().default(true),
      showWarnings: z.boolean().default(true),
      showResearchStats: z.boolean().default(true)
    })
    .default({
      compactMode: false,
      showHeaderDetails: true,
      showUsage: true,
      showHints: true,
      showWarnings: true,
      showResearchStats: true
    }),
  outputBehavior: z
    .object({
      autoSaveNotes: z.boolean().default(true)
    })
    .default({ autoSaveNotes: true }),
  hister: z
    .object({
      enabled: z.boolean().default(false),
      baseUrl: z.string().default('http://localhost:4433'),
      token: z.string().optional()
    })
    .default({
      enabled: false,
      baseUrl: 'http://localhost:4433'
    }),
  voice: voiceConfigSchema,
  allowedContextDirs: z.array(z.string()).default([]),
  providers: z
    .object({
      openrouter: z
        .object({
          apiKey: z.string().optional(),
          baseUrl: z.string().optional(),
          managementApiKey: z.string().optional()
        })
        .default({}),
      openai: z
        .object({
          apiKey: z.string().optional(),
          baseUrl: z.string().optional()
        })
        .default({}),
      anthropic: z
        .object({
          apiKey: z.string().optional(),
          baseUrl: z.string().optional()
        })
        .default({})
    })
    .default({
      openrouter: {},
      openai: {},
      anthropic: {}
    })
});

export type GlobalConfig = z.infer<typeof globalConfigSchema>;
export type ProjectConfig = z.infer<typeof projectConfigSchema>;
