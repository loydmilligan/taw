import path from 'node:path';
import { readEnvVar, saveEnvVar } from '../services/config/env.js';
import {
  createOpenRouterApiKey,
  getOpenRouterApiKey,
  listOpenRouterApiKeys,
  updateOpenRouterApiKey,
  type OpenRouterApiKeyRecord
} from '../services/openrouter/management.js';
import {
  readManagedOpenRouterKeys,
  upsertManagedOpenRouterKey,
  type ManagedOpenRouterKey
} from '../services/openrouter/key-registry.js';
import { createId } from '../utils/ids.js';
import type { CommandDefinition } from './types.js';

type LimitReset = 'daily' | 'weekly' | 'monthly';

export const openRouterKeyCommand: CommandDefinition = {
  name: 'or-key',
  description: 'Create, rotate, and inspect managed OpenRouter app keys.',
  usage: '/or-key <setup|list|status|rotate|disable|enable|credits> [...]',
  async run(input, context) {
    const action = (input.args[0] ?? 'help').toLowerCase();
    const managementKey =
      context.globalConfig.providers.openrouter.managementApiKey ??
      process.env.OPENROUTER_MANAGEMENT_KEY;

    if (!managementKey) {
      return {
        entries: [
          {
            id: createId('or-key-missing-management-key'),
            kind: 'error' as const,
            title: 'Management Key Required',
            body: 'Set OPENROUTER_MANAGEMENT_KEY in ~/.config/taw/.env before using /or-key.'
          }
        ]
      };
    }

    if (action === 'setup') {
      return runSetup(input.args.slice(1), managementKey, context.cwd);
    }

    if (action === 'list') {
      return runList(managementKey);
    }

    if (action === 'status' || action === 'credits') {
      return runStatus(
        input.args.slice(1),
        managementKey,
        action === 'credits'
      );
    }

    if (action === 'rotate') {
      return runRotate(input.args.slice(1), managementKey);
    }

    if (action === 'disable' || action === 'enable') {
      return runSetDisabled(
        input.args.slice(1),
        managementKey,
        action === 'disable'
      );
    }

    return {
      entries: [
        {
          id: createId('or-key-help'),
          kind: 'notice' as const,
          title: 'OpenRouter Key Commands',
          body: usageBody()
        }
      ]
    };
  }
};

async function runSetup(args: string[], managementKey: string, cwd: string) {
  const appName = args[0]?.trim();
  const targetEnvPathArg = args[1]?.trim();
  const envVarName = normalizeEnvVarName(args[2]);
  const limit = parseOptionalLimit(args[3]);
  const limitReset = parseLimitReset(args[4]);

  if (!appName || !targetEnvPathArg) {
    return {
      entries: [
        {
          id: createId('or-key-setup-usage'),
          kind: 'notice' as const,
          title: 'OpenRouter Key Setup',
          body: [
            'TAW can create a project key, write it into the target .env, and track the key hash for later rotation.',
            '',
            'Questions to answer:',
            '1. App/project name?',
            '2. Which .env file should receive the key?',
            '3. Which env var should hold it? Default: OPENROUTER_API_KEY',
            '4. Optional spend limit?',
            '5. Optional reset cadence: daily, weekly, monthly',
            '',
            'Usage:',
            '/or-key setup "App Name" "/absolute/or/relative/path/.env" [ENV_VAR_NAME] [limit] [daily|weekly|monthly]',
            '',
            'Example:',
            `/or-key setup "new_openrouter_project" "${path.join(cwd, '.env')}" OPENROUTER_API_KEY 5 monthly`
          ].join('\n')
        }
      ]
    };
  }

  if (args[3] && limit == null) {
    return usageError('Limit must be a non-negative number.');
  }

  if (args[4] && !limitReset) {
    return usageError('Reset cadence must be daily, weekly, or monthly.');
  }

  const targetEnvPath = path.resolve(cwd, expandHome(targetEnvPathArg));
  const created = await createOpenRouterApiKey(managementKey, {
    name: appName,
    limit: limit ?? undefined,
    limitReset: limitReset ?? undefined
  });

  if (!created.key) {
    throw new Error(
      'OpenRouter returned key metadata but not the created key secret.'
    );
  }

  await saveEnvVar(targetEnvPath, envVarName, created.key);
  await upsertManagedOpenRouterKey(
    toManagedKey(created.record, appName, {
      targetEnvPath,
      envVarName,
      lastRotatedAt: null
    })
  );

  return {
    entries: [
      {
        id: createId('or-key-setup'),
        kind: 'notice' as const,
        title: 'OpenRouter Key Installed',
        body: [
          `App: ${appName}`,
          `Target Env: ${targetEnvPath}`,
          `Env Var: ${envVarName}`,
          `Key Label: ${created.record.label ?? 'n/a'}`,
          `Key Hash: ${shortHash(created.record.hash)}`,
          `Disabled: ${created.record.disabled ? 'yes' : 'no'}`,
          created.record.limit != null
            ? `Limit: $${created.record.limit.toFixed(2)}`
            : 'Limit: none',
          created.record.limitRemaining != null
            ? `Limit Remaining: $${created.record.limitRemaining.toFixed(6)}`
            : 'Limit Remaining: n/a',
          created.record.limitReset
            ? `Limit Reset: ${created.record.limitReset}`
            : 'Limit Reset: none',
          'The secret was written directly to the target .env and was not printed in TAW.'
        ].join('\n')
      }
    ]
  };
}

