import { Injectable } from '@nestjs/common';

export interface WebhookPayload {
  status: 'success' | 'error';
  model: string;
  response?: string;
  error?: string;
  duration_ms: number;
  timestamp: string;
}

/**
 * Sends webhook callbacks after request completion.
 * Retries up to 3 times with exponential backoff (1s, 5s, 25s).
 */
@Injectable()
export class WebhookService {
  private static readonly MAX_RETRIES = 3;
  private static readonly BASE_DELAY_MS = 1000;
  private static readonly TIMEOUT_MS = 30_000;

  async sendWebhook(url: string, payload: WebhookPayload): Promise<void> {
    for (let attempt = 0; attempt <= WebhookService.MAX_RETRIES; attempt++) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), WebhookService.TIMEOUT_MS);

        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (response.ok) {
          console.log(`[webhook] Delivered to ${url} (attempt ${attempt + 1})`);
          return;
        }

        console.warn(
          `[webhook] ${url} returned ${response.status} (attempt ${attempt + 1})`,
        );
      } catch (err: any) {
        console.warn(
          `[webhook] ${url} failed (attempt ${attempt + 1}): ${err.message}`,
        );
      }

      // Wait before retry (exponential backoff: 1s, 5s, 25s)
      if (attempt < WebhookService.MAX_RETRIES) {
        const delay = WebhookService.BASE_DELAY_MS * Math.pow(5, attempt);
        await this.sleep(delay);
      }
    }

    console.error(`[webhook] Failed to deliver to ${url} after ${WebhookService.MAX_RETRIES + 1} attempts`);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}
