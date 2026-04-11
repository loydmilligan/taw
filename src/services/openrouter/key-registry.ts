import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { getOpenRouterKeysRegistryPath } from '../filesystem/paths.js';

export const managedOpenRouterKeySchema = z.object({
  appName: z.string().min(1),
  targetEnvPath: z.string().min(1),
  envVarName: z.string().min(1),
  keyHash: z.string().min(1),
  keyLabel: z.string().nullable().default(null),
  remoteName: z.string().min(1),
  disabled: z.boolean().default(false),
  limit: z.number().nullable().default(null),
  limitRemaining: z.number().nullable().default(null),
  limitReset: z.string().nullable().default(null),
  usage: z.number().nullable().default(null),
  createdAt: z.string().nullable().default(null),
  updatedAt: z.string().nullable().default(null),
  expiresAt: z.string().nullable().default(null),
  lastRotatedAt: z.string().nullable().default(null)
});

const managedOpenRouterKeysSchema = z.array(managedOpenRouterKeySchema);

export type ManagedOpenRouterKey = z.infer<typeof managedOpenRouterKeySchema>;

export async function readManagedOpenRouterKeys(): Promise<
  ManagedOpenRouterKey[]
> {
  try {
    const content = await readFile(getOpenRouterKeysRegistryPath(), 'utf8');
    return managedOpenRouterKeysSchema.parse(JSON.parse(content));
  } catch {
    return [];
  }
}

export async function saveManagedOpenRouterKeys(
  keys: ManagedOpenRouterKey[]
): Promise<void> {
  const filePath = getOpenRouterKeysRegistryPath();
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(
    filePath,
    `${JSON.stringify(managedOpenRouterKeysSchema.parse(keys), null, 2)}\n`,
    'utf8'
  );
}

export async function upsertManagedOpenRouterKey(
  nextKey: ManagedOpenRouterKey
): Promise<ManagedOpenRouterKey[]> {
  const existing = await readManagedOpenRouterKeys();
  const nextKeys = existing.filter(
    (item) => item.appName.toLowerCase() !== nextKey.appName.toLowerCase()
  );
  nextKeys.push(nextKey);
  nextKeys.sort((left, right) => left.appName.localeCompare(right.appName));
  await saveManagedOpenRouterKeys(nextKeys);
  return nextKeys;
}