async function runList(managementKey: string) {
  const [managedKeys, remoteKeys] = await Promise.all([
    readManagedOpenRouterKeys(),
    listOpenRouterApiKeys(managementKey)
  ]);
  const remoteByHash = new Map(remoteKeys.map((item) => [item.hash, item]));

  if (managedKeys.length === 0) {
    return {
      entries: [
        {
          id: createId('or-key-list-empty'),
          kind: 'notice' as const,
          title: 'Managed OpenRouter Keys',
          body: 'No managed app keys yet. Use /or-key setup "App" "/path/.env" to create one.'
        }
      ]
    };
  }

  return {
    entries: [
      {
        id: createId('or-key-list'),
        kind: 'notice' as const,
        title: 'Managed OpenRouter Keys',
        body: managedKeys
          .map((item, index) => {
            const remote = remoteByHash.get(item.keyHash);
            return [
              `${index + 1}. ${item.appName}`,
              `   label ${item.keyLabel ?? 'n/a'} | ${remote ? (remote.disabled ? 'disabled' : 'active') : 'missing remotely'}`,
              `   env ${item.targetEnvPath} :: ${item.envVarName}`,
              remote?.limitRemaining != null
                ? `   remaining $${remote.limitRemaining.toFixed(6)} of $${(remote.limit ?? 0).toFixed(2)}`
                : '   remaining n/a'
            ].join('\n');
          })
          .join('\n')
      }
    ]
  };
}

async function runStatus(
  args: string[],
  managementKey: string,
  creditsOnly: boolean
) {
  const target = args.join(' ').trim();
  if (!target) {
    return usageError(
      creditsOnly
        ? 'Usage: /or-key credits <app-name|index>'
        : 'Usage: /or-key status <app-name|index>'
    );
  }

  const managed = await resolveManagedKey(target);
  if (!managed) {
    return usageError(`Managed key not found for "${target}".`);
  }

  const remote = await getOpenRouterApiKey(managementKey, managed.keyHash);
  const envValue = await readEnvVar(managed.targetEnvPath, managed.envVarName);
  await upsertManagedOpenRouterKey(
    toManagedKey(remote, managed.appName, {
      targetEnvPath: managed.targetEnvPath,
      envVarName: managed.envVarName,
      lastRotatedAt: managed.lastRotatedAt
    })
  );

  return {
    entries: [
      {
        id: createId(creditsOnly ? 'or-key-credits' : 'or-key-status'),
        kind: 'notice' as const,
        title: creditsOnly ? 'Key Limit Remaining' : 'OpenRouter Key Status',
        body: creditsOnly
          ? buildCreditsBody(managed.appName, remote)
          : [
              `App: ${managed.appName}`,
              `Remote Name: ${remote.name}`,
              `Key Label: ${remote.label ?? managed.keyLabel ?? 'n/a'}`,
              `Key Hash: ${shortHash(remote.hash)}`,
              `Status: ${remote.disabled ? 'disabled' : 'active'}`,
              `Target Env: ${managed.targetEnvPath}`,
              `Env Var: ${managed.envVarName}`,
              `Env Present: ${envValue ? 'yes' : 'no'}`,
              `Limit: ${remote.limit != null ? `$${remote.limit.toFixed(2)}` : 'none'}`,
              `Limit Remaining: ${remote.limitRemaining != null ? `$${remote.limitRemaining.toFixed(6)}` : 'n/a'}`,
              `Usage: ${remote.usage != null ? `$${remote.usage.toFixed(6)}` : 'n/a'}`,
              `Limit Reset: ${remote.limitReset ?? 'none'}`,
              `Created: ${remote.createdAt ?? 'n/a'}`,
              `Updated: ${remote.updatedAt ?? 'n/a'}`,
              remote.expiresAt
                ? `Expires: ${remote.expiresAt}`
                : 'Expires: none',
              'TAW can verify that the env var exists, but it does not keep a plaintext backup of the key for exact drift comparison.'
            ].join('\n')
      }
    ]
  };
}

