import { z } from 'zod';

export const sessionArtifactSchema = z.object({
  id: z.string(),
  type: z.string(),
  title: z.string(),
  path: z.string(),
  createdAt: z.string()
});

export const sessionMetadataSchema = z.object({
  id: z.string(),
  slug: z.string(),
  createdAt: z.string(),
  cwdAtLaunch: z.string(),
  attachedDirs: z.array(z.string()),
  modeHistory: z.array(z.string()),
  artifacts: z.array(sessionArtifactSchema),
  provider: z.string(),
  model: z.string(),
  summaryStatus: z.enum(['idle', 'ready'])
});
