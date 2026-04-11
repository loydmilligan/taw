export type SummaryStatus = 'idle' | 'ready';

export interface SessionArtifact {
  id: string;
  type: string;
  title: string;
  path: string;
  createdAt: string;
}

export interface SessionMetadata {
  id: string;
  slug: string;
  createdAt: string;
  cwdAtLaunch: string;
  attachedDirs: string[];
  modeHistory: string[];
  artifacts: SessionArtifact[];
  provider: string;
  model: string;
  summaryStatus: SummaryStatus;
}

export interface SessionRecord {
  metadata: SessionMetadata;
  sessionDir: string;
  artifactsDir: string;
  sourcesDir: string;
  sourcesJsonPath: string;
  sourceViewsJsonPath: string;
  notesPath: string;
  sessionJsonPath: string;
  summaryPath: string;
  storageMode: 'general' | 'project';
  projectRoot: string | null;
}
