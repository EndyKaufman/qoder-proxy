// ---------------------------------------------------------------------------
// Model catalogue
// ---------------------------------------------------------------------------

export interface ModelCatalogEntry {
  id: string;
  label: string;
  tier: 'free' | 'paid' | 'new';
  description: string;
}

/**
 * Full catalogue of qodercli models.
 *
 * `id`          — the exact value to pass to `--model`
 * `label`       — human-readable display name
 * `tier`        — 'free' | 'paid' | 'new'
 * `description` — brief explanation shown in /v1/models
 */
export const QODER_MODELS: ModelCatalogEntry[] = [
  // ── Assistant scene models ────────────────────────────────────────────────
  {
    id: 'auto',
    label: 'Auto (Smart Select)',
    tier: 'paid',
    description:
      'Paid tier — automatically selects the best model per task (default for paid plans).',
  },
  {
    id: 'ultimate',
    label: 'Ultimate (Best Quality)',
    tier: 'paid',
    description: 'Paid tier — top-tier model, maximum quality.',
  },
  {
    id: 'performance',
    label: 'Performance',
    tier: 'paid',
    description: 'Paid tier — high-performance model for demanding tasks.',
  },
  {
    id: 'qmodel',
    label: 'Qwen3.6-Plus',
    tier: 'new',
    description: 'New model — Qwen 3.6 Plus (Alibaba).',
  },
  // ── Quest scene models ────────────────────────────────────────────────────
  {
    id: 'kmodel',
    label: 'Kimi-K2.6',
    tier: 'new',
    description: 'New model — Kimi-K2.6 (Moonshot AI).',
  },
  {
    id: 'mmodel',
    label: 'MiniMax-M2.7',
    tier: 'new',
    description: 'New model — MiniMax-M2.7.',
  },
  {
    id: 'dmodel',
    label: 'DeepSeek-V4-Pro',
    tier: 'new',
    description: 'New model — DeepSeek V4 Pro, reasoning-capable.',
  },
  {
    id: 'dfmodel',
    label: 'DeepSeek-V4-Flash',
    tier: 'new',
    description: 'New model — DeepSeek V4 Flash, fast and lightweight.',
  },
  {
    id: 'gm51model',
    label: 'GLM-5.1',
    tier: 'new',
    description: 'New model — GLM-5.1 series (Zhipu AI), reasoning-capable.',
  },
];

/** Quick lookup: qodercli model id → catalogue entry */
export const QODER_MODEL_BY_ID: Record<string, ModelCatalogEntry> =
  Object.fromEntries(QODER_MODELS.map((m) => [m.id, m]));

/**
 * OpenAI-name → qodercli model id aliases.
 *
 * Mapping philosophy:
 *   - gpt-4o / gpt-4 class  → 'auto'  (best balanced paid tier)
 *   - gpt-4o-mini / 3.5     → 'auto'
 *   - claude-3.5-sonnet      → 'auto'
 *   - claude-3-haiku         → 'auto'
 *   - Direct qodercli names pass through unchanged.
 */
export const ALIAS_MAP: Record<string, string> = {
  // GPT-4 class → auto tier
  'gpt-4': 'auto',
  'gpt-4-turbo': 'auto',
  'gpt-4o': 'auto',
  o1: 'ultimate',
  'o1-mini': 'performance',
  'o3-mini': 'performance',
  // Lightweight → lite
  'gpt-4o-mini': 'auto',
  'gpt-3.5-turbo': 'auto',
  // Claude aliases
  'claude-3-opus': 'ultimate',
  'claude-3-sonnet': 'performance',
  'claude-3-haiku': 'auto',
  'claude-3.5-sonnet': 'auto',
  'claude-3.5-haiku': 'efficient',
  'claude-3.7-sonnet': 'auto',
  // Gemini aliases
  'gemini-pro': 'performance',
  'gemini-flash': 'efficient',
  // Friendly names for "new model" tier
  // Short convenience aliases → full model IDs
  qwen: 'qmodel',
  deepseek: 'dmodel',
  'deepseek-flash': 'dfmodel',
  'deepseek-v4': 'dmodel',
  'deepseek-v4-flash': 'dfmodel',
  glm: 'gm51model',
  kimi: 'kmodel',
  minimax: 'mmodel',
  deepseekv4pro: 'dmodel',
  deepseekv4flash: 'dfmodel',
  glm51: 'gm51model',
  qwen36plus: 'qmodel',
};

/**
 * Resolve an OpenAI model name (or any alias) to a qodercli --model value.
 *
 * Resolution order:
 *   1. Direct qodercli model id (auto, lite, ultimate, etc.) → pass through
 *   2. Known OpenAI/alias name → map to qodercli tier
 *   3. Partial match heuristics for common unknown model names
 *   4. Unknown → fall back to 'auto' with a console warning
 */
export const getModelMapping = (requestedModel?: string): string => {
  if (!requestedModel) return 'auto';

  // 1. Direct qodercli model id
  if (QODER_MODEL_BY_ID[requestedModel]) return requestedModel;

  // 2. Exact alias match
  if (ALIAS_MAP[requestedModel]) return ALIAS_MAP[requestedModel];

  // 3. Heuristic partial matching for model families
  const lower = requestedModel.toLowerCase();

  // Backward compatibility for old proxy model names.
  if (lower === 'lite') return 'auto';
  if (lower === 'efficient') return 'performance';

  // Claude family heuristics
  if (lower.includes('claude')) {
    if (lower.includes('opus')) return 'ultimate';
    if (lower.includes('haiku')) return 'auto';
    return 'auto';
  }
  // GPT-4 family
  if (lower.includes('gpt-4') || lower.includes('gpt4')) {
    if (lower.includes('mini')) return 'auto';
    return 'auto';
  }
  // GPT-3.5 family
  if (lower.includes('gpt-3') || lower.includes('gpt3')) return 'auto';
  // o1/o3 reasoning models
  if (/^o\d/.test(lower)) {
    if (lower.includes('mini')) return 'performance';
    return 'ultimate';
  }
  // Gemini family
  if (lower.includes('gemini')) {
    if (lower.includes('flash') || lower.includes('nano')) return 'efficient';
    return 'performance';
  }
  // Qwen family
  if (lower.includes('qwen')) return 'qmodel';
  // DeepSeek family
  if (lower.includes('deepseek')) {
    if (lower.includes('flash')) return 'dfmodel';
    return 'dmodel';
  }
  // Kimi / Moonshot
  if (lower.includes('kimi') || lower.includes('moonshot')) return 'kmodel';
  // GLM / Zhipu
  if (lower.includes('glm')) return 'gm51model';
  // MiniMax
  if (lower.includes('minimax')) return 'mmodel';

  if (lower.includes('deepseek-v4-pro')) return 'dmodel';
  if (lower.includes('deepseek-v4-flash')) return 'dfmodel';
  if (lower.includes('glm-5.1')) return 'gm51model';
  if (lower.includes('qwen-3.6-plus')) return 'qmodel';

  // 4. Unknown model — warn and fall back to auto
  console.warn(
    `[model] Unknown model "${requestedModel}" — falling back to "auto". Add an alias in ALIAS_MAP to suppress this warning.`,
  );
  return 'auto';
};
