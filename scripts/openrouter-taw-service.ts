/**
 * TAW OpenRouter Service
 * * Provides:
 * - Managed model switching for A/B testing
 * - Credit & Usage accounting via Management API
 * - Response Healing for cleaner research drafts
 */

import { OpenRouter } from '@openrouter/sdk';

export interface TAWUsageStats {
  cost: number;
  prompt_tokens: number;
  completion_tokens: number;
}

export class OpenRouterService {
  private client: OpenRouter;
  private modelKey: string;
  private mgmtKey: string;

  constructor(modelKey: string, mgmtKey: string) {
    this.modelKey = modelKey;
    this.mgmtKey = mgmtKey;
    this.client = new OpenRouter({ apiKey: modelKey });
  }

  /**
   * Executes a research completion with OpenRouter-specific optimizations.
   * * @param messages - Current session transcript
   * @param options - TAW specific settings like A/B testing or specific model overrides
   */
  async requestResearch(
    messages: any[], 
    options: { abTest?: boolean; modelOverride?: string } = {}
  ) {
    // A/B Testing: Logic to toggle between research-heavy models
    const primaryModel = options.modelOverride || "anthropic/claude-3.5-sonnet";
    const fallbackModel = "openai/gpt-4o";

    const response = await this.client.chat.send({
      model: options.abTest ? fallbackModel : primaryModel,
      messages,
      // OpenRouter Feature: Reliability
      models: [primaryModel, fallbackModel],
      // OpenRouter Feature: Response Healing (JSON/Markdown repair)
      plugins: [{ id: "response-healing" }],
      // Metadata for OpenRouter dashboard
      headers: {
        "HTTP-Referer": "https://github.com/user/taw",
        "X-OpenRouter-Title": "TAW AI Workspace"
      }
    });

    return {
      content: response.choices[0].message.content,
      usage: {
        cost: response.usage?.cost || 0,
        prompt: response.usage?.prompt_tokens || 0,
        completion: response.usage?.completion_tokens || 0
      }
    };
  }

  /**
   * Fetches remaining credits via Management API.
   * TAW should poll this on session start and after major operations.
   */
  async getRemainingCredits(): Promise<number> {
    try {
      const res = await fetch("https://openrouter.ai/api/v1/credits", {
        headers: { "Authorization": `Bearer ${this.mgmtKey}` }
      });
      const json = await res.json();
      
      // Credit = Purchased - Usage
      return (json.data?.total_credits ?? 0) - (json.data?.total_usage ?? 0);
    } catch (err) {
      // Log failure silently to TAW telemetry or throw if critical
      return 0;
    }
  }

  /**
   * Generates a unique API key for a specific research project.
   * Useful for TAW sessions that need isolated billing/tracking.
   */
  async createProjectKey(projectName: string, limit: number = 1.00) {
    const res = await fetch("https://openrouter.ai/api/v1/keys", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${this.mgmtKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ name: `TAW-${projectName}`, limit })
    });
    return res.json();
  }
}
