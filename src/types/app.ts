import type { ProviderConfig } from './provider.js';
import type { GlobalConfig, ProjectConfig } from '../services/config/schema.js';
import type { SessionRecord } from './session.js';
import type { AppPhase, UsageSnapshot } from '../app/state.js';

export interface TranscriptEntry {
  id: string;
  kind: 'system' | 'assistant' | 'user' | 'notice' | 'error';
  title?: string;
  body: string;
  draftState?: 'pending' | 'complete' | 'interrupted' | 'failed';
}

export interface AppState {
  mode: string;
  phase: AppPhase;
  provider: string;
  model: string;
  providerConfig: ProviderConfig;
  commandReference: string;
  globalConfig: GlobalConfig;
  projectConfig: ProjectConfig | null;
  isStreaming: boolean;
  session: SessionRecord;
  transcript: TranscriptEntry[];
  usage: UsageSnapshot;
  openrouterAccount: {
    remainingCredits: number | null;
    totalCredits: number | null;
    totalUsage: number | null;
    lastFetchedAt: string | null;
    error: string | null;
  } | null;
  queuedInputs: string[];
}
