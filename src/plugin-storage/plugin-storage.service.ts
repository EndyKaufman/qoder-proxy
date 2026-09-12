import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Database from 'better-sqlite3';
import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from '../config/configuration';
import type {
  Plugin,
  PluginVersion,
  PluginData,
  PluginFiles,
  CreatePluginInput,
  CreateVersionInput,
} from './plugin-storage.models';

/**
 * SQLite-based storage for plugins, versions, and arbitrary plugin data.
 *
 * Uses better-sqlite3 (synchronous, fast, single-file DB).
 * DB path from env PLUGINS_DB_PATH (default: /data/plugins.db).
 */
@Injectable()
export class PluginStorageService implements OnModuleInit, OnModuleDestroy {
  private db: Database.Database | null = null;

  constructor(private configService: ConfigService<AppConfig>) {}

  // -------------------------------------------------------------------------
  // Lifecycle
  // -------------------------------------------------------------------------

  onModuleInit() {
    this.initDb();
  }

  onModuleDestroy() {
    this.db?.close();
    this.db = null;
  }

  // -------------------------------------------------------------------------
  // Public API — Plugins
  // -------------------------------------------------------------------------

  createPlugin(input: CreatePluginInput): Plugin {
    const db = this.getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO plugins (slug, name, description, icon, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const info = stmt.run(
      input.slug,
      input.name,
      input.description || '',
      input.icon || 'puzzle',
      now,
      now,
    );
    return db.prepare('SELECT * FROM plugins WHERE id = ?').get(info.lastInsertRowid) as Plugin;
  }

  getPlugin(id: number): Plugin | undefined {
    return this.getDb().prepare('SELECT * FROM plugins WHERE id = ?').get(id) as Plugin | undefined;
  }

  getPluginBySlug(slug: string): Plugin | undefined {
    return this.getDb().prepare('SELECT * FROM plugins WHERE slug = ?').get(slug) as Plugin | undefined;
  }

  getAllPlugins(): Plugin[] {
    return this.getDb().prepare('SELECT * FROM plugins ORDER BY name').all() as Plugin[];
  }

  // -------------------------------------------------------------------------
  // Public API — Versions
  // -------------------------------------------------------------------------

  createVersion(input: CreateVersionInput): PluginVersion {
    const db = this.getDb();
    const now = new Date().toISOString();
    const stmt = db.prepare(
      `INSERT INTO plugin_versions (plugin_id, version, prompt, files_json, openapi_spec, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const info = stmt.run(
      input.pluginId,
      input.version,
      input.prompt,
      JSON.stringify(input.files),
      input.openApiSpec || null,
      now,
    );
    return db.prepare('SELECT * FROM plugin_versions WHERE id = ?').get(info.lastInsertRowid) as PluginVersion;
  }

  getVersions(pluginId: number): PluginVersion[] {
    return this.getDb()
      .prepare('SELECT * FROM plugin_versions WHERE plugin_id = ? ORDER BY created_at DESC')
      .all(pluginId) as PluginVersion[];
  }

  getVersion(versionId: number): PluginVersion | undefined {
    return this.getDb()
      .prepare('SELECT * FROM plugin_versions WHERE id = ?')
      .get(versionId) as PluginVersion | undefined;
  }

  getActiveVersion(pluginId: number): PluginVersion | undefined {
    const row = this.getDb()
      .prepare(
        `SELECT pv.* FROM plugin_versions pv
         JOIN plugin_active pa ON pa.version_id = pv.id
         WHERE pa.plugin_id = ?`,
      )
      .get(pluginId) as PluginVersion | undefined;
    return row;
  }

  setActiveVersion(pluginId: number, versionId: number): void {
    const db = this.getDb();
    db.prepare(
      `INSERT OR REPLACE INTO plugin_active (plugin_id, version_id) VALUES (?, ?)`,
    ).run(pluginId, versionId);
  }

  rollback(pluginId: number): PluginVersion | undefined {
    const versions = this.getVersions(pluginId);
    if (versions.length < 2) return undefined;
    const active = this.getActiveVersion(pluginId);
    // Find the version before the active one (versions are DESC by created_at)
    const activeIdx = active ? versions.findIndex((v) => v.id === active.id) : 0;
    const prevIdx = activeIdx >= 0 && activeIdx < versions.length - 1 ? activeIdx + 1 : activeIdx;
    if (prevIdx === activeIdx) return undefined;
    const prev = versions[prevIdx];
    this.setActiveVersion(pluginId, prev.id);
    return prev;
  }

  /** Parse files_json from a version into a PluginFiles object. */
  parseFiles(version: PluginVersion): PluginFiles {
    try {
      return JSON.parse(version.files_json);
    } catch {
      return {};
    }
  }

  // -------------------------------------------------------------------------
  // Public API — Plugin Data (universal key-value storage)
  // -------------------------------------------------------------------------

  setData(pluginId: number, key: string, value: unknown): void {
    const db = this.getDb();
    const now = new Date().toISOString();
    const valueJson = JSON.stringify(value);
    db.prepare(
      `INSERT INTO plugin_data (plugin_id, key, value_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(plugin_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    ).run(pluginId, key, valueJson, now, now);
  }

  getData(pluginId: number, key: string): unknown {
    const row = this.getDb()
      .prepare('SELECT value_json FROM plugin_data WHERE plugin_id = ? AND key = ?')
      .get(pluginId, key) as { value_json: string } | undefined;
    if (!row) return null;
    try {
      return JSON.parse(row.value_json);
    } catch {
      return null;
    }
  }

  deleteData(pluginId: number, key: string): void {
    this.getDb()
      .prepare('DELETE FROM plugin_data WHERE plugin_id = ? AND key = ?')
      .run(pluginId, key);
  }

  listData(pluginId: number): Array<{ key: string; value: unknown }> {
    const rows = this.getDb()
      .prepare('SELECT key, value_json FROM plugin_data WHERE plugin_id = ? ORDER BY key')
      .all(pluginId) as Array<{ key: string; value_json: string }>;
    return rows.map((r) => ({
      key: r.key,
      value: (() => { try { return JSON.parse(r.value_json); } catch { return null; } })(),
    }));
  }

  // -------------------------------------------------------------------------
  // DB init
  // -------------------------------------------------------------------------

  private getDb(): Database.Database {
    if (!this.db) {
      throw new Error('PluginStorageService: DB not initialized');
    }
    return this.db;
  }

  private initDb(): void {
    const dbPath = path.resolve(this.configService.get<string>('PLUGINS_DB_PATH') || '/data/plugins.db');

    // Ensure parent directory exists
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS plugins (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        icon TEXT NOT NULL DEFAULT 'puzzle',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plugin_versions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_id INTEGER NOT NULL REFERENCES plugins(id),
        version TEXT NOT NULL,
        prompt TEXT NOT NULL,
        files_json TEXT NOT NULL,
        openapi_spec TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS plugin_active (
        plugin_id INTEGER PRIMARY KEY REFERENCES plugins(id),
        version_id INTEGER NOT NULL REFERENCES plugin_versions(id)
      );

      CREATE TABLE IF NOT EXISTS plugin_data (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        plugin_id INTEGER NOT NULL REFERENCES plugins(id),
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(plugin_id, key)
      );
    `);
  }
}
