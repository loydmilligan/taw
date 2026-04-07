import { afterEach, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { appendTelemetryRecord, readTelemetrySummaries } from '../src/core/telemetry/store.js';
import { createSession } from '../src/core/sessions/session-manager.js';

const originalHome = process.env.HOME;

describe('telemetry store', () => {
  let tempDir = '';

  afterEach(async () => {
    process.env.HOME = originalHome;
    if (tempDir) {
      await rm(tempDir, { recursive: true, force: true });
      tempDir = '';
    }
  });

  it('appends and reads request summaries from session telemetry jsonl', async () => {
    tempDir = await mkdtemp(path.join(os.tmpdir(), 'taw-telemetry-'));
    process.env.HOME = tempDir;
    const cwd = path.join(tempDir, 'project');
    await mkdir(path.join(cwd, '.ai'), { recursive: true });
    await writeFile(path.join(cwd, '.ai', 'config.json'), JSON.stringify({ projectName: 'project' }));
    const session = await createSession({ cwd });

    await appendTelemetryRecord(session, {
      event_type: 'request_summary',
      session_id: session.metadata.id,
      turn_id: 'turn-1',
      request_group_id: 'group-1',
      created_at: new Date().toISOString(),
      started_at: new Date().toISOString(),
      completed_at: new Date().toISOString(),
      provider: 'openrouter',
      model_requested: 'openrouter/auto',
      model_resolved: 'openrouter/auto',
      router: null,
      generation_id: null,
      provider_request_id: null,
      upstream_id: null,
      request_id: null,
      provider_name: null,
      provider_responses: null,
      streamed: true,
      cancelled: false,
      interrupted_by_user: false,
      metadata_fetch_status: 'not_supported',
      finish_reason: null,
      native_finish_reason: null,
      latency_ms: null,
      generation_time_ms: null,
      moderation_latency_ms: null,
      time_to_first_token_ms: null,
      prompt_tokens: 10,
      completion_tokens: 20,
      reasoning_tokens: 0,
      cached_tokens: 0,
      native_tokens_prompt: null,
      native_tokens_completion: null,
      native_tokens_reasoning: null,
      native_tokens_cached: null,
      total_cost: 0.001,
      upstream_inference_cost: null,
      cache_discount: null,
      task_type: 'chat',
      workflow_stage: null,
      mode: 'General',
      phase_at_send: 'idle',
      conversation_depth: 1,
      project_scoped: true,
      attached_dirs_count: 1,
      artifact_generated: false,
      artifact_type: null,
      artifact_path: null,
      user_message_length_chars: 5,
      assistant_response_length_chars: 10,
      follow_up_questions: 0,
      actionable_items_count: 0,
      complexity_score: 1,
      requires_followup: false,
      context_summary_present: false,
      recent_artifact_count: 0,
      prompt_context_length_chars: 50,
      error_kind: null,
      error_message: null
    });

    const summaries = await readTelemetrySummaries(session);
    expect(summaries).toHaveLength(1);
    expect(summaries[0]?.total_cost).toBe(0.001);
  });
});
