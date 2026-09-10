"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const crypto = __importStar(require("crypto"));
exports.default = () => ({
    PORT: parseInt(process.env.PORT || '') || 3000,
    API_KEY: process.env.PROXY_API_KEY || null,
    CORS_ORIGIN: process.env.CORS_ORIGIN || '*',
    QODER_TIMEOUT_MS: parseInt(process.env.QODER_TIMEOUT_MS || '') || 120_000,
    QODER_MAX_OUTPUT_TOKENS: (() => {
        const v = (process.env.QODER_MAX_OUTPUT_TOKENS || '').trim().toLowerCase();
        return v === '16k' || v === '32k' ? v : '16k';
    })(),
    QODER_PAT: process.env.QODER_PERSONAL_ACCESS_TOKEN ||
        process.env.QODER_API_KEY ||
        null,
    PUBLIC_BASE_URL: process.env.PUBLIC_BASE_URL || null,
    // Dashboard
    DASHBOARD_ENABLED: process.env.DASHBOARD_ENABLED !== 'false',
    DASHBOARD_PASSWORD: process.env.DASHBOARD_PASSWORD || null,
    DASHBOARD_SECRET: process.env.DASHBOARD_SECRET ||
        crypto.randomBytes(32).toString('hex'),
    // Logging
    LOG_MAX_ENTRIES: parseInt(process.env.LOG_MAX_ENTRIES || '') || 500,
    LOG_BODY_MAX_BYTES: parseInt(process.env.LOG_BODY_MAX_BYTES || '') || 8192,
});
