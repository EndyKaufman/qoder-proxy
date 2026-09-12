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
exports.ProjectConfigService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const YAML = __importStar(require("yaml"));
const child_process_1 = require("child_process");
const events_1 = require("events");
/**
 * Loads, validates and manages per-project YAML configurations.
 *
 * Emits:
 *  - 'projects-changed' when the set of projects changes (add/remove/update)
 */
let ProjectConfigService = class ProjectConfigService extends events_1.EventEmitter {
    constructor(configService) {
        super();
        this.configService = configService;
        this.projects = new Map();
        /** lowercase alias/name → project name */
        this.aliasIndex = new Map();
        this.watcher = null;
    }
    // -------------------------------------------------------------------------
    // Lifecycle
    // -------------------------------------------------------------------------
    async onModuleInit() {
        await this.loadAll();
        this.startWatcher();
    }
    onModuleDestroy() {
        this.stopWatcher();
    }
    // -------------------------------------------------------------------------
    // Public API
    // -------------------------------------------------------------------------
    /** All loaded projects. */
    getAll() {
        return Array.from(this.projects.values());
    }
    /** Find a project by exact name. */
    getByName(name) {
        return this.projects.get(name);
    }
    /** Find a project by name or alias (case-insensitive). */
    resolveByNameOrAlias(identifier) {
        const key = identifier.toLowerCase();
        const projectName = this.aliasIndex.get(key);
        if (projectName)
            return this.projects.get(projectName);
        return undefined;
    }
    // -------------------------------------------------------------------------
    // Loading
    // -------------------------------------------------------------------------
    get configDir() {
        return this.configService.get('PROJECTS_CONFIG_DIR') || '/configs';
    }
    /** (Re-)load all .yaml files from the config directory. */
    async loadAll() {
        const dir = this.configDir;
        const prev = new Map(this.projects);
        this.projects.clear();
        this.aliasIndex.clear();
        if (!fs.existsSync(dir)) {
            console.warn(`[project-config] Config directory ${dir} does not exist, skipping`);
            return;
        }
        const files = fs.readdirSync(dir).filter((f) => /\.ya?ml$/i.test(f));
        if (files.length === 0) {
            console.warn(`[project-config] No YAML files found in ${dir}`);
            return;
        }
        for (const file of files) {
            try {
                const raw = this.loadFile(path.join(dir, file));
                if (!raw)
                    continue;
                const config = this.validate(raw, file);
                if (!config)
                    continue;
                // Auto-clone from GitHub if github_url is set and path doesn't exist yet
                if (config.github_url) {
                    try {
                        await this.cloneOrUpdate(config);
                    }
                    catch (err) {
                        console.error(`[project-config] ${config.name}: clone/pull failed: ${err.message}`);
                        // Continue loading — the path might still be valid from a previous clone
                    }
                }
                this.registerProject(config);
            }
            catch (err) {
                console.error(`[project-config] Error loading ${file}: ${err.message}`);
            }
        }
        console.log(`[project-config] Loaded ${this.projects.size} project(s): ${Array.from(this.projects.keys()).join(', ')}`);
        // Emit if changed
        if (!this.mapsEqual(prev, this.projects)) {
            this.emit('projects-changed', this.getAll());
        }
    }
    loadFile(filePath) {
        try {
            const content = fs.readFileSync(filePath, 'utf-8');
            return YAML.parse(content);
        }
        catch (err) {
            console.error(`[project-config] Failed to parse ${filePath}: ${err.message}`);
            return null;
        }
    }
    validate(raw, fileName) {
        if (!raw.name || typeof raw.name !== 'string') {
            console.error(`[project-config] ${fileName}: missing required field 'name', skipping`);
            return null;
        }
        if (!raw.path || typeof raw.path !== 'string') {
            console.error(`[project-config] ${fileName}: missing required field 'path', skipping`);
            return null;
        }
        return raw;
    }
    registerProject(config) {
        this.projects.set(config.name, config);
        // Register name itself
        this.aliasIndex.set(config.name.toLowerCase(), config.name);
        // Register aliases
        if (Array.isArray(config.aliases)) {
            for (const alias of config.aliases) {
                const key = alias.toLowerCase();
                if (this.aliasIndex.has(key) && this.aliasIndex.get(key) !== config.name) {
                    console.warn(`[project-config] Alias conflict: "${alias}" already mapped to "${this.aliasIndex.get(key)}", skipping for "${config.name}"`);
                }
                else {
                    this.aliasIndex.set(key, config.name);
                }
            }
        }
    }
    // -------------------------------------------------------------------------
    // File watcher
    // -------------------------------------------------------------------------
    startWatcher() {
        const dir = this.configDir;
        if (!fs.existsSync(dir))
            return;
        try {
            this.watcher = fs.watch(dir, { persistent: false }, (_event, filename) => {
                if (filename && /\.ya?ml$/i.test(filename)) {
                    console.log(`[project-config] Detected change in ${filename}, reloading`);
                    this.loadAll();
                }
            });
            this.watcher.on('error', (err) => {
                console.error(`[project-config] Watcher error: ${err.message}`);
            });
        }
        catch (err) {
            console.warn(`[project-config] Could not start file watcher: ${err.message}`);
        }
    }
    stopWatcher() {
        if (this.watcher) {
            this.watcher.close();
            this.watcher = null;
        }
    }
    // -------------------------------------------------------------------------
    // Catalog prompt generation
    // -------------------------------------------------------------------------
    /**
     * Generate a system prompt section listing all projects, their aliases,
     * paths, and available MCP servers. Used with --append-system-prompt.
     */
    generateCatalogPrompt(dashboardAppsDir, plugins) {
        const projects = this.getAll();
        if (projects.length === 0)
            return '';
        const lines = [
            '',
            '## Available Projects',
            '',
            'When the user mentions a project by name or alias, use the corresponding MCP servers and file paths.',
            'For multi-project operations, use MCP servers from multiple projects simultaneously.',
            '',
        ];
        for (const p of projects) {
            const aliases = p.aliases?.length ? ` (aliases: ${p.aliases.join(', ')})` : '';
            lines.push(`### ${p.name}${aliases}`);
            lines.push(`- Code path: ${p.path}`);
            const mcpServers = [];
            if (p.postgres)
                mcpServers.push(`pg_${p.name} (PostgreSQL: ${p.postgres.database})`);
            if (p.redis)
                mcpServers.push(`redis_${p.name} (Redis: db ${p.redis.db ?? 0})`);
            if (p.nats)
                mcpServers.push(`nats_${p.name} (NATS)`);
            if (p.minio)
                mcpServers.push(`minio_${p.name} (MinIO: ${p.minio.bucket ?? 'default'})`);
            if (p.docker)
                mcpServers.push('docker (Docker, shared)');
            mcpServers.push(`git_${p.name} (Git: ${p.path})`);
            lines.push(`- MCP servers: ${mcpServers.join(', ')}`);
            lines.push('');
        }
        // Global servers
        lines.push('### Global MCP servers');
        lines.push('- playwright (headless browser: screenshots, navigation, file upload/download)');
        lines.push('');
        // Dashboard apps
        if (dashboardAppsDir) {
            lines.push('### Dashboard Apps');
            lines.push(`You can create mini dashboard apps by writing files to: ${dashboardAppsDir}`);
            lines.push('Each app is a subdirectory with: index.html (frontend), controller.js (API routes), meta.json (metadata).');
            lines.push('controller.js exports: { routes: [{method, path, handler}], setupStream? }');
            lines.push('Use getPgConnection(projectName), getRedisConnection(projectName) etc. from the connection registry.');
            lines.push('');
        }
        // Plugins
        if (plugins && plugins.length > 0) {
            lines.push('## Available Plugins');
            lines.push('');
            for (const p of plugins) {
                const ver = p.version ? ` (v${p.version})` : '';
                lines.push(`### ${p.name} (${p.slug})${ver}`);
                lines.push(`- Description: ${p.description || 'No description'}`);
                lines.push(`- URL: /plugins/${p.slug}/`);
                lines.push(`- API: /plugins/${p.slug}/... (see plugin routes)`);
                lines.push('');
            }
        }
        return lines.join('\n');
    }
    // -------------------------------------------------------------------------
    // GitHub clone / pull
    // -------------------------------------------------------------------------
    /**
     * Clone a GitHub repo if the project path doesn't exist, or pull if it does.
     * Supports `url#branch` syntax. Timeout: 5 minutes.
     */
    async cloneOrUpdate(project) {
        if (!project.github_url)
            return;
        const { url, branch } = this.parseGitHubUrl(project.github_url);
        const projectPath = project.path;
        if (fs.existsSync(projectPath)) {
            // Check if it's a git repo
            const gitDir = path.join(projectPath, '.git');
            if (!fs.existsSync(gitDir)) {
                console.warn(`[project-config] ${project.name}: path ${projectPath} exists but is not a git repo, skipping pull`);
                return;
            }
            // Pull latest
            console.log(`[project-config] ${project.name}: pulling latest from ${url}`);
            await this.execGit(['pull'], projectPath);
        }
        else {
            // Clone
            console.log(`[project-config] ${project.name}: cloning ${url} into ${projectPath}`);
            const parentDir = path.dirname(projectPath);
            if (!fs.existsSync(parentDir)) {
                fs.mkdirSync(parentDir, { recursive: true });
            }
            const cloneArgs = ['clone', '--depth', '1'];
            if (branch)
                cloneArgs.push('--branch', branch);
            cloneArgs.push(url, projectPath);
            await this.execGit(cloneArgs, parentDir);
        }
    }
    /**
     * Parse `https://github.com/org/repo.git#branch` into url + branch.
     */
    parseGitHubUrl(raw) {
        const hashIdx = raw.lastIndexOf('#');
        if (hashIdx === -1)
            return { url: raw, branch: null };
        return {
            url: raw.substring(0, hashIdx),
            branch: raw.substring(hashIdx + 1) || null,
        };
    }
    /**
     * Execute a git command with a 5-minute timeout.
     */
    execGit(args, cwd) {
        return new Promise((resolve, reject) => {
            (0, child_process_1.execFile)('git', args, { cwd, timeout: 5 * 60 * 1000 }, (error, _stdout, stderr) => {
                if (error) {
                    console.error(`[project-config] git ${args[0]} failed: ${stderr || error.message}`);
                    reject(error);
                }
                else {
                    resolve();
                }
            });
        });
    }
    // -------------------------------------------------------------------------
    // Helpers
    // -------------------------------------------------------------------------
    mapsEqual(a, b) {
        if (a.size !== b.size)
            return false;
        for (const [key, val] of a) {
            const other = b.get(key);
            if (!other || JSON.stringify(other) !== JSON.stringify(val))
                return false;
        }
        return true;
    }
};
exports.ProjectConfigService = ProjectConfigService;
exports.ProjectConfigService = ProjectConfigService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], ProjectConfigService);
