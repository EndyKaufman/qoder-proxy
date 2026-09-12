"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var WebhookService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.WebhookService = void 0;
const common_1 = require("@nestjs/common");
/**
 * Sends webhook callbacks after request completion.
 * Retries up to 3 times with exponential backoff (1s, 5s, 25s).
 */
let WebhookService = WebhookService_1 = class WebhookService {
    async sendWebhook(url, payload) {
        for (let attempt = 0; attempt <= WebhookService_1.MAX_RETRIES; attempt++) {
            try {
                const controller = new AbortController();
                const timeout = setTimeout(() => controller.abort(), WebhookService_1.TIMEOUT_MS);
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
                console.warn(`[webhook] ${url} returned ${response.status} (attempt ${attempt + 1})`);
            }
            catch (err) {
                console.warn(`[webhook] ${url} failed (attempt ${attempt + 1}): ${err.message}`);
            }
            // Wait before retry (exponential backoff: 1s, 5s, 25s)
            if (attempt < WebhookService_1.MAX_RETRIES) {
                const delay = WebhookService_1.BASE_DELAY_MS * Math.pow(5, attempt);
                await this.sleep(delay);
            }
        }
        console.error(`[webhook] Failed to deliver to ${url} after ${WebhookService_1.MAX_RETRIES + 1} attempts`);
    }
    sleep(ms) {
        return new Promise((resolve) => setTimeout(resolve, ms));
    }
};
exports.WebhookService = WebhookService;
WebhookService.MAX_RETRIES = 3;
WebhookService.BASE_DELAY_MS = 1000;
WebhookService.TIMEOUT_MS = 30_000;
exports.WebhookService = WebhookService = WebhookService_1 = __decorate([
    (0, common_1.Injectable)()
], WebhookService);
