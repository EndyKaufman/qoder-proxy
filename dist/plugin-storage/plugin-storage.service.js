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
exports.PluginStorageService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const better_sqlite3_1 = __importDefault(require("better-sqlite3"));
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * SQLite-based storage for plugins, versions, and arbitrary plugin data.
 *
 * Uses better-sqlite3 (synchronous, fast, single-file DB).
 * DB path from env PLUGINS_DB_PATH (default: /data/plugins.db).
 */
let PluginStorageService = class PluginStorageService {
    constructor(configService) {
        this.configService = configService;
        this.db = null;
    }
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
    createPlugin(input) {
        const db = this.getDb();
        const now = new Date().toISOString();
        const stmt = db.prepare(`INSERT INTO plugins (slug, name, description, icon, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`);
        const info = stmt.run(input.slug, input.name, input.description || '', input.icon || 'puzzle', now, now);
        return db.prepare('SELECT * FROM plugins WHERE id = ?').get(info.lastInsertRowid);
    }
    getPlugin(id) {
        return this.getDb().prepare('SELECT * FROM plugins WHERE id = ?').get(id);
    }
    getPluginBySlug(slug) {
        return this.getDb().prepare('SELECT * FROM plugins WHERE slug = ?').get(slug);
    }
    getAllPlugins() {
        return this.getDb().prepare('SELECT * FROM plugins ORDER BY name').all();
    }
    // -------------------------------------------------------------------------
    // Public API — Versions
    // -------------------------------------------------------------------------
    createVersion(input) {
        const db = this.getDb();
        const now = new Date().toISOString();
        const stmt = db.prepare(`INSERT INTO plugin_versions (plugin_id, version, prompt, files_json, openapi_spec, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`);
        const info = stmt.run(input.pluginId, input.version, input.prompt, JSON.stringify(input.files), input.openApiSpec || null, now);
        return db.prepare('SELECT * FROM plugin_versions WHERE id = ?').get(info.lastInsertRowid);
    }
    getVersions(pluginId) {
        return this.getDb()
            .prepare('SELECT * FROM plugin_versions WHERE plugin_id = ? ORDER BY created_at DESC')
            .all(pluginId);
    }
    getVersion(versionId) {
        return this.getDb()
            .prepare('SELECT * FROM plugin_versions WHERE id = ?')
            .get(versionId);
    }
    getActiveVersion(pluginId) {
        const row = this.getDb()
            .prepare(`SELECT pv.* FROM plugin_versions pv
         JOIN plugin_active pa ON pa.version_id = pv.id
         WHERE pa.plugin_id = ?`)
            .get(pluginId);
        return row;
    }
    setActiveVersion(pluginId, versionId) {
        const db = this.getDb();
        db.prepare(`INSERT OR REPLACE INTO plugin_active (plugin_id, version_id) VALUES (?, ?)`).run(pluginId, versionId);
    }
    rollback(pluginId) {
        const versions = this.getVersions(pluginId);
        if (versions.length < 2)
            return undefined;
        const active = this.getActiveVersion(pluginId);
        // Find the version before the active one (versions are DESC by created_at)
        const activeIdx = active ? versions.findIndex((v) => v.id === active.id) : 0;
        const prevIdx = activeIdx >= 0 && activeIdx < versions.length - 1 ? activeIdx + 1 : activeIdx;
        if (prevIdx === activeIdx)
            return undefined;
        const prev = versions[prevIdx];
        this.setActiveVersion(pluginId, prev.id);
        return prev;
    }
    /** Parse files_json from a version into a PluginFiles object. */
    parseFiles(version) {
        try {
            return JSON.parse(version.files_json);
        }
        catch {
            return {};
        }
    }
    // -------------------------------------------------------------------------
    // Public API — Plugin Data (universal key-value storage)
    // -------------------------------------------------------------------------
    setData(pluginId, key, value) {
        const db = this.getDb();
        const now = new Date().toISOString();
        const valueJson = JSON.stringify(value);
        db.prepare(`INSERT INTO plugin_data (plugin_id, key, value_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(plugin_id, key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`).run(pluginId, key, valueJson, now, now);
    }
    getData(pluginId, key) {
        const row = this.getDb()
            .prepare('SELECT value_json FROM plugin_data WHERE plugin_id = ? AND key = ?')
            .get(pluginId, key);
        if (!row)
            return null;
        try {
            return JSON.parse(row.value_json);
        }
        catch {
            return null;
        }
    }
    deleteData(pluginId, key) {
        this.getDb()
            .prepare('DELETE FROM plugin_data WHERE plugin_id = ? AND key = ?')
            .run(pluginId, key);
    }
    listData(pluginId) {
        const rows = this.getDb()
            .prepare('SELECT key, value_json FROM plugin_data WHERE plugin_id = ? ORDER BY key')
            .all(pluginId);
        return rows.map((r) => ({
            key: r.key,
            value: (() => { try {
                return JSON.parse(r.value_json);
            }
            catch {
                return null;
            } })(),
        }));
    }
    // -------------------------------------------------------------------------
    // DB init
    // -------------------------------------------------------------------------
    getDb() {
        if (!this.db) {
            throw new Error('PluginStorageService: DB not initialized');
        }
        return this.db;
    }
    initDb() {
        const dbPath = path.resolve(this.configService.get('PLUGINS_DB_PATH') || '/data/plugins.db');
        // Ensure parent directory exists
        const dir = path.dirname(dbPath);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        this.db = new better_sqlite3_1.default(dbPath);
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
};
exports.PluginStorageService = PluginStorageService;
exports.PluginStorageService = PluginStorageService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PluginStorageService);
