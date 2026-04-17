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

export type OpenItemTag = 'RESEARCH' | 'VALIDATE' | 'DESIGN' | 'DECIDE';

export interface BrainstormOpenItem {
  id: string;
  text: string;
  tag: OpenItemTag;
  status: 'open' | 'in-progress' | 'resolved';
  wikiArtifact?: string;   // path to the artifact created for this item
  spawnedFrom?: string;    // id of the parent item that created this one
}

export interface MapPickerItem {
  filePath: string;
  topic: string;
  sessionType: string;
  created: string;
  openItems: BrainstormOpenItem[];
}

export interface BrainstormMap {
  topic: string;
  sessionType: string;
  openItems: BrainstormOpenItem[];
  artifactPath: string;
  savedAt: string;
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
  brainstormMap: BrainstormMap | null;
  voiceMode: boolean;
  voiceState: 'idle' | 'listening' | 'speaking';
}
