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
