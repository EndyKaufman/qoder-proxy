import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import { EventEmitter } from 'events';
import type { AppConfig } from '../config/configuration';
import type { Request, Response, Router } from 'express';

/**
 * Metadata from a dashboard app's meta.json file.
 */
export interface DashboardAppMeta {
  name: string;
  description?: string;
  icon?: string;
  version?: string;
}

/**
 * A single route defined in a dashboard app's controller.js.
 */
interface DashboardRoute {
  method: 'get' | 'post' | 'put' | 'delete' | 'patch';
  path: string;
  handler: (req: Request, res: Response) => void;
}

/**
 * Shape of a dashboard app's controller.js module.
 */
interface DashboardControllerModule {
  routes: DashboardRoute[];
  setupStream?: (req: Request, res: Response) => void;
}

/**
 * Internal representation of a loaded dashboard app.
 */
interface LoadedDashboardApp {
  appName: string;
  appDir: string;
  meta: DashboardAppMeta;
  controller: DashboardControllerModule | null;
}

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
@Injectable()
export class DashboardAppsService extends EventEmitter implements OnModuleInit, OnModuleDestroy {
  private apps: Map<string, LoadedDashboardApp> = new Map();
  private watcher: fs.FSWatcher | null = null;

  constructor(private configService: ConfigService<AppConfig>) {
    super();
  }

  get appsDir(): string {
    return this.configService.get<string>('DASHBOARD_APPS_DIR') || '/dashboard-apps';
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
  listApps(): Array<{ appName: string; meta: DashboardAppMeta }> {
    return Array.from(this.apps.values()).map((app) => ({
      appName: app.appName,
      meta: app.meta,
    }));
  }

  /** Get a loaded app by name. */
  getApp(appName: string): LoadedDashboardApp | undefined {
    return this.apps.get(appName);
  }

  /**
   * Register all app routes onto the given Express router.
   * Called by the dashboard controller during setup.
   */
  registerRoutes(router: Router): void {
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
          (router as any)[route.method](fullPath, route.handler);
        }
      }

      // Register SSE stream if available
      if (app.controller?.setupStream) {
        router.get(`/${appName}/stream`, (req: Request, res: Response) => {
          res.setHeader('Content-Type', 'text/event-stream');
          res.setHeader('Cache-Control', 'no-cache');
          res.setHeader('Connection', 'keep-alive');
          res.setHeader('X-Accel-Buffering', 'no');
          app.controller!.setupStream!(req, res);
        });
      }
    }
  }

  // -------------------------------------------------------------------------
  // Scanning
  // -------------------------------------------------------------------------

  private scanApps(): void {
    const dir = this.appsDir;
    if (!fs.existsSync(dir)) {
      console.warn(`[dashboard-apps] Apps directory ${dir} does not exist, skipping`);
      return;
    }

    const prev = new Map(this.apps);
    this.apps.clear();

    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const appName = entry.name;
      const appDir = path.join(dir, appName);

      try {
        const meta = this.loadMeta(appDir, appName);
        const controller = this.loadController(appDir);
        this.apps.set(appName, { appName, appDir, meta, controller });
      } catch (err: any) {
        console.error(`[dashboard-apps] Error loading app "${appName}": ${err.message}`);
      }
    }

    console.log(`[dashboard-apps] Loaded ${this.apps.size} app(s): ${Array.from(this.apps.keys()).join(', ') || 'none'}`);

    if (!this.mapsEqual(prev, this.apps)) {
      this.emit('apps-changed', this.listApps());
    }
  }

  private loadMeta(appDir: string, appName: string): DashboardAppMeta {
    const metaPath = path.join(appDir, 'meta.json');
    if (fs.existsSync(metaPath)) {
      try {
        return JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      } catch (err: any) {
        console.warn(`[dashboard-apps] ${appName}: invalid meta.json: ${err.message}`);
      }
    }
    return { name: appName };
  }

  private loadController(appDir: string): DashboardControllerModule | null {
    const controllerPath = path.join(appDir, 'controller.js');
    if (!fs.existsSync(controllerPath)) return null;

    try {
      // Clear require cache so hot-reload works
      delete require.cache[require.resolve(controllerPath)];
      return require(controllerPath) as DashboardControllerModule;
    } catch (err: any) {
      console.error(`[dashboard-apps] Failed to load controller.js from ${appDir}: ${err.message}`);
      return null;
    }
  }

  // -------------------------------------------------------------------------
  // File watcher
  // -------------------------------------------------------------------------

  private startWatcher(): void {
    const dir = this.appsDir;
    if (!fs.existsSync(dir)) return;

    try {
      this.watcher = fs.watch(dir, { persistent: false, recursive: false }, () => {
        console.log('[dashboard-apps] Detected change, rescanning');
        this.scanApps();
      });
      this.watcher.on('error', (err) => {
        console.error(`[dashboard-apps] Watcher error: ${err.message}`);
      });
    } catch (err: any) {
      console.warn(`[dashboard-apps] Could not start file watcher: ${err.message}`);
    }
  }

  private stopWatcher(): void {
    if (this.watcher) {
      this.watcher.close();
      this.watcher = null;
    }
  }

  // -------------------------------------------------------------------------
  // Helpers
  // -------------------------------------------------------------------------

  private mapsEqual(a: Map<string, LoadedDashboardApp>, b: Map<string, LoadedDashboardApp>): boolean {
    if (a.size !== b.size) return false;
    for (const key of a.keys()) {
      if (!b.has(key)) return false;
    }
    return true;
  }
}
