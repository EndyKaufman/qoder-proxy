import * as crypto from 'crypto';

export interface AppConfig {
  PORT: number;
  API_KEY: string | null;
  CORS_ORIGIN: string;
  QODER_TIMEOUT_MS: number;
  QODER_MAX_OUTPUT_TOKENS: string;
  QODER_PAT: string | null;
  PUBLIC_BASE_URL: string | null;
  DASHBOARD_ENABLED: boolean;
  DASHBOARD_PASSWORD: string | null;
  DASHBOARD_SECRET: string;
  LOG_MAX_ENTRIES: number;
  LOG_BODY_MAX_BYTES: number;
}

export default (): AppConfig => ({
  PORT: parseInt(process.env.PORT || '') || 3000,
  API_KEY: process.env.PROXY_API_KEY || null,
  CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
  QODER_TIMEOUT_MS: parseInt(process.env.QODER_TIMEOUT_MS || '') || 120_000,
  QODER_MAX_OUTPUT_TOKENS: (() => {
    const v = (process.env.QODER_MAX_OUTPUT_TOKENS || '').trim().toLowerCase();
    return v === '16k' || v === '32k' ? v : '16k';
  })(),
  QODER_PAT:
    process.env.QODER_PERSONAL_ACCESS_TOKEN ||
    process.env.QODER_API_KEY ||
    null,
  PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || null,

  // Dashboard
  DASHBOARD_ENABLED: process.env.DASHBOARD_ENABLED !== 'false',
  DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || null,
  DASHBOARD_SECRET:
    process.env.DASHBOARD_SECRET ||
    crypto.randomBytes(32).toString('hex'),

  // Logging
  LOG_MAX_ENTRIES: parseInt(process.env.LOG_MAX_ENTRIES || '') || 500,
  LOG_BODY_MAX_BYTES: parseInt(process.env.LOG_BODY_MAX_BYTES || '') || 8192,
});
