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
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
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
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.QoderCliService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const child_process_1 = require("child_process");
const fs = __importStar(require("fs"));
const log_store_service_1 = require("../log-store/log-store.service");
const isBenignQoderStderr = (text) => {
    if (!text)
        return false;
    return (text.includes('failed to asynchronously prepare wasm') ||
        text.includes('function="_abort_js"') ||
        text.includes('Aborted(LinkError: WebAssembly.instantiate()'));
};
let QoderCliService = class QoderCliService {
    constructor(configService, logStoreService) {
        this.configService = configService;
        this.logStoreService = logStoreService;
    }
    qoderEnv() {
        const pat = this.configService.get('QODER_PAT');
        return {
            ...process.env,
            ...(pat ? { QODER_PERSONAL_ACCESS_TOKEN: pat } : {}),
            NO_BROWSER: '1',
            CI: '1',
            HOME: process.env.HOME || '/root',
        };
    }
    getQoderCliCommand() {
        if (process.platform === 'win32')
            return { cmd: 'qodercli.cmd', viaCmd: true };
        if (process.env.QODERCLI_BIN)
            return { cmd: process.env.QODERCLI_BIN, viaCmd: false };
        const candidates = [
            '/usr/local/bin/qodercli',
            '/usr/bin/qodercli',
            'qodercli',
        ];
        for (const c of candidates) {
            if (c.includes('/') && fs.existsSync(c))
                return { cmd: c, viaCmd: false };
        }
        return { cmd: 'qodercli', viaCmd: false };
    }
    spawnQoderCli(prompt, model, flags = []) {
        const qoder = this.getQoderCliCommand();
        if (process.platform === 'win32') {
            const safePrompt = prompt
                .replace(/"/g, '\\"')
                .replace(/[&|<>^]/g, '^$&');
            const args = ['/c', qoder.cmd, '-p', safePrompt, '-f', 'stream-json'];
            if (model)
                args.push('--model', model);
            if (flags.length)
                args.push(...flags);
            return (0, child_process_1.spawn)('cmd.exe', args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: this.qoderEnv(),
            });
        }
        else {
            const args = ['-p', prompt, '-f', 'stream-json'];
            if (model)
                args.push('--model', model);
            if (flags.length)
                args.push(...flags);
            return (0, child_process_1.spawn)(qoder.cmd, args, {
                stdio: ['ignore', 'pipe', 'pipe'],
                env: this.qoderEnv(),
            });
        }
    }
    hasVisibleAssistantText(data) {
        const content = data?.message?.content;
        if (typeof content === 'string')
            return content.trim().length > 0;
        if (!Array.isArray(content))
            return false;
        return content.some((part) => {
            if (!part)
                return false;
            if (typeof part.text === 'string' && part.text.trim())
                return true;
            if (typeof part.value === 'string' && part.value.trim())
                return true;
            return false;
        });
    }
    deepFindText(value, depth = 0) {
        if (depth > 6 || value == null)
            return '';
        if (typeof value === 'string')
            return value.trim();
        if (Array.isArray(value)) {
            for (const item of value) {
                const t = this.deepFindText(item, depth + 1);
                if (t)
                    return t;
            }
            return '';
        }
        if (typeof value === 'object') {
            const priorityKeys = [
                'text', 'value', 'result', 'output', 'content', 'message', 'final', 'answer',
            ];
            for (const key of priorityKeys) {
                if (Object.prototype.hasOwnProperty.call(value, key)) {
                    const t = this.deepFindText(value[key], depth + 1);
                    if (t)
                        return t;
                }
            }
            // Fallback: recurse into all own properties
            for (const key of Object.keys(value)) {
                if (!priorityKeys.includes(key)) {
                    const t = this.deepFindText(value[key], depth + 1);
                    if (t)
                        return t;
                }
            }
        }
        return '';
    }
    extractEventText(data) {
        if (!data || typeof data !== 'object')
            return '';
        const msg = data.message;
        const msgContent = msg?.content;
        if (typeof msgContent === 'string' && msgContent.trim())
            return msgContent;
        if (Array.isArray(msgContent)) {
            const joined = msgContent
                .map((part) => {
                if (!part)
                    return '';
                if (typeof part === 'string')
                    return part;
                if (typeof part.text === 'string')
                    return part.text;
                if (typeof part.value === 'string')
                    return part.value;
                if (typeof part.text?.value === 'string')
                    return part.text.value;
                return '';
            })
                .join('');
            if (joined.trim())
                return joined;
        }
        if (typeof data.result === 'string' && data.result.trim())
            return data.result;
        if (data.result && typeof data.result === 'object') {
            const r = data.result;
            if (typeof r.text === 'string' && r.text.trim())
                return r.text;
            if (typeof r.value === 'string' && r.value.trim())
                return r.value;
            if (typeof r.text?.value === 'string' &&
                r.text.value.trim()) {
                return r.text.value;
            }
        }
        return this.deepFindText(data);
    }
    runQoderRequest(opts) {
        const { prompt, model, flags = [], timeoutMs = 120_000, onChunk, onDone, onError, } = opts;
        let buffer = '';
        let stderrOutput = '';
        let settled = false;
        let timeoutHandle;
        let sawAssistantMessage = false;
        let lastSyntheticText = '';
        const settle = (fn) => {
            if (settled)
                return;
            settled = true;
            if (timeoutHandle)
                clearTimeout(timeoutHandle);
            fn();
        };
        const child = this.spawnQoderCli(prompt, model, flags);
        child.on('error', (err) => {
            console.error('[qodercli error]', err.message);
        });
        if (timeoutMs > 0) {
            timeoutHandle = setTimeout(() => {
                child.kill();
                settle(() => onError(Object.assign(new Error(`qodercli timed out after ${timeoutMs}ms`), { code: 'TIMEOUT' })));
            }, timeoutMs);
        }
        child.stdout.on('data', (chunk) => {
            buffer += chunk.toString();
            const lines = buffer.split('\n');
            buffer = lines.pop() ?? '';
            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed)
                    continue;
                try {
                    const data = JSON.parse(trimmed);
                    if (data.type === 'assistant' &&
                        (data.subtype === 'message' || data.message?.type === 'message')) {
                        if (this.hasVisibleAssistantText(data))
                            sawAssistantMessage = true;
                        onChunk(data);
                    }
                    else {
                        const fallbackText = this.extractEventText(data);
                        if (!fallbackText || sawAssistantMessage)
                            continue;
                        if (fallbackText === lastSyntheticText)
                            continue;
                        lastSyntheticText = fallbackText;
                        onChunk({
                            type: 'assistant',
                            subtype: 'message',
                            message: {
                                content: [{ type: 'text', text: fallbackText }],
                            },
                        });
                    }
                }
                catch {
                    if (trimmed && !trimmed.startsWith('{')) {
                        onChunk({
                            type: 'assistant',
                            subtype: 'message',
                            message: {
                                content: [{ type: 'text', text: trimmed }],
                            },
                        });
                    }
                }
            }
        });
        child.stdout.on('end', () => {
            const trimmed = buffer.trim();
            if (!trimmed)
                return;
            try {
                const data = JSON.parse(trimmed);
                if (data.type === 'assistant' &&
                    (data.subtype === 'message' || data.message?.type === 'message')) {
                    if (this.hasVisibleAssistantText(data))
                        sawAssistantMessage = true;
                    onChunk(data);
                }
                else {
                    const fallbackText = this.extractEventText(data);
                    if (!fallbackText || sawAssistantMessage)
                        return;
                    if (fallbackText === lastSyntheticText)
                        return;
                    lastSyntheticText = fallbackText;
                    onChunk({
                        type: 'assistant',
                        subtype: 'message',
                        message: {
                            content: [{ type: 'text', text: fallbackText }],
                        },
                    });
                }
            }
            catch {
                if (!trimmed.startsWith('{')) {
                    onChunk({
                        type: 'assistant',
                        subtype: 'message',
                        message: {
                            content: [{ type: 'text', text: trimmed }],
                        },
                    });
                }
            }
        });
        child.stderr.on('data', (chunk) => {
            const text = chunk.toString().trim();
            stderrOutput += text + '\n';
            if (!isBenignQoderStderr(text)) {
                this.logStoreService.addSystem(text, 'error', 'qodercli-stderr');
            }
        });
        child.on('close', (code, signal) => {
            const finalCode = code ?? (signal ? -1 : 0);
            const finalStderr = signal
                ? `${stderrOutput.trim()}${stderrOutput.trim() ? '\n' : ''}Process terminated by signal: ${signal}`
                : stderrOutput.trim();
            settle(() => onDone(finalCode, finalStderr));
        });
        child.on('error', (err) => {
            this.logStoreService.addSystem(err.message, 'error', 'qodercli-spawn');
            settle(() => onError(err));
        });
        return child;
    }
    checkQoderCli() {
        return new Promise((resolve) => {
            let stdout = '';
            let stderr = '';
            let done = false;
            const finish = (val) => {
                if (!done) {
                    done = true;
                    resolve(val);
                }
            };
            const qoder = this.getQoderCliCommand();
            if (process.platform !== 'win32' &&
                qoder.cmd.includes('/') &&
                fs.existsSync(qoder.cmd)) {
                return finish('available');
            }
            const child = process.platform === 'win32'
                ? (0, child_process_1.spawn)('cmd.exe', ['/c', qoder.cmd, '--help'], {
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: this.qoderEnv(),
                })
                : (0, child_process_1.spawn)(qoder.cmd, ['--help'], {
                    stdio: ['ignore', 'pipe', 'pipe'],
                    env: this.qoderEnv(),
                });
            child.stdout.on('data', (d) => (stdout += d.toString()));
            child.stderr.on('data', (d) => (stderr += d.toString()));
            child.on('close', (code) => {
                const output = (stdout || stderr).trim();
                finish(output || code !== null ? 'available' : null);
            });
            child.on('error', (err) => {
                finish(err.code === 'ENOENT' ? null : 'installed');
            });
            setTimeout(() => {
                child.kill();
                finish('timeout');
            }, 8000);
        });
    }
};
exports.QoderCliService = QoderCliService;
exports.QoderCliService = QoderCliService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        log_store_service_1.LogStoreService])
], QoderCliService);
