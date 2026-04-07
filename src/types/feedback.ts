export type FeedbackKind = 'idea' | 'issue';

export interface FeedbackEntry {
  id: string;
  kind: FeedbackKind;
  summary: string;
  note: string | null;
  createdAt: string;
  mode: string;
  sessionId: string;
  latestUserMessage: string | null;
  latestAssistantMessage: string | null;
}
