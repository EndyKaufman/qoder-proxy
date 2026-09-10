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
exports.LogStoreService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const uuid_1 = require("uuid");
let LogStoreService = class LogStoreService {
    constructor(configService) {
        this.configService = configService;
        this.requestLog = [];
        this.systemLog = [];
    }
    get maxEntries() {
        return this.configService.get('LOG_MAX_ENTRIES') || 500;
    }
    get maxBytes() {
        return this.configService.get('LOG_BODY_MAX_BYTES') || 8192;
    }
    truncate(val) {
        if (val == null)
            return null;
        const str = typeof val === 'string' ? val : JSON.stringify(val);
        if (str.length > this.maxBytes)
            return str.slice(0, this.maxBytes) + '…[truncated]';
        return typeof val === 'string' ? val : val;
    }
    addRequest(entry) {
        if (this.requestLog.length >= this.maxEntries)
            this.requestLog.shift();
        this.requestLog.push({
            id: (0, uuid_1.v4)(),
            timestamp: new Date().toISOString(),
            ...entry,
            requestPayload: this.truncate(entry.requestPayload),
            responsePayload: this.truncate(entry.responsePayload),
        });
    }
    addSystem(message, level = 'info', source = 'server') {
        if (this.systemLog.length >= this.maxEntries)
            this.systemLog.shift();
        this.systemLog.push({
            id: (0, uuid_1.v4)(),
            timestamp: new Date().toISOString(),
            level,
            source,
            message,
        });
        const tag = level === 'error' ? '✖' : level === 'warn' ? '⚠' : '·';
        console.log(`[${source}] ${tag} ${message}`);
    }
    getRequests() {
        return [...this.requestLog].reverse();
    }
    getSystem() {
        return [...this.systemLog].reverse();
    }
    clearRequests() {
        this.requestLog.length = 0;
    }
    clearSystem() {
        this.systemLog.length = 0;
    }
};
exports.LogStoreService = LogStoreService;
exports.LogStoreService = LogStoreService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], LogStoreService);