async function runRotate(args: string[], managementKey: string) {
  const target = args[0]?.trim();
  if (!target) {
    return usageError(
      'Usage: /or-key rotate <app-name|index> [limit] [daily|weekly|monthly]'
    );
  }

  const managed = await resolveManagedKey(target);
  if (!managed) {
    return usageError(`Managed key not found for "${target}".`);
  }

  const current = await getOpenRouterApiKey(managementKey, managed.keyHash);
  const limit =
    args[1] != null
      ? parseOptionalLimit(args[1])
      : (current.limit ?? managed.limit);
  if (args[1] != null && limit == null) {
    return usageError('Limit must be a non-negative number.');
  }

  const limitReset =
    args[2] != null
      ? parseLimitReset(args[2])
      : (parseLimitReset(current.limitReset) ??
        parseLimitReset(managed.limitReset));
  if (args[2] != null && !limitReset) {
    return usageError('Reset cadence must be daily, weekly, or monthly.');
  }

  const created = await createOpenRouterApiKey(managementKey, {
    name: managed.remoteName || managed.appName,
    limit: limit ?? undefined,
    limitReset: limitReset ?? undefined
  });

  if (!created.key) {
    throw new Error(
      'OpenRouter returned key metadata but not the rotated key secret.'
    );
  }

  await saveEnvVar(managed.targetEnvPath, managed.envVarName, created.key);
  await updateOpenRouterApiKey(managementKey, managed.keyHash, {
    disabled: true
  });
  await upsertManagedOpenRouterKey(
    toManagedKey(created.record, managed.appName, {
      targetEnvPath: managed.targetEnvPath,
      envVarName: managed.envVarName,
      lastRotatedAt: new Date().toISOString()
    })
  );

  return {
    entries: [
      {
        id: createId('or-key-rotate'),
        kind: 'notice' as const,
        title: 'OpenRouter Key Rotated',
        body: [
          `App: ${managed.appName}`,
          `Target Env: ${managed.targetEnvPath}`,
          `Old Key: ${shortHash(managed.keyHash)} disabled`,
          `New Key: ${shortHash(created.record.hash)}`,
          `Key Label: ${created.record.label ?? 'n/a'}`,
          created.record.limitRemaining != null
            ? `Limit Remaining: $${created.record.limitRemaining.toFixed(6)}`
            : 'Limit Remaining: n/a'
        ].join('\n')
      }
    ]
  };
}

async function runSetDisabled(
  args: string[],
  managementKey: string,
  disabled: boolean
) {
  const target = args.join(' ').trim();
  if (!target) {
    return usageError(
      `Usage: /or-key ${disabled ? 'disable' : 'enable'} <app-name|index>`
    );
  }

  const managed = await resolveManagedKey(target);
  if (!managed) {
    return usageError(`Managed key not found for "${target}".`);
  }

  const updated = await updateOpenRouterApiKey(managementKey, managed.keyHash, {
    disabled
  });
  await upsertManagedOpenRouterKey(
    toManagedKey(updated, managed.appName, {
      targetEnvPath: managed.targetEnvPath,
      envVarName: managed.envVarName,
      lastRotatedAt: managed.lastRotatedAt
    })
  );

  return {
    entries: [
      {
        id: createId(disabled ? 'or-key-disable' : 'or-key-enable'),
        kind: 'notice' as const,
        title: disabled ? 'OpenRouter Key Disabled' : 'OpenRouter Key Enabled',
        body: [
          `App: ${managed.appName}`,
          `Key Hash: ${shortHash(updated.hash)}`,
          `Status: ${updated.disabled ? 'disabled' : 'active'}`
        ].join('\n')
      }
    ]
  };
}

