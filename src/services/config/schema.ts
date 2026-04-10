import { z } from 'zod';

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
      highSessionCostWarning: z.number().nonnegative().default(0.25)
    })
    .default({
      highTurnCostWarning: 0.05,
      highSessionCostWarning: 0.25
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
  outputBehavior: z
    .object({
      autoSaveNotes: z.boolean().default(true)
    })
    .default({ autoSaveNotes: true }),
  allowedContextDirs: z.array(z.string()).default([]),
  providers: z
    .object({
      openrouter: z
        .object({
          apiKey: z.string().optional(),
          baseUrl: z.string().optional()
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
