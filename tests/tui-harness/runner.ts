#!/usr/bin/env node
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import type { StepTrace } from './schema.js';
import { TestSuiteSchema } from './schema.js';
import { hasTmux, createSession, killSession, capturePaneAnsi } from './session.js';
import { executeStep, type TracedError } from './executor.js';
import {
  reportPlanHeader,
  reportPass,
  reportFail,
  reportStepTrace,
  reportAiReview,
  reportSummary,
} from './reporter.js';
import { runAiReview } from './ai-review.js';

// Save per-step artifacts under test-artifacts/<sessionId>/
function saveStepArtifacts(artifactDir: string, traces: StepTrace[]): void {
  try {
    mkdirSync(artifactDir, { recursive: true });
    for (const t of traces) {
      const padded = String(t.stepIndex + 1).padStart(2, '0');
      const status = t.error ? 'FAIL' : 'ok';
      const filename = `step-${padded}-${t.action}-${status}.txt`;
      const content = [
        `Step ${t.stepIndex + 1}: ${t.input}`,
        `Status: ${status}`,
        `Duration: ${t.durationMs}ms`,
        t.error ? `Error: ${t.error}` : '',
        '',
        '--- Pane after ---',
        t.paneAfter,
      ].filter((l) => l !== undefined).join('\n');
      writeFileSync(join(artifactDir, filename), content, 'utf8');
    }
    // Also save the final ANSI "screenshot" from the last step
    const lastPane = traces.at(-1)?.paneAfter;
    if (lastPane) {
      writeFileSync(join(artifactDir, 'final-pane.txt'), lastPane, 'utf8');
    }
  } catch {
    // Artifact saving is best-effort — never fail the run over this
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const keepSession = args.includes('--keep-session');
  const saveArtifacts = !args.includes('--no-artifacts');
  const specPaths = args.filter((a) => !a.startsWith('--'));

  if (specPaths.length === 0) {
    process.stderr.write(
      'Usage: tsx tests/tui-harness/runner.ts <spec-file> [<spec-file>...] [--keep-session] [--no-artifacts]\n'
    );
    process.exit(1);
  }

  if (!hasTmux()) {
    process.stderr.write('tmux is required for TUI harness\n');
    process.exit(2);
  }

  for (const specPath of specPaths) {
    if (!existsSync(specPath)) {
      process.stderr.write(`Spec file not found: ${specPath}\n`);
      process.exit(3);
    }
  }

  const suites = specPaths.map((specPath) => {
    const raw = parseYaml(readFileSync(specPath, 'utf8'));
    return TestSuiteSchema.parse(raw);
  });

  const total = suites.reduce((sum, s) => sum + s.tests.length, 0);
  reportPlanHeader(total);

  let passedCount = 0;
  let failedCount = 0;
  let testIndex = 1;

  for (const suite of suites) {
    for (const test of suite.tests) {
      const sessionId = `taw-test-${randomUUID().slice(0, 8)}`;
      const traces: StepTrace[] = [];
      let failed = false;
      let err: Error | undefined;

      try {
        await createSession(sessionId);

        for (let i = 0; i < test.steps.length; i++) {
          try {
            const trace = await executeStep(sessionId, test.steps[i], test.fixture, i);
            traces.push(trace);
          } catch (e) {
            failed = true;
            err = e instanceof Error ? e : new Error(String(e));
            // Recover the step trace attached by executeStep
            const traced = err as TracedError;
            if (traced.stepTrace) traces.push(traced.stepTrace);
            break; // stop running remaining steps on first failure
          }
        }
      } catch (e) {
        failed = true;
        err = e instanceof Error ? e : new Error(String(e));
      } finally {
        // Capture ANSI screenshot of final state before killing session
        if (saveArtifacts && traces.length > 0) {
          try {
            const ansi = capturePaneAnsi(sessionId);
            if (ansi) {
              const artifactDir = join('test-artifacts', sessionId);
              mkdirSync(artifactDir, { recursive: true });
              writeFileSync(join(artifactDir, 'final-pane.ansi'), ansi, 'utf8');
            }
          } catch { /* best-effort */ }
        }
        if (!keepSession) await killSession(sessionId);
      }

      // Save per-step text artifacts
      if (saveArtifacts && traces.length > 0) {
        saveStepArtifacts(join('test-artifacts', sessionId), traces);
      }

      // Determine whether AI review should run for this test
      const triggerSetting = test.ai_review ?? suite.ai_review ?? 'never';
      const shouldReview =
        triggerSetting === 'always' ||
        (triggerSetting === 'on_failure' && failed) ||
        (triggerSetting === 'on_success' && !failed);

      let aiReview = undefined;
      if (shouldReview) {
        aiReview = await runAiReview({
          testName: test.name,
          testDescription: test.description,
          passed: !failed,
          traces,
          errorMessage: err?.message,
          model: suite.ai_review_model,
        });
      }

      const durationMs = traces.reduce((sum, t) => sum + t.durationMs, 0);

      if (failed) {
        reportFail(testIndex, test.name, err!, traces, aiReview);
        reportStepTrace(traces);
        if (aiReview) reportAiReview(aiReview);
        failedCount++;
      } else {
        reportPass(testIndex, test.name, durationMs);
        reportStepTrace(traces);
        if (aiReview) reportAiReview(aiReview);
        passedCount++;
      }

      testIndex++;
    }
  }

  reportSummary(passedCount, failedCount);
  process.exitCode = failedCount > 0 ? 1 : 0;
}

main().catch((err) => {
  console.error(err);
  process.exit(99);
});
