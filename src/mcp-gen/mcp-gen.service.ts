import { Injectable } from '@nestjs/common';
import * as fs from 'fs';
import * as path from 'path';
import type { ProjectConfig } from '../project-config/project-config.models';

/**
 * Shape of a single MCP server entry in the generated config.
 */
interface McpServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

/**
 * Full MCP config shape (what --mcp-config expects).
 */
export interface McpConfig {
  mcpServers: Record<string, McpServerEntry>;
}

/**
 * Generates a combined MCP JSON configuration for all loaded projects.
 *
 * Server naming convention:
 *  - Per-project: `{service}_{projectName}` (e.g. pg_alpha, redis_beta)
 *  - Global (shared): `playwright`, `docker` (no project prefix)
 */
@Injectable()
export class McpGenService {
  /**
   * Generate a full MCP config object from the list of projects.
   */
  generateMcpConfig(projects: ProjectConfig[]): McpConfig {
    const servers: Record<string, McpServerEntry> = {};
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

    return { mcpServers: servers };
  }

  /**
   * Write the MCP config to a temporary file and return the path.
   */
  writeMcpConfigFile(config: McpConfig): string {
    const filePath = path.join('/tmp', `mcp-config-${Date.now()}.json`);
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2), 'utf-8');
    return filePath;
  }

  /**
   * Sanitize a project name for use as a server-name prefix.
   * Replaces non-alphanumeric characters with underscores.
   */
  private sanitize(name: string): string {
    return name.replace(/[^a-zA-Z0-9]/g, '_').toLowerCase();
  }
}
