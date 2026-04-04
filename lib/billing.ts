/**
 * Billing helpers: pricing table, cost calculation, and daily summary types.
 * Prices are per 1,000 tokens (USD). Update when new model pricing is announced.
 */

// ── Pricing table ────────────────────────────────────────────────────────────

export interface ModelPrice {
  in: number;    // $ per 1k input tokens
  out: number;   // $ per 1k output tokens
  cache?: number; // $ per 1k cache-read tokens (optional)
}

/**
 * Known model pricing. Keys are the modelId as returned by the provider.
 * Ollama models have zero cost — they run locally.
 */
export const MODEL_PRICING: Record<string, ModelPrice> = {
  // Anthropic
  'claude-sonnet-4-6':         { in: 0.003,  out: 0.015,  cache: 0.0003  },
  'claude-opus-4-6':           { in: 0.015,  out: 0.075,  cache: 0.0015  },
  'claude-haiku-4-5':          { in: 0.0008, out: 0.004,  cache: 0.0001  },
  'claude-haiku-4-5-20251001': { in: 0.0008, out: 0.004,  cache: 0.0001  },
  'claude-3-5-sonnet-20241022':{ in: 0.003,  out: 0.015,  cache: 0.0003  },
  'claude-3-5-haiku-20241022': { in: 0.0008, out: 0.004,  cache: 0.0001  },

  // OpenAI
  'gpt-4o':       { in: 0.0025, out: 0.01   },
  'gpt-4o-mini':  { in: 0.00015,out: 0.0006 },
  'gpt-5.4':      { in: 0.003,  out: 0.015  },
  'o3':           { in: 0.01,   out: 0.04   },

  // OpenClaw internal routing models (free — cost tracked at underlying model level)
  'delivery-mirror':     { in: 0, out: 0 },
  'gateway-injected':    { in: 0, out: 0 },

  // Ollama (local — always free)
  'llama3.2:3b':         { in: 0, out: 0 },
  'qwen2.5-coder:32b':   { in: 0, out: 0 },
  'qwen2.5:32b':         { in: 0, out: 0 },
  'llama3.1:8b':         { in: 0, out: 0 },
  'mistral:7b':          { in: 0, out: 0 },
};

/** Return pricing for a model, falling back gracefully. */
export function getPricing(modelId: string): ModelPrice {
  if (MODEL_PRICING[modelId]) return MODEL_PRICING[modelId];

  // Prefix match for unknown ollama models (provider === 'ollama')
  if (modelId.includes(':') || modelId.startsWith('llama') ||
      modelId.startsWith('qwen') || modelId.startsWith('mistral') ||
      modelId.startsWith('phi') || modelId.startsWith('gemma')) {
    return { in: 0, out: 0 };
  }

  // Unknown paid model — warn and assume Sonnet-level pricing
  console.warn(`[billing] Unknown model "${modelId}" — defaulting to claude-sonnet-4-6 pricing`);
  return MODEL_PRICING['claude-sonnet-4-6'];
}

/**
 * Calculate cost from raw token counts.
 * If the JSONL already has a cost.total field, prefer that (it's more accurate).
 */
export function calcCost(
  modelId: string,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens = 0
): number {
  const p = getPricing(modelId);
  return (
    (inputTokens   / 1000) * p.in +
    (outputTokens  / 1000) * p.out +
    (cacheReadTokens / 1000) * (p.cache ?? 0)
  );
}

// ── Storage types ────────────────────────────────────────────────────────────

export interface DailySummary {
  totalUsd: number;
  sessions: number;
  /** Cost keyed by model ID */
  models: Record<string, number>;
}

/** The full billing-daily.json shape: date string → summary */
export type BillingDaily = Record<string, DailySummary>;

// ── Session type (parsed from JSONL) ─────────────────────────────────────────

export interface BillingSession {
  sessionId: string;
  startTime: string;       // ISO timestamp
  durationMs: number;
  model: string;           // primary model used
  provider: string;
  totalTokens: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  estimatedCostUsd: number;
  status: 'completed' | 'active' | 'error';
  messageCount: number;
}

// ── Alert types ──────────────────────────────────────────────────────────────

export interface BillingAlert {
  level: 'warning' | 'critical';
  message: string;
}

export const DAILY_WARN_USD   = 20;   // yellow
export const DAILY_CRIT_USD   = 50;   // red
export const MONTHLY_BUDGET   = Number(process.env.BILLING_MONTHLY_BUDGET ?? 300);

/** Build alerts from current spend figures. */
export function buildAlerts(todayUsd: number, monthUsd: number): BillingAlert[] {
  const alerts: BillingAlert[] = [];

  if (todayUsd >= DAILY_CRIT_USD) {
    alerts.push({ level: 'critical', message: `Daily spend $${todayUsd.toFixed(2)} exceeds $${DAILY_CRIT_USD} threshold` });
  } else if (todayUsd >= DAILY_WARN_USD) {
    alerts.push({ level: 'warning', message: `Daily spend $${todayUsd.toFixed(2)} exceeds $${DAILY_WARN_USD} threshold` });
  }

  const pct = (monthUsd / MONTHLY_BUDGET) * 100;
  if (pct >= 80) {
    alerts.push({ level: 'critical', message: `Monthly spend $${monthUsd.toFixed(2)} is ${pct.toFixed(0)}% of $${MONTHLY_BUDGET} budget` });
  }

  return alerts;
}
