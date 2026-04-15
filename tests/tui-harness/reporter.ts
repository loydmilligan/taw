import type { StepTrace } from './schema.js';
import type { AiReviewResult } from './ai-review.js';

export function reportPlanHeader(total: number): void {
  console.log('TAP version 14');
  console.log(`1..${total}`);
}

export function reportPass(index: number, name: string, durationMs?: number): void {
  console.log(`ok ${index} - ${name}${durationMs !== undefined ? ` # ${durationMs}ms` : ''}`);
}

// Emit a TAP 14 YAML diagnostic block — indented with two spaces, fenced by ---/...
function tapYaml(data: Record<string, unknown>): void {
  console.log('  ---');
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.includes('\n')) {
      // Multi-line scalar — use literal block style
      console.log(`  ${key}: |`);
      for (const line of value.split('\n')) {
        console.log(`    ${line}`);
      }
    } else {
      console.log(`  ${key}: ${JSON.stringify(value)}`);
    }
  }
  console.log('  ...');
}

export function reportFail(
  index: number,
  name: string,
  err: Error,
  traces: StepTrace[],
  aiReview?: AiReviewResult
): void {
  console.log(`not ok ${index} - ${name}`);

  // Find the failing step trace (has an error field)
  const failingTrace = traces.findLast((t) => t.error !== undefined);

  tapYaml({
    message: err.message.split('\n')[0],
    // Full error including pane capture from waitForText / assertPane
    detail: err.message,
    failing_step: failingTrace
      ? `step ${failingTrace.stepIndex + 1}: ${failingTrace.input}`
      : undefined,
    pane_at_failure: failingTrace?.paneAfter,
    ai_category: aiReview?.failureCategory,
    ai_summary: aiReview?.summary,
    ai_confidence: aiReview?.confidence,
  });
}

export function reportStepTrace(traces: StepTrace[]): void {
  if (traces.length === 0) return;
  console.log('  # Step trace:');
  for (const t of traces) {
    const status = t.error ? '✗' : '✓';
    console.log(`  #   [${t.stepIndex + 1}] ${status} ${t.input} (${t.durationMs}ms)`);
    if (t.error) {
      console.log(`  #       error: ${t.error.split('\n')[0]}`);
    }
  }
}

export function reportAiReview(aiReview: AiReviewResult): void {
  console.log('  # AI Review:');
  console.log(`  #   summary: ${aiReview.summary}`);
  if (aiReview.failureCategory) {
    console.log(`  #   failure category: ${aiReview.failureCategory} (confidence: ${aiReview.confidence ?? 'unknown'})`);
    if (aiReview.categoryReasoning) {
      console.log(`  #   reasoning: ${aiReview.categoryReasoning}`);
    }
  }
}

export function reportSummary(passed: number, failed: number): void {
  console.log(`# passed: ${passed}`);
  console.log(`# failed: ${failed}`);
}
