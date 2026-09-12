import type { PluginFiles } from '../plugin-storage/plugin-storage.models';

// ---------------------------------------------------------------------------
// Fix loop types
// ---------------------------------------------------------------------------

export interface FixLoopResult {
  success: boolean;
  files?: PluginFiles;
  prompt?: string;
  attemptsUsed: number;
  reason?: string;
}

// ---------------------------------------------------------------------------
// Fix loop logic
// ---------------------------------------------------------------------------

/**
 * Determine the fix/regen prompts for the auto-correction cycle.
 *
 * Cycle: 3 fix attempts (send errors back to AI) -> 3 full regenerations -> refuse.
 *
 * This function does NOT spawn qodercli — it only prepares the prompts.
 * The caller (PluginCreationService) is responsible for spawning.
 */
export function runFixLoop(
  originalPrompt: string,
  errors: string[],
  maxFixAttempts: number = 3,
  maxRegenAttempts: number = 3,
): { prompts: Array<{ type: 'fix' | 'regen'; prompt: string }>; totalAttempts: number } {
  const prompts: Array<{ type: 'fix' | 'regen'; prompt: string }> = [];
  const errorText = errors.join('\n');

  // Fix attempts: send errors back to AI
  for (let i = 0; i < maxFixAttempts; i++) {
    prompts.push({
      type: 'fix',
      prompt: `Fix the following errors in the plugin you created:\n\nErrors:\n${errorText}\n\nOriginal request: ${originalPrompt}\n\nPlease fix these issues and provide corrected files.`,
    });
  }

  // Regen attempts: full regeneration with clean context
  for (let i = 0; i < maxRegenAttempts; i++) {
    prompts.push({
      type: 'regen',
      prompt: `The previous plugin creation failed after multiple fix attempts. Please create the plugin from scratch.\n\nOriginal request: ${originalPrompt}\n\nPrevious errors were:\n${errorText}\n\nStart fresh and create all files correctly.`,
    });
  }

  return { prompts, totalAttempts: maxFixAttempts + maxRegenAttempts };
}

/**
 * Build the refusal message when all fix/regen attempts are exhausted.
 */
export function buildRefusalMessage(originalPrompt: string): string {
  return (
    `Failed to create the plugin after all attempts (3 fix + 3 regeneration). ` +
    `Please rephrase your request and try again.\n\n` +
    `Original request: ${originalPrompt}`
  );
}
