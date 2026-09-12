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
exports.DashboardAppsService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const events_1 = require("events");
/**
 * Manages dynamically-loaded dashboard mini-apps.
 *
 * Each app lives in a subdirectory of DASHBOARD_APPS_DIR and contains:
 *  - index.html (frontend)
 *  - controller.js (API routes, optional SSE stream)
 *  - meta.json (metadata)
 *
 * Apps are registered as Express sub-routers under /dashboard-apps/:appName/.
 */
let DashboardAppsService = class DashboardAppsService extends events_1.EventEmitter {
    constructor(configService) {
        super();
        this.configService = configService;
        this.apps = new Map();
        this.watcher = null;
    }
    get appsDir() {
        return this.configService.get('DASHBOARD_APPS_DIR') || '/dashboard-apps';
    }
    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------
    onModuleInit() {
        this.scanApps();
        this.startWatcher();
    }
    onModuleDestroy() {
        this.stopWatcher();
    }
    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    /** Get metadata for all loaded apps. */
    listApps() {
        return Array.from(this.apps.values()).map((app) => ({
            appName: app.appName,
            meta: app.meta,
        }));
    }
    /** Get a loaded app by name. */
    getApp(appName) {
        return this.apps.get(appName);
    }
    /**
     * Register all app routes onto the given Express router.
     * Called by the dashboard controller during setup.
     */
    registerRoutes(router) {
        for (const [appName, app] of this.apps) {
            // Serve static files (index.html, CSS, JS, etc.)
            router.use(`/${appName}`, (req, res, next) => {
                const express = require('express');
                express.static(app.appDir)(req, res, next);
            });
            // Register API routes from controller.js
            if (app.controller?.routes) {
                for (const route of app.controller.routes) {
                    const fullPath = `/${appName}${route.path.startsWith('/') ? route.path : '/' + route.path}`;
                    router[route.method](fullPath, route.handler);
                }
            }
            // Register SSE stream if available
            if (app.controller?.setupStream) {
                router.get(`/${appName}/stream`, (req, res) => {
                    res.setHeader('Content-Type', 'text/event-stream');
                    res.setHeader('Cache-Control', 'no-cache');
                    res.setHeader('Connection', 'keep-alive');
                    res.setHeader('X-Accel-Buffering', 'no');
                    app.controller.setupStream(req, res);
                });
            }
        }
    }
    // -------------------------------------------------------------------------
    // Scanning
    // -------------------------------------------------------------------------
    scanApps() {
        const dir = this.appsDir;
        if (!fs.existsSync(dir)) {
            console.warn(`[dashboard-apps] Apps directory ${dir} does not exist, skipping`);
            return;
        }
        const prev = new Map(this.apps);
        this.apps.clear();
        const entries = fs.readdirSync(dir, { withFileTypes: true });
        for (const entry of entries) {
            if (!entry.isDirectory())
                continue;
            const appName = entry.name;
            const appDir = path.join(dir, appName);
            try {
                const meta = this.loadMeta(appDir, appName);
                const controller = this.loadController(appDir);
                this.apps.set(appName, { appName, appDir, meta, controller });
            }
            catch (err) {
                console.error(`[dashboard-apps] Error loading app "${appName}": ${err.message}`);
            }
        }
        console.log(`[dashboard-apps] Loaded ${this.apps.size} app(s): ${Array.from(this.apps.keys()).join(', ') || 'none'}`);
        if (!this.mapsEqual(prev, this.apps)) {
            this.emit('apps-changed', this.listApps());
        }
    }
    loadMeta(appDir, appName) {
        const metaPath = path.join(appDir, 'meta.json');
        if (fs.existsSync(metaPath)) {
            try {
                return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
            }
            catch (err) {
                console.warn(`[dashboard-apps] ${appName}: invalid meta.json: ${err.message}`);
            }
        }
        return { name: appName };
    }
    loadController(appDir) {
        const controllerPath = path.join(appDir, 'controller.js');
        if (!fs.existsSync(controllerPath))
            return null;
        try {
            // Clear require cache so hot-reload works
            delete require.cache[require.resolve(controllerPath)];
            return require(controllerPath);
        }
        catch (err) {
            console.error(`[dashboard-apps] Failed to load controller.js from ${appDir}: ${err.message}`);
            return null;
        }
    }
    // -------------------------------------------------------------------------
    // File watcher
    // -------------------------------------------------------------------------
    startWatcher() {
        const dir = this.appsDir;
        if (!fs.existsSync(dir))
            return;
        try {
            this.watcher = fs.watch(dir, { persistent: false, recursive: false }, () => {
                console.log('[dashboard-apps] Detected change, rescanning');
                this.scanApps();
            });
            this.watcher.on('error', (err) => {
                console.error(`[dashboard-apps] Watcher error: ${err.message}`);
            });
        }
        catch (err) {
            console.warn(`[dashboard-apps] Could not start file watcher: ${err.message}`);
        }
    }
    stopWatcher() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    mapsEqual(a, b) {
        if (a.size !== b.size)
            return false;
        for (const key of a.keys()) {
            if (!b.has(key))
                return false;
        }
        return true;
    }
};
exports.DashboardAppsService = DashboardAppsService;
exports.DashboardAppsService = DashboardAppsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], DashboardAppsService);
