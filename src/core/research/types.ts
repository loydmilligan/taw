export type ResearchType = 'politics' | 'tech' | 'repo' | 'video';

export type ResearchSourceKind = 'article' | 'repo' | 'video' | 'note';

export type ResearchSourceOrigin =
  | 'browser-extension'
  | 'manual'
  | 'fetch'
  | 'search';

export type ResearchSourceStatus = 'new' | 'reviewed' | 'used' | 'ignored';

export interface ResearchSource {
  id: string;
  researchType: ResearchType;
  kind: ResearchSourceKind;
  url: string | null;
  title: string;
  origin: ResearchSourceOrigin;
  selectedText: string | null;
  excerpt: string | null;
  note: string | null;
  snapshotPath: string | null;
  createdAt: string;
  status: ResearchSourceStatus;
}

export interface BrowserResearchPayload {
  kind: ResearchSourceKind;
  researchType: ResearchType;
  url: string | null;
  title: string;
  selectedText: string | null;
  pageTextExcerpt: string | null;
  userNote: string | null;
  sentAt: string;
  initialQuestion: string | null;
}

export interface ResearchSourceView {
  sourceId: string;
  sourceIndex: number;
  title: string;
  tmuxWindowId: string;
  tmuxWindowName: string;
  openedAt: string;
  lastOpenedAt: string;
}
