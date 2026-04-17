import { z } from 'zod';

export const voiceConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    pythonPath: z
      .string()
      .default('/home/loydmilligan/Projects/ttstt/venv/bin/python3'),
    listenDurationSecs: z.number().int().positive().max(30).default(5),
    voiceName: z.string().default('alloy'),
    sessionCostCapUsd: z.number().nonnegative().default(0.1),
  })
  .default({
    enabled: false,
    pythonPath: '/home/loydmilligan/Projects/ttstt/venv/bin/python3',
    listenDurationSecs: 5,
    voiceName: 'alloy',
    sessionCostCapUsd: 0.1,
  });

export type VoiceConfig = z.infer<typeof voiceConfigSchema>;
