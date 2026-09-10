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
exports.DashboardAuthGuard = exports.clearCookie = exports.setCookie = exports.createToken = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const crypto = __importStar(require("crypto"));
const COOKIE = 'qoder_dash';
const MAX_AGE = 60 * 60 * 24 * 7; // 7 days
const hmac = (data, secret) => crypto.createHmac('sha256', secret).update(data).digest('hex');
const createToken = (secret) => {
    const payload = `${Date.now()}.${crypto.randomBytes(16).toString('hex')}`;
    return Buffer.from(`${payload}.${hmac(payload, secret)}`).toString('base64url');
};
exports.createToken = createToken;
const verifyToken = (token, secret) => {
    try {
        const raw = Buffer.from(token, 'base64url').toString();
        const cut = raw.lastIndexOf('.');
        const data = raw.slice(0, cut);
        const sig = raw.slice(cut + 1);
        return sig === hmac(data, secret);
    }
    catch {
        return false;
    }
};
const parseCookies = (cookieHeader) => Object.fromEntries((cookieHeader || '').split(';').map((c) => {
    const [k, ...v] = c.trim().split('=');
    return [k.trim(), v.join('=')];
}));
const setCookie = (setHeader, token) => setHeader('Set-Cookie', `${COOKIE}=${token}; HttpOnly; SameSite=Lax; Max-Age=${MAX_AGE}; Path=/`);
exports.setCookie = setCookie;
const clearCookie = (setHeader) => setHeader('Set-Cookie', `${COOKIE}=; HttpOnly; SameSite=Lax; Max-Age=0; Path=/`);
exports.clearCookie = clearCookie;
let DashboardAuthGuard = class DashboardAuthGuard {
    constructor(configService) {
        this.configService = configService;
    }
    canActivate(context) {
        const secret = this.configService.get('DASHBOARD_SECRET') || '';
        const request = context.switchToHttp().getRequest();
        const response = context.switchToHttp().getResponse();
        const cookies = parseCookies(request.headers.cookie);
        const token = cookies[COOKIE] || null;
        if (token && verifyToken(token, secret))
            return true;
        if (request.path.startsWith('/dashboard/api/')) {
            response.status(401).json({ error: 'Not authenticated' });
            return false;
        }
        response.redirect('/dashboard/login');
        return false;
    }
};
exports.DashboardAuthGuard = DashboardAuthGuard;
exports.DashboardAuthGuard = DashboardAuthGuard = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], DashboardAuthGuard);
