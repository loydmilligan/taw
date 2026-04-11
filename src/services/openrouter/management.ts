export interface OpenRouterCredits {
  totalCredits: number | null;
  totalUsage: number | null;
  remainingCredits: number | null;
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

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' ? value : null;
}
