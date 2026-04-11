export interface OpenRouterCredits {
  totalCredits: number | null;
  totalUsage: number | null;
  remainingCredits: number | null;
}

export interface OpenRouterApiKeyRecord {
  hash: string;
  label: string | null;
  name: string;
  disabled: boolean;
  limit: number | null;
  limitRemaining: number | null;
  limitReset: string | null;
  includeByokInLimit: boolean | null;
  usage: number | null;
  usageDaily: number | null;
  usageWeekly: number | null;
  usageMonthly: number | null;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
}

export interface CreateOpenRouterApiKeyInput {
  name: string;
  limit?: number;
  limitReset?: 'daily' | 'weekly' | 'monthly';
}

export interface UpdateOpenRouterApiKeyInput {
  name?: string;
  limit?: number;
  disabled?: boolean;
  limitReset?: 'daily' | 'weekly' | 'monthly';
}

export interface CreatedOpenRouterApiKey {
  record: OpenRouterApiKeyRecord;
  key: string | null;
}

export async function fetchOpenRouterCredits(
  managementKey: string
): Promise<OpenRouterCredits> {
  const response = await fetch('https://openrouter.ai/api/v1/credits', {
    headers: {
      Authorization: `Bearer ${managementKey}`
    }
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter credits fetch failed with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as {
    data?: {
      total_credits?: unknown;
      total_usage?: unknown;
    };
  };
  const totalCredits = numberOrNull(payload.data?.total_credits);
  const totalUsage = numberOrNull(payload.data?.total_usage);

  return {
    totalCredits,
    totalUsage,
    remainingCredits:
      totalCredits !== null && totalUsage !== null
        ? totalCredits - totalUsage
        : null
  };
}

export async function listOpenRouterApiKeys(
  managementKey: string
): Promise<OpenRouterApiKeyRecord[]> {
  const response = await fetch('https://openrouter.ai/api/v1/keys', {
    headers: managementHeaders(managementKey)
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter key list failed with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as { data?: unknown[] };
  return Array.isArray(payload.data) ? payload.data.map(parseApiKeyRecord) : [];
}

export async function getOpenRouterApiKey(
  managementKey: string,
  keyHash: string
): Promise<OpenRouterApiKeyRecord> {
  const response = await fetch(`https://openrouter.ai/api/v1/keys/${keyHash}`, {
    headers: managementHeaders(managementKey)
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter key fetch failed with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as { data?: unknown };
  return parseApiKeyRecord(payload.data);
}

export async function createOpenRouterApiKey(
  managementKey: string,
  input: CreateOpenRouterApiKeyInput
): Promise<CreatedOpenRouterApiKey> {
  const body: Record<string, unknown> = { name: input.name };
  if (input.limit != null) {
    body.limit = input.limit;
  }
  if (input.limitReset) {
    body.limit_reset = input.limitReset;
  }

  const response = await fetch('https://openrouter.ai/api/v1/keys', {
    method: 'POST',
    headers: managementHeaders(managementKey),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter key creation failed with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as {
    data?: unknown;
    key?: unknown;
  };

  return {
    record: parseApiKeyRecord(payload.data),
    key: typeof payload.key === 'string' ? payload.key : null
  };
}

export async function updateOpenRouterApiKey(
  managementKey: string,
  keyHash: string,
  input: UpdateOpenRouterApiKeyInput
): Promise<OpenRouterApiKeyRecord> {
  const body: Record<string, unknown> = {};

  if (input.name != null) {
    body.name = input.name;
  }
  if (input.limit != null) {
    body.limit = input.limit;
  }
  if (input.disabled != null) {
    body.disabled = input.disabled;
  }
  if (input.limitReset) {
    body.limit_reset = input.limitReset;
  }

  const response = await fetch(`https://openrouter.ai/api/v1/keys/${keyHash}`, {
    method: 'PATCH',
    headers: managementHeaders(managementKey),
    body: JSON.stringify(body)
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter key update failed with status ${response.status}.`
    );
  }

  const payload = (await response.json()) as { data?: unknown };
  return parseApiKeyRecord(payload.data);
}

export async function deleteOpenRouterApiKey(
  managementKey: string,
  keyHash: string
): Promise<void> {
  const response = await fetch(`https://openrouter.ai/api/v1/keys/${keyHash}`, {
    method: 'DELETE',
    headers: managementHeaders(managementKey)
  });

  if (!response.ok) {
    throw new Error(
      `OpenRouter key delete failed with status ${response.status}.`
    );
  }
}

function managementHeaders(managementKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${managementKey}`,
    'Content-Type': 'application/json'
  };
}

function parseApiKeyRecord(value: unknown): OpenRouterApiKeyRecord {
  const record =
    value && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};

  return {
    hash: stringOrEmpty(record.hash),
    label: stringOrNull(record.label),
    name: stringOrEmpty(record.name),
    disabled: booleanOrFalse(record.disabled),
    limit: numberOrNull(record.limit),
    limitRemaining: numberOrNull(record.limit_remaining),
    limitReset: stringOrNull(record.limit_reset),
    includeByokInLimit: booleanOrNull(record.include_byok_in_limit),
    usage: numberOrNull(record.usage),
    usageDaily: numberOrNull(record.usage_daily),
    usageWeekly: numberOrNull(record.usage_weekly),
    usageMonthly: numberOrNull(record.usage_monthly),
    createdAt: stringOrNull(record.created_at),
    updatedAt: stringOrNull(record.updated_at),
    expiresAt: stringOrNull(record.expires_at)
  };
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}

function stringOrNull(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

function stringOrEmpty(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function booleanOrFalse(value: unknown): boolean {
  return value === true;
}

function booleanOrNull(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}
