import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from '../config/configuration';
import type { Request, Response } from 'express';
import { PluginStorageService } from '../plugin-storage/plugin-storage.service';
import { ConnectionRegistry } from '../dashboard-apps/connection-registry';
import type { Plugin, PluginVersion, PluginFiles } from '../plugin-storage/plugin-storage.models';

/**
 * Shape of a plugin's controller.js module.
 */
interface PluginControllerModule {
  meta: { name: string; description?: string; icon?: string };
  init?: (ctx: PluginInitContext) => void;
  routes: Array<{
    method: 'get' | 'post' | 'put' | 'delete' | 'patch';
    path: string;
    handler: (req: Request, res: Response) => void;
  }>;
  setupStream?: (req: Request, res: Response) => void;
}

/**
 * Context passed to a plugin's init() function.
 */
interface PluginInitContext {
  pg: ((projectName?: string) => { connectionString: string } | null) | null;
  redis: ((projectName?: string) => { url: string } | null) | null;
  minio: ((projectName?: string) => Record<string, unknown> | null) | null;
  storage: {
    get: (key: string) => unknown;
    set: (key: string, value: unknown) => void;
    delete: (key: string) => void;
    list: () => Array<{ key: string; value: unknown }>;
  };
  db: Database.Database;
}

/**
 * Internal representation of a loaded plugin.
 */
interface LoadedPlugin {
  slug: string;
  plugin: Plugin;
  version: PluginVersion;
  files: PluginFiles;
  controller: PluginControllerModule | null;
  pluginDb: Database.Database | null;
  dir: string;
}

/**
 * Manages loading, registration, and lifecycle of AI-generated plugins.
 *
 * Similar to DashboardAppsService but with SQLite-backed storage,
 * per-plugin databases, and init() context injection.
 */
@Injectable()
export class PluginLoaderService implements OnModuleInit, OnModuleDestroy {
  private plugins: Map<string, LoadedPlugin> = new Map();
  private watcher: fs.FSWatcher | null = null;

  constructor(
    private configService: ConfigService<AppConfig>,
    private pluginStorage: PluginStorageService,
    private connectionRegistry: ConnectionRegistry,
    private adapterHost: HttpAdapterHost,
  ) {}

