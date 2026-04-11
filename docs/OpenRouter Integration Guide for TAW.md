# **OpenRouter Integration Guide for TAW (Terminal AI Workspace)**

TAW's architecture as a Node/TypeScript TUI requires a robust, abstracted provider layer. OpenRouter facilitates this by consolidating hundreds of models under a single OpenAI-compatible schema, while offering "Management Keys" for administrative automation.

## **1\. Authentication Strategy**

OpenRouter distinguishes between **Model Keys** (used for /chat/completions) and **Management Keys** (used for programmatic control).

* **Model Keys**: Standard Bearer tokens for inference.  
* **Management Keys**: Required for credit checks and programmatic key generation. You generate these at openrouter.ai/settings/keys under the "Management" section.

## **2\. Core Implementation: The OpenRouter Adapter**

Since TAW is TypeScript-based, the official @openrouter/sdk is the preferred path.

### **Model Inference with "Response Healing"**

"Response Healing" (OpenRouter's term for fixing common LLM formatting errors like unclosed JSON or truncated code blocks) is enabled via the plugins array or transforms.

import { OpenRouter } from '@openrouter/sdk';

const client \= new OpenRouter({  
  apiKey: process.env.OPENROUTER\_API\_KEY,  
});

async function getResearchDraft(prompt: string) {  
  const response \= await client.chat.send({  
    model: "anthropic/claude-3.5-sonnet",  
    messages: \[{ role: "user", content: prompt }\],  
    // OpenRouter Feature: Response Healing  
    plugins: \[{ id: "response-healing" }\],   
    // OpenRouter Feature: Fallbacks (try Sonnet, then GPT-4o)  
    models: \["anthropic/claude-3.5-sonnet", "openai/gpt-4o"\],  
  });

  return response.choices\[0\].message.content;  
}

## **3\. Administrative Workflows (Management API)**

For TAW's telemetry and session management, use a Management Key to monitor usage and costs.

### **Credit Tracking & Remaining Balance**

async function getRemainingCredits(mgmtKey: string) {  
  const res \= await fetch("\[https://openrouter.ai/api/v1/credits\](https://openrouter.ai/api/v1/credits)", {  
    headers: { "Authorization": \`Bearer ${mgmtKey}\` }  
  });  
  const data \= await res.json();  
  // data.total\_credits vs data.total\_usage  
  return data.data.total\_credits \- data.data.total\_usage;  
}

### **Real-time Cost Tracking per Session**

OpenRouter returns a cost field in the usage object of the response. This should be piped directly into TAW's telemetry.json.

// Inside your stream handler  
for await (const chunk of stream) {  
  if (chunk.usage) {  
    const sessionCost \= chunk.usage.cost; // USD value  
    const promptTokens \= chunk.usage.prompt\_tokens;  
    // Log to TAW telemetry  
    updateTelemetry(sessionCost, promptTokens);  
  }  
}

## **4\. Feature Implementation for TAW**

### **Tool Usage (for /search-source)**

OpenRouter standardizes tool calling across models. If a model doesn't natively support it, OpenRouter's "Auto-Exacto" or routing can often bridge the gap.

const tools \= \[  
  {  
    type: "function",  
    function: {  
      name: "search\_source",  
      description: "Search indexed sources in the session",  
      parameters: {  
        type: "object",  
        properties: { query: { type: "string" } }  
      }  
    }  
  }  
\];

// Usage in TAW  
const response \= await client.chat.send({  
  model: "openai/gpt-4o-mini",  
  messages: transcript,  
  tools,  
  tool\_choice: "auto"  
});

### **A/B Testing & Provider Routing**

In a research context, you might want to compare how two models summarize a source. OpenRouter allows you to specify provider preferences (e.g., "prefer Anthropic via AWS but fallback to Anthropic direct").

const abTestConfig \= {  
  model: "anthropic/claude-3-opus",  
  provider: {  
    order: \["Anthropic", "AWS", "GCP"\], // Sort by preference  
    allow\_fallbacks: true  
  }  
};

## **5\. Summary of TAW-Relevant Features**

| Feature | TAW Application | Implementation |
| :---- | :---- | :---- |
| **Response Healing** | Clean drafting in /finalize | Add plugins: \[{id: "response-healing"}\] |
| **Model Fallbacks** | Resilience during research sessions | Pass an array to models |
| **Middle-out Compression** | Managing large context in sources.json | Use transforms: \["middle-out"\] |
| **Credit API** | Status line UI in the TUI | Poll /api/v1/credits with Mgmt Key |
| **Usage Stats** | /telemetry file updates | Read usage.cost from response |

