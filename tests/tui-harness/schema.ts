import { z } from 'zod';

export const StepSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('launch'),
    cwd: z.string().optional(),
    args: z.array(z.string()).optional()
  }),
  z.object({
    action: z.literal('type'),
    text: z.string()
  }),
  z.object({
    action: z.literal('key'),
    key: z.string()
  }),
  z.object({
    action: z.literal('wait'),
    for: z.string(),
    timeout: z.number().optional()
  }),
  z.object({
    action: z.literal('assert'),
    contains: z.string().optional(),
    matches: z.string().optional(),
    row: z.number().optional(),
    not: z.boolean().optional()
  }),
  z.object({
    action: z.literal('sleep'),
    ms: z.number()
  })
]);

export const TestCaseSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  fixture: z.string().optional(),
  steps: z.array(StepSchema)
});

export const TestSuiteSchema = z.object({
  suite: z.string(),
  description: z.string().optional(),
  timeout: z.number().optional(),
  tests: z.array(TestCaseSchema)
});

export type TestSuite = z.infer<typeof TestSuiteSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type Step = z.infer<typeof StepSchema>;
export type AssertStep = Extract<Step, { action: 'assert' }>;