  get filesDir(): string {
    const dir = this.configService.get<string>('PLUGINS_FILES_DIR') || '/data/plugins';
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
      try { lp.pluginDb?.close(); } catch { /* ignore */ }
    }
    this.plugins.clear();
  }

  // -------------------------------------------------------------------------
  // Public API
  // -------------------------------------------------------------------------

  /** Get all loaded plugins. */
  listLoaded(): Array<{ slug: string; meta: PluginControllerModule['meta'] | null }> {
    return Array.from(this.plugins.values()).map((lp) => ({
      slug: lp.slug,
      meta: lp.controller?.meta || null,
    }));
  }

  /** Get a loaded plugin by slug. */
  getLoaded(slug: string): LoadedPlugin | undefined {
    return this.plugins.get(slug);
  }

  /**
   * Mount plugin routes and static file serving on the Express app.
   * Uses a delegate middleware that dispatches to loaded plugins at request time.
   */
  registerRoutes(): void {
    const expressApp = this.adapterHost.httpAdapter.getInstance();

    expressApp.use('/plugins', (req: Request, res: Response, next: Function) => {
      // Extract slug from /plugins/<slug>/...
      const subPath = req.path.startsWith('/') ? req.path.substring(1) : req.path;
      const slug = subPath.split('/')[0];
      if (!slug) return next();

      const lp = this.plugins.get(slug);
      if (!lp) return next();

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
  loadPlugin(plugin: Plugin, version: PluginVersion): void {
    const files = this.pluginStorage.parseFiles(version);
    const slug = plugin.slug;
    const pluginDir = path.join(this.filesDir, slug);

    // Restore files to disk if missing (cache for require())
    this.restoreFiles(pluginDir, version.version, files);

    // Open per-plugin SQLite DB
    const pluginDbPath = path.join(pluginDir, 'data.db');
    let pluginDb: Database.Database | null = null;
    try {
      fs.mkdirSync(pluginDir, { recursive: true });
      pluginDb = new Database(pluginDbPath);
      pluginDb.pragma('journal_mode = WAL');
    } catch (err: any) {
      console.error(`[plugin-loader] Failed to open plugin DB for ${slug}: ${err.message}`);
    }

    // Load controller.js
    const controllerPath = path.join(pluginDir, version.version, 'controller.js');
    let controller: PluginControllerModule | null = null;
    try {
      if (fs.existsSync(controllerPath)) {
        delete require.cache[require.resolve(controllerPath)];
        controller = require(controllerPath) as PluginControllerModule;

        // Build storage helper bound to this plugin
        const storage = {
          get: (key: string) => this.pluginStorage.getData(plugin.id, key),
          set: (key: string, value: unknown) => this.pluginStorage.setData(plugin.id, key, value),
          delete: (key: string) => this.pluginStorage.deleteData(plugin.id, key),
          list: () => this.pluginStorage.listData(plugin.id),
        };

        // Build connection helpers
        const pgHelper = (projectName?: string) => {
          if (!projectName) {
            const projects = this.connectionRegistry['projectConfigService'].getAll();
            projectName = projects[0]?.name;
          }
          return projectName ? this.connectionRegistry.getPgConnection(projectName) : null;
        };
        const redisHelper = (projectName?: string) => {
          if (!projectName) {
            const projects = this.connectionRegistry['projectConfigService'].getAll();
            projectName = projects[0]?.name;
          }
          return projectName ? this.connectionRegistry.getRedisConnection(projectName) : null;
        };
        const minioHelper = (projectName?: string) => {
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
    } catch (err: any) {
      console.error(`[plugin-loader] Failed to load controller for ${slug}: ${err.message}`);
    }

    // Close old plugin DB if reloading
    const existing = this.plugins.get(slug);
    if (existing?.pluginDb) {
      try { existing.pluginDb.close(); } catch { /* ignore */ }
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
  unloadPlugin(slug: string): void {
    const lp = this.plugins.get(slug);
    if (!lp) return;
    try { lp.pluginDb?.close(); } catch { /* ignore */ }
    this.plugins.delete(slug);
  }

  // -------------------------------------------------------------------------
  // Internal
  // -------------------------------------------------------------------------

  private loadAllPlugins(): void {
    const allPlugins = this.pluginStorage.getAllPlugins();
    for (const plugin of allPlugins) {
      const activeVersion = this.pluginStorage.getActiveVersion(plugin.id);
      if (!activeVersion) {
        console.warn(`[plugin-loader] ${plugin.slug}: no active version, skipping`);
        continue;
      }
      try {
        this.loadPlugin(plugin, activeVersion);
      } catch (err: any) {
        console.error(`[plugin-loader] Failed to load ${plugin.slug}: ${err.message}`);
      }
    }
    console.log(
      `[plugin-loader] Loaded ${this.plugins.size} plugin(s): ${Array.from(this.plugins.keys()).join(', ') || 'none'}`,
    );
  }

  /**
   * Restore plugin files from DB to disk (cache for require()).
   */
  private restoreFiles(pluginDir: string, version: string, files: PluginFiles): void {
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

  private startWatcher(): void {
    const dir = this.filesDir;
    if (!fs.existsSync(dir)) {
      try { fs.mkdirSync(dir, { recursive: true }); } catch { /* ignore */ }
    }

    try {
      this.watcher = fs.watch(dir, { persistent: false, recursive: false }, () => {
        console.log('[plugin-loader] Detected change, rescanning');
        this.loadAllPlugins();
      });
      this.watcher.on('error', (err) => {
        console.error(`[plugin-loader] Watcher error: ${err.message}`);
      });
    } catch (err: any) {
      console.warn(`[plugin-loader] Could not start file watcher: ${err.message}`);
    }
  }

  private stopWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }
}
