/**
 * AI-powered qualitative review of TUI test runs.
 *
 * Makes a single OpenRouter chat completion call after a test completes.
 * Returns a structured result with a plain-English summary and, on failure,
 * a best-guess failure category to help triage what broke.
 *
 * Requires OPENROUTER_API_KEY in the environment.
 * Falls back gracefully (logs a warning, returns undefined) if the key is
 * missing or the API call fails — AI review is advisory, never blocking.
 */

import type { StepTrace } from './schema.js';

export type FailureCategory =
  | 'TAW_BUG'       // The application itself behaved incorrectly
  | 'HARNESS_BUG'   // The test harness (executor/session/runner) has a defect
  | 'SPEC_BUG'      // The YAML spec has wrong anchors, bad timing, or incorrect assertions
  | 'ENVIRONMENT'   // Missing dependency, wrong tmux version, path problem, etc.
  | 'UNCLEAR';      // Not enough information to categorize confidently

export interface AiReviewResult {
  summary: string;
  // Only set on failed tests
  failureCategory?: FailureCategory;
  categoryReasoning?: string;
  confidence?: 'high' | 'medium' | 'low';
  // Raw model used, for traceability
  model: string;
}

const DEFAULT_MODEL = 'openai/gpt-4o-mini';

// Build the prompt sent to the AI reviewer.
function buildPrompt(
  testName: string,
  testDescription: string | undefined,
  passed: boolean,
  traces: StepTrace[],
  errorMessage: string | undefined
): string {
  const stepLines = traces.map((t, i) => {
    const statusMark = t.error ? '✗ FAILED' : '✓ ok';
    const lines = [
      `Step ${i + 1} [${t.action}] ${statusMark} (${t.durationMs}ms)`,
      `  Input:  ${t.input}`,
    ];
    if (t.error) {
      lines.push(`  Error:  ${t.error.split('\n')[0]}`);
    }
    // Include pane content — trim to last 600 chars to keep prompt manageable
    const pane = t.paneAfter.trim().slice(-600);
    if (pane) {
      lines.push(`  Pane after:`);
      for (const line of pane.split('\n').slice(-12)) {
        lines.push(`    ${line}`);
      }
    }
    return lines.join('\n');
  }).join('\n\n');

  const resultLine = passed
    ? 'RESULT: PASSED'
    : `RESULT: FAILED\nFAILURE: ${errorMessage ?? 'unknown error'}`;

  const failureCategoryInstructions = passed ? '' : `
## Failure categorization

Based on the step trace above, assign ONE of these categories:

- TAW_BUG      — TAW produced unexpected output, crashed, or did not respond as designed
                 (e.g. missing UI element, wrong text, unhandled command, unexpected exit)
- HARNESS_BUG  — The test harness itself has a defect: timing assumptions, wrong tmux commands,
                 incorrect capture, key-send issues (e.g. slash being interpreted as tmux key)
- SPEC_BUG     — The YAML spec is wrong: anchor text doesn't match what TAW actually renders,
                 timeout too short, incorrect assertion logic, wrong fixture path
- ENVIRONMENT  — Missing binary, wrong version, path problem, network issue, or other
                 infrastructure failure unrelated to TAW or the spec
- UNCLEAR      — Genuinely ambiguous; not enough information to distinguish cause

Provide:
  failureCategory: one of the values above
  categoryReasoning: one or two sentences explaining your reasoning
  confidence: high | medium | low
`;

  return `You are reviewing a TAW (Terminal AI Workspace) TUI test run. TAW is a terminal-native, \
chat-first AI workspace built with Node.js + TypeScript + Ink (React for CLIs). \
Tests drive TAW via tmux: a YAML spec sends keystrokes and asserts on terminal pane content.

## Test: ${testName}
${testDescription ? `Description: ${testDescription}\n` : ''}
${resultLine}

## Step-by-step trace

${stepLines}

---

## Your task

Write a concise qualitative review (3–5 sentences) covering:
1. What the test was trying to verify
2. How the steps progressed (what worked, what didn't)
3. On failure: what the terminal state looked like when it failed and what that suggests
4. Any observations about test quality, timing, or spec robustness
${failureCategoryInstructions}
Respond in JSON with this exact shape (no markdown fences):
{
  "summary": "<3-5 sentence review>",
  "failureCategory": "<category or null if passed>",
  "categoryReasoning": "<one-two sentences or null if passed>",
  "confidence": "<high|medium|low or null if passed>"
}`;
}

export async function runAiReview(opts: {
  testName: string;
  testDescription: string | undefined;
  passed: boolean;
  traces: StepTrace[];
  errorMessage: string | undefined;
  model?: string;
}): Promise<AiReviewResult | undefined> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    process.stderr.write('[ai-review] OPENROUTER_API_KEY not set — skipping AI review\n');
    return undefined;
  }

  const model = opts.model ?? DEFAULT_MODEL;
  const prompt = buildPrompt(
    opts.testName,
    opts.testDescription,
    opts.passed,
    opts.traces,
    opts.errorMessage
  );

  try {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://github.com/taw-project/taw',
        'X-Title': 'TAW TUI Harness AI Review',
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 600,
        temperature: 0.2,
      }),
    });

    if (!response.ok) {
      process.stderr.write(`[ai-review] OpenRouter error ${response.status}: ${await response.text()}\n`);
      return undefined;
    }

    const data = await response.json() as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const content = data.choices?.[0]?.message?.content?.trim();
    if (!content) {
      process.stderr.write('[ai-review] Empty response from OpenRouter\n');
      return undefined;
    }

    // Strip markdown code fences if the model wrapped the JSON anyway
    const jsonStr = content.replace(/^```(?:json)?\n?/i, '').replace(/\n?```$/,'').trim();
    const parsed = JSON.parse(jsonStr) as {
      summary?: string;
      failureCategory?: string;
      categoryReasoning?: string;
      confidence?: string;
    };

    return {
      summary: parsed.summary ?? '(no summary)',
      failureCategory: parsed.failureCategory as FailureCategory | undefined,
      categoryReasoning: parsed.categoryReasoning ?? undefined,
      confidence: parsed.confidence as AiReviewResult['confidence'],
      model,
    };
  } catch (e) {
    process.stderr.write(`[ai-review] Failed: ${e instanceof Error ? e.message : String(e)}\n`);
    return undefined;
  }
}
