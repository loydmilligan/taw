import type { ProviderConfig } from './provider.js';
import type { GlobalConfig, ProjectConfig } from '../services/config/schema.js';
import type { SessionRecord } from './session.js';

export interface TranscriptEntry {
  id: string;
  kind: 'system' | 'assistant' | 'user' | 'notice' | 'error';
  title?: string;
  body: string;
}

export interface AppState {
  mode: string;
  provider: string;
  model: string;
  providerConfig: ProviderConfig;
  commandReference: string;
  globalConfig: GlobalConfig;
  projectConfig: ProjectConfig | null;
  isStreaming: boolean;
  session: SessionRecord;
  transcript: TranscriptEntry[];
}
