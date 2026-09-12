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
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpGenService = void 0;
const common_1 = require("@nestjs/common");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
/**
 * Generates a combined MCP JSON configuration for all loaded projects.
 *
 * Server naming convention:
 *  - Per-project: `{service}_{projectName}` (e.g. pg_alpha, redis_beta)
 *  - Global (shared): `playwright`, `docker` (no project prefix)
 */
let McpGenService = class McpGenService {
    /**
     * Generate a full MCP config object from the list of projects.
     */
    generateMcpConfig(projects, pluginsDbPath) {
        const servers = {};
        let hasDocker = false;
        for (const project of projects) {
            const prefix = this.sanitize(project.name);
            // PostgreSQL
            if (project.postgres) {
                const { host, port, user, password, database } = project.postgres;
                const connStr = `postgresql://${user}:${password}@${host}:${port}/${database}`;
                servers[`pg_${prefix}`] = {
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-postgres', connStr],
                };
            }
            // Redis
            if (project.redis) {
                const { host, port, db } = project.redis;
                const redisUrl = `redis://${host}:${port}/${db ?? 0}`;
                servers[`redis_${prefix}`] = {
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-redis'],
                    env: { REDIS_URL: redisUrl },
                };
            }
            // NATS
            if (project.nats) {
                servers[`nats_${prefix}`] = {
                    command: 'npx',
                    args: ['-y', '@daanrongen/nats-mcp'],
                    env: { NATS_URL: project.nats.url },
                };
            }
            // MinIO
            if (project.minio) {
                const { endpoint, port, access_key, secret_key } = project.minio;
                servers[`minio_${prefix}`] = {
                    command: 'npx',
                    args: ['-y', '@pickstar-2002/minio-storage-mcp@latest'],
                    env: {
                        MINIO_ENDPOINT: endpoint,
                        MINIO_PORT: String(port),
                        MINIO_ACCESS_KEY: access_key,
                        MINIO_SECRET_KEY: secret_key,
                        MINIO_USE_SSL: project.minio.use_ssl ? 'true' : 'false',
                    },
                };
            }
            // Docker (shared -- only one entry)
            if (project.docker && !hasDocker) {
                servers['docker'] = {
                    command: 'npx',
                    args: ['-y', '@0xshariq/docker-mcp-server'],
                    env: { DOCKER_HOST: project.docker.host },
                };
                hasDocker = true;
            }
            // Git (per project)
            servers[`git_${prefix}`] = {
                command: 'npx',
                args: ['-y', 'git-summary-mcp'],
                env: { GIT_REPO_PATH: project.path },
            };
        }
        // Playwright (global, always included when there are projects)
        if (projects.length > 0) {
            servers['playwright'] = {
                command: 'npx',
                args: ['-y', '@playwright/mcp'],
            };
        }
        // Global plugin MCP servers (filesystem, fetch, sqlite)
        if (projects.length > 0) {
            const firstProjectPath = projects[0].path || '/projects';
            servers['filesystem'] = {
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-filesystem', firstProjectPath],
            };
            servers['fetch'] = {
                command: 'npx',
                args: ['-y', '@modelcontextprotocol/server-fetch'],
            };
            if (pluginsDbPath) {
                servers['sqlite'] = {
                    command: 'npx',
                    args: ['-y', '@modelcontextprotocol/server-sqlite', pluginsDbPath],
                };
            }
        }
        return { mcpServers: servers };
    }
    /**
     * Write the MCP config to a temporary file and return the path.
     */
    writeMcpConfigFile(config) {
        const filePath = path.join('/tmp', `mcp-config-${Date.now()}.json`);
        fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
        return filePath;
    }
    /**
     * Sanitize a project name for use as a server-name prefix.
     * Replaces non-alphanumeric characters with underscores.
     */
    sanitize(name) {
        return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
    }
};
exports.McpGenService = McpGenService;
exports.McpGenService = McpGenService = __decorate([
    (0, common_1.Injectable)()
], McpGenService);
