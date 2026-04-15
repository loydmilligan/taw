import { z } from 'zod';

// When to trigger an AI review of a test run.
// 'never'      — no AI call (default)
// 'on_failure' — AI reviews only when the test fails
// 'on_success' — AI reviews only when the test passes
// 'always'     — AI reviews every run
export const AiReviewTriggerSchema = z.enum(['never', 'on_failure', 'on_success', 'always']);
export type AiReviewTrigger = z.infer<typeof AiReviewTriggerSchema>;

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
  ai_review: AiReviewTriggerSchema.optional(), // overrides suite-level default
  steps: z.array(StepSchema)
});

export const TestSuiteSchema = z.object({
  suite: z.string(),
  description: z.string().optional(),
  timeout: z.number().optional(),
  // Suite-level AI review default — applies to all tests unless overridden per-test
  ai_review: AiReviewTriggerSchema.optional().default('never'),
  // OpenRouter model to use for AI review. Defaults to openai/gpt-4o-mini (fast + cheap).
  ai_review_model: z.string().optional(),
  tests: z.array(TestCaseSchema)
});

export type TestSuite = z.infer<typeof TestSuiteSchema>;
export type TestCase = z.infer<typeof TestCaseSchema>;
export type Step = z.infer<typeof StepSchema>;
export type AssertStep = Extract<Step, { action: 'assert' }>;

// Trace record produced by executeStep for each step in a test.
export interface StepTrace {
  stepIndex: number;
  action: string;
  // Human-readable summary of what was sent/checked (e.g. text typed, key pressed, pattern waited for)
  input: string;
  // Terminal pane content captured immediately after the step executed
  paneAfter: string;
  durationMs: number;
  // Set only on the failing step
  error?: string;
}
