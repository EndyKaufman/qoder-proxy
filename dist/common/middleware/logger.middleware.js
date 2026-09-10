"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoggerMiddleware = void 0;
const common_1 = require("@nestjs/common");
const log_store_service_1 = require("../../log-store/log-store.service");
let LoggerMiddleware = class LoggerMiddleware {
    constructor(logStoreService) {
        this.logStoreService = logStoreService;
    }
    use(req, res, next) {
        const start = Date.now();
        const requestPayload = req.body && Object.keys(req.body).length > 0 ? req.body : null;
        let responsePayload = null;
        let isStream = false;
        let streamText = '';
        let streamChunks = 0;
        const origJson = res.json.bind(res);
        res.json = (body) => {
            responsePayload = body;
            return origJson(body);
        };
        const origWrite = res.write.bind(res);
        res.write = (chunk, ...args) => {
            isStream = true;
            const raw = chunk.toString();
            for (const line of raw.split('\n')) {
                if (!line.startsWith('data: ') || line === 'data: [DONE]')
                    continue;
                try {
                    const d = JSON.parse(line.slice(6));
                    const delta = d.choices?.[0]?.delta?.content ??
                        d.choices?.[0]?.text ??
                        (typeof d.result === 'string' ? d.result : '') ??
                        '';
                    if (delta) {
                        streamText += delta;
                        streamChunks++;
                    }
                }
                catch {
                    /* ignore parse errors */
                }
            }
            return origWrite(chunk, ...args);
        };
        res.on('finish', () => {
            const ms = Date.now() - start;
            const ts = new Date().toISOString();
            const tag = isStream ? ' [stream]' : '';
            console.log(`[${ts}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)${tag}`);
            const path = req.path;
            const originalUrl = req.originalUrl;
            if (path.startsWith('/v1') ||
                path.startsWith('/api/chat') ||
                originalUrl.startsWith('/v1')) {
                this.logStoreService.addRequest({
                    method: req.method,
                    path: originalUrl,
                    statusCode: res.statusCode,
                    durationMs: ms,
                    isStream,
                    streamChunks: isStream ? streamChunks : undefined,
                    requestPayload,
                    responsePayload: isStream
                        ? streamText || null
                        : responsePayload,
                    error: res.statusCode >= 400
                        ? (responsePayload?.error ?? null)
                        : null,
                });
            }
        });
        next();
    }
};
exports.LoggerMiddleware = LoggerMiddleware;
exports.LoggerMiddleware = LoggerMiddleware = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [log_store_service_1.LogStoreService])
], LoggerMiddleware);