function buildCreditsBody(
  appName: string,
  remote: OpenRouterApiKeyRecord
): string {
  if (remote.limit == null) {
    return [
      `App: ${appName}`,
      'This key does not have a spend limit, so per-key remaining credit is not available.',
      remote.usage != null ? `Observed Usage: $${remote.usage.toFixed(6)}` : ''
    ]
      .filter(Boolean)
      .join('\n');
  }

  return [
    `App: ${appName}`,
    `Key Limit: $${remote.limit.toFixed(2)}`,
    `Remaining: ${remote.limitRemaining != null ? `$${remote.limitRemaining.toFixed(6)}` : 'n/a'}`,
    `Usage: ${remote.usage != null ? `$${remote.usage.toFixed(6)}` : 'n/a'}`,
    `Reset: ${remote.limitReset ?? 'none'}`
  ].join('\n');
}

async function resolveManagedKey(
  target: string
): Promise<ManagedOpenRouterKey | null> {
  const keys = await readManagedOpenRouterKeys();
  const index = Number(target);
  if (Number.isInteger(index) && index >= 1) {
    return keys[index - 1] ?? null;
  }

  const normalized = target.toLowerCase();
  return (
    keys.find((item) => item.appName.toLowerCase() === normalized) ??
    keys.find((item) => item.keyHash.startsWith(target)) ??
    null
  );
}

function toManagedKey(
  remote: OpenRouterApiKeyRecord,
  appName: string,
  options: {
    targetEnvPath: string;
    envVarName: string;
    lastRotatedAt: string | null;
  }
): ManagedOpenRouterKey {
  return {
    appName,
    targetEnvPath: options.targetEnvPath,
    envVarName: options.envVarName,
    keyHash: remote.hash,
    keyLabel: remote.label,
    remoteName: remote.name || appName,
    disabled: remote.disabled,
    limit: remote.limit,
    limitRemaining: remote.limitRemaining,
    limitReset: remote.limitReset,
    usage: remote.usage,
    createdAt: remote.createdAt,
    updatedAt: remote.updatedAt,
    expiresAt: remote.expiresAt,
    lastRotatedAt: options.lastRotatedAt
  };
}

function parseOptionalLimit(value: string | undefined): number | null {
  if (!value) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }

  return parsed;
}

function parseLimitReset(value: string | null | undefined): LimitReset | null {
  if (!value) {
    return null;
  }

  if (value === 'daily' || value === 'weekly' || value === 'monthly') {
    return value;
  }

  return null;
}

function normalizeEnvVarName(value: string | undefined): string {
  return value?.trim() || 'OPENROUTER_API_KEY';
}

function usageBody(): string {
  return [
    'Usage:',
    '/or-key setup "App Name" "/path/to/.env" [ENV_VAR_NAME] [limit] [daily|weekly|monthly]',
    '/or-key list',
    '/or-key status <app-name|index>',
    '/or-key credits <app-name|index>',
    '/or-key rotate <app-name|index> [limit] [daily|weekly|monthly]',
    '/or-key disable <app-name|index>',
    '/or-key enable <app-name|index>'
  ].join('\n');
}

function usageError(body: string) {
  return {
    entries: [
      {
        id: createId('or-key-usage-error'),
        kind: 'error' as const,
        title: 'OpenRouter Key Command',
        body
      }
    ]
  };
}

function shortHash(value: string): string {
  return value.length > 12 ? `${value.slice(0, 12)}...` : value;
}

function expandHome(value: string): string {
  if (value === '~') {
    return process.env.HOME ?? value;
  }

  if (value.startsWith('~/')) {
    return path.join(process.env.HOME ?? '~', value.slice(2));
  }

  return value;
}
