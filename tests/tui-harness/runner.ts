#!/usr/bin/env node
import { readFileSync, existsSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import { parse as parseYaml } from 'yaml';
import { TestSuiteSchema } from './schema.js';
import { hasTmux, createSession, killSession } from './session.js';
import { executeStep } from './executor.js';
import { reportPlanHeader, reportPass, reportFail, reportSummary } from './reporter.js';

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const keepSession = args.includes('--keep-session');
  const specPaths = args.filter((a) => !a.startsWith('--'));

  if (specPaths.length === 0) {
    process.stderr.write(
      'Usage: tsx tests/tui-harness/runner.ts <spec-file> [<spec-file>...] [--keep-session]\n'
    );
    process.exit(1);
  }

  if (!hasTmux()) {
    process.stderr.write('tmux is required for TUI harness\n');
    process.exit(2);
  }

  // Validate all spec paths exist before running
  for (const specPath of specPaths) {
    if (!existsSync(specPath)) {
      process.stderr.write(`Spec file not found: ${specPath}\n`);
      process.exit(3);
    }
  }

  // Parse all suites and count total tests
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
      let failed = false;
      let err: Error | undefined;

      try {
        await createSession(sessionId);
        for (const step of test.steps) {
          await executeStep(sessionId, step, test.fixture);
        }
      } catch (e) {
        failed = true;
        err = e instanceof Error ? e : new Error(String(e));
      } finally {
        if (!keepSession) await killSession(sessionId);
      }

      if (failed) {
        reportFail(testIndex, test.name, err!);
        failedCount++;
      } else {
        reportPass(testIndex, test.name);
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
