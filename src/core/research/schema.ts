import { z } from 'zod';

export const researchTypeSchema = z.enum(['politics', 'tech', 'repo', 'video']);
export const researchSourceKindSchema = z.enum([
  'article',
  'repo',
  'video',
  'note'
]);
export const researchSourceOriginSchema = z.enum([
  'browser-extension',
  'manual',
  'fetch',
  'search'
]);
export const researchSourceStatusSchema = z.enum([
  'new',
  'reviewed',
  'used',
  'ignored'
]);

export const researchSourceSchema = z.object({
  id: z.string(),
  researchType: researchTypeSchema,
  kind: researchSourceKindSchema,
  url: z.string().nullable(),
  title: z.string(),
  origin: researchSourceOriginSchema,
  selectedText: z.string().nullable(),
  excerpt: z.string().nullable(),
  note: z.string().nullable(),
  snapshotPath: z.string().nullable(),
  createdAt: z.string(),
  status: researchSourceStatusSchema
});

export const browserResearchPayloadSchema = z.object({
  kind: researchSourceKindSchema,
  researchType: researchTypeSchema,
  url: z.string().nullable(),
  title: z.string(),
  selectedText: z.string().nullable(),
  pageTextExcerpt: z.string().nullable(),
  userNote: z.string().nullable(),
  sentAt: z.string(),
  initialQuestion: z.string().nullable().default(null)
});

export const researchSourceViewSchema = z.object({
  sourceId: z.string(),
  sourceIndex: z.number().int().positive(),
  title: z.string(),
  tmuxWindowId: z.string(),
  tmuxWindowName: z.string(),
  openedAt: z.string(),
  lastOpenedAt: z.string()
});
