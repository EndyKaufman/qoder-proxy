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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginLoaderService = void 0;
const common_1 = require("@nestjs/common");
const core_1 = require("@nestjs/core");
const config_1 = require("@nestjs/config");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const plugin_storage_service_1 = require("../plugin-storage/plugin-storage.service");
const connection_registry_1 = require("../dashboard-apps/connection-registry");
/**
 * Manages loading, registration, and lifecycle of AI-generated plugins.
 *
 * Similar to DashboardAppsService but with SQLite-backed storage,
 * per-plugin databases, and init() context injection.
 */
let PluginLoaderService = class PluginLoaderService {
    constructor(configService, pluginStorage, connectionRegistry, adapterHost) {
        this.configService = configService;
        this.pluginStorage = pluginStorage;
        this.connectionRegistry = connectionRegistry;
        this.adapterHost = adapterHost;
        this.plugins = new Map();
        this.watcher = null;
    }
    get filesDir() {
        const dir = this.configService.get('PLUGINS_FILES_DIR') || '/data/plugins';
        return path.resolve(dir);
    }
    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------
    onModuleInit() {
        this.loadAllPlugins();
        this.registerRoutes();
        this.startWatcher();
    }
    onModuleDestroy() {
        this.stopWatcher();
        // Close per-plugin databases
        for (const [, lp] of this.plugins) {
            try {
                lp.pluginDb?.close();
            }
            catch { /* ignore */ }
        }
        this.plugins.clear();
    }
    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    /** Get all loaded plugins. */
    listLoaded() {
        return Array.from(this.plugins.values()).map((lp) => ({
            slug: lp.slug,
            meta: lp.controller?.meta || null,
        }));
    }
    /** Get a loaded plugin by slug. */
    getLoaded(slug) {
        return this.plugins.get(slug);
    }
    /**
     * Mount plugin routes and static file serving on the Express app.
     * Uses a delegate middleware that dispatches to loaded plugins at request time.
     */
    registerRoutes() {
        const expressApp = this.adapterHost.httpAdapter.getInstance();
        expressApp.use('/plugins', (req, res, next) => {
            // Extract slug from /plugins/<slug>/...
            const subPath = req.path.startsWith('/') ? req.path.substring(1) : req.path;
            const slug = subPath.split('/')[0];
            if (!slug)
                return next();
            const lp = this.plugins.get(slug);
            if (!lp)
                return next();
            // Serve static files (index.html, CSS, JS, etc.)
            const expressModule = require('express');
            // Strip slug from URL so express.static resolves relative to plugin dir
            const originalUrl = req.url;
            const slugPrefix = `/${slug}`;
            if (req.url.startsWith(slugPrefix)) {
                req.url = req.url.substring(slugPrefix.length) || '/';
            }
            expressModule.static(lp.dir)(req, res, () => {
                // Restore original URL for route matching
                req.url = originalUrl;
                // Static file not found — try matching controller API routes
                if (lp.controller?.routes) {
                    const reqPath = req.path.startsWith('/') ? req.path.substring(1) : req.path;
                    const relativePath = reqPath.substring(slug.length);
                    const normalizedReqPath = relativePath.startsWith('/') ? relativePath : '/' + relativePath;
                    for (const route of lp.controller.routes) {
                        const routePath = route.path.startsWith('/') ? route.path : '/' + route.path;
                        if (route.method === req.method.toLowerCase() && routePath === normalizedReqPath) {
                            return route.handler(req, res);
                        }
                    }
                }
                // SSE stream route
                if (req.method === 'GET' && lp.controller?.setupStream) {
                    const streamPath = `/${slug}/stream`;
                    if (req.path === streamPath || req.path === `/plugins${streamPath}`) {
                        res.setHeader('Content-Type', 'text/event-stream');
                        res.setHeader('Cache-Control', 'no-cache');
                        res.setHeader('Connection', 'keep-alive');
                        res.setHeader('X-Accel-Buffering', 'no');
                        return lp.controller.setupStream(req, res);
                    }
                }
                next();
            });
        });
    }
    /**
     * Load or reload a single plugin from storage.
     * Called after a plugin is created/updated.
     */
    loadPlugin(plugin, version) {
        const files = this.pluginStorage.parseFiles(version);
        const slug = plugin.slug;
        const pluginDir = path.join(this.filesDir, slug);
        // Restore files to disk if missing (cache for require())
        this.restoreFiles(pluginDir, version.version, files);
        // Open per-plugin SQLite DB
        const pluginDbPath = path.join(pluginDir, 'data.db');
        let pluginDb = null;
        try {
            fs.mkdirSync(pluginDir, { recursive: true });
            pluginDb = new better_sqlite3_1.default(pluginDbPath);
            pluginDb.pragma('journal_mode = WAL');
        }
        catch (err) {
            console.error(`[plugin-loader] Failed to open plugin DB for ${slug}: ${err.message}`);
        }
        // Load controller.js
        const controllerPath = path.join(pluginDir, version.version, 'controller.js');
        let controller = null;
        try {
            if (fs.existsSync(controllerPath)) {
                delete require.cache[require.resolve(controllerPath)];
                controller = require(controllerPath);
                // Build storage helper bound to this plugin
                const storage = {
                    get: (key) => this.pluginStorage.getData(plugin.id, key),
                    set: (key, value) => this.pluginStorage.setData(plugin.id, key, value),
                    delete: (key) => this.pluginStorage.deleteData(plugin.id, key),
                    list: () => this.pluginStorage.listData(plugin.id),
                };
                // Build connection helpers
                const pgHelper = (projectName) => {
                    if (!projectName) {
                        const projects = this.connectionRegistry['projectConfigService'].getAll();
                        projectName = projects[0]?.name;
                    }
                    return projectName ? this.connectionRegistry.getPgConnection(projectName) : null;
                };
                const redisHelper = (projectName) => {
                    if (!projectName) {
                        const projects = this.connectionRegistry['projectConfigService'].getAll();
                        projectName = projects[0]?.name;
                    }
                    return projectName ? this.connectionRegistry.getRedisConnection(projectName) : null;
                };
                const minioHelper = (projectName) => {
                    if (!projectName) {
                        const projects = this.connectionRegistry['projectConfigService'].getAll();
                        projectName = projects[0]?.name;
                    }
                    return projectName ? this.connectionRegistry.getMinioClient(projectName) : null;
                };
                // Call init() with context
                if (controller.init && pluginDb) {
                    controller.init({
                        pg: pgHelper,
                        redis: redisHelper,
                        minio: minioHelper,
                        storage,
                        db: pluginDb,
                    });
                }
            }
        }
        catch (err) {
            console.error(`[plugin-loader] Failed to load controller for ${slug}: ${err.message}`);
        }
        // Close old plugin DB if reloading
        const existing = this.plugins.get(slug);
        if (existing?.pluginDb) {
            try {
                existing.pluginDb.close();
            }
            catch { /* ignore */ }
        }
        this.plugins.set(slug, {
            slug,
            plugin,
            version,
            files,
            controller,
            pluginDb,
            dir: path.join(pluginDir, version.version),
        });
    }
    /** Remove a plugin from the loaded set. */
    unloadPlugin(slug) {
        const lp = this.plugins.get(slug);
        if (!lp)
            return;
        try {
            lp.pluginDb?.close();
        }
        catch { /* ignore */ }
        this.plugins.delete(slug);
    }
    // -------------------------------------------------------------------------
    // Internal
    // -------------------------------------------------------------------------
    loadAllPlugins() {
        const allPlugins = this.pluginStorage.getAllPlugins();
        for (const plugin of allPlugins) {
            const activeVersion = this.pluginStorage.getActiveVersion(plugin.id);
            if (!activeVersion) {
                console.warn(`[plugin-loader] ${plugin.slug}: no active version, skipping`);
                continue;
            }
            try {
                this.loadPlugin(plugin, activeVersion);
            }
            catch (err) {
                console.error(`[plugin-loader] Failed to load ${plugin.slug}: ${err.message}`);
            }
        }
        console.log(`[plugin-loader] Loaded ${this.plugins.size} plugin(s): ${Array.from(this.plugins.keys()).join(', ') || 'none'}`);
    }
    /**
     * Restore plugin files from DB to disk (cache for require()).
     */
    restoreFiles(pluginDir, version, files) {
        const versionDir = path.join(pluginDir, version);
        fs.mkdirSync(versionDir, { recursive: true });
        for (const [filename, content] of Object.entries(files)) {
            const filePath = path.join(versionDir, filename);
            if (!fs.existsSync(filePath)) {
                fs.mkdirSync(path.dirname(filePath), { recursive: true });
                fs.writeFileSync(filePath, content, 'utf-8');
            }
        }
    }
    // -------------------------------------------------------------------------
    // File watcher
    // -------------------------------------------------------------------------
    startWatcher() {
        const dir = this.filesDir;
        if (!fs.existsSync(dir)) {
            try {
                fs.mkdirSync(dir, { recursive: true });
            }
            catch { /* ignore */ }
        }
        try {
            this.watcher = fs.watch(dir, { persistent: false, recursive: false }, () => {
                console.log('[plugin-loader] Detected change, rescanning');
                this.loadAllPlugins();
            });
            this.watcher.on('error', (err) => {
                console.error(`[plugin-loader] Watcher error: ${err.message}`);
            });
        }
        catch (err) {
            console.warn(`[plugin-loader] Could not start file watcher: ${err.message}`);
        }
    }
    stopWatcher() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }
};
exports.PluginLoaderService = PluginLoaderService;
exports.PluginLoaderService = PluginLoaderService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        plugin_storage_service_1.PluginStorageService,
        connection_registry_1.ConnectionRegistry,
        core_1.HttpAdapterHost])
], PluginLoaderService);
