import type { AppState, TranscriptEntry } from '../types/app.js';
import { createSession } from '../core/sessions/session-manager.js';
import { loadConfig } from '../services/config/loader.js';
import { ensureAssistantReferenceFiles } from '../core/context/assistant-files.js';
import { commandRegistry } from '../commands/registry.js';

export async function bootstrapApp(cwd: string): Promise<AppState> {
  const config = await loadConfig(cwd);
  const session = await createSession({
    cwd,
    provider: config.providerConfig.provider,
    model: config.providerConfig.model
  });
  const references = await ensureAssistantReferenceFiles(cwd, session, commandRegistry);

  return {
    mode: 'General',
    phase: 'idle',
    provider: session.metadata.provider,
    model: session.metadata.model,
    providerConfig: config.providerConfig,
    commandReference: references.commandReference,
    globalConfig: config.globalConfig,
    projectConfig: config.projectConfig,
    isStreaming: false,
    session,
    transcript: createInitialTranscript(session.storageMode, session.sessionDir)
  };
}

function createInitialTranscript(
  storageMode: 'general' | 'project',
  sessionDir: string
): TranscriptEntry[] {
  return [
    {
      id: 'welcome',
      kind: 'system',
      title: 'Session Started',
      body:
        storageMode === 'project'
          ? 'Project-aware session active. TAW found a local .ai/config.json and is saving this session in the project.'
          : 'General session active. No project has been initialized here, so TAW is using your user config directory.'
    },
    {
      id: 'session-path',
      kind: 'notice',
      title: 'Session Folder',
      body: sessionDir
    }
  ];
}
