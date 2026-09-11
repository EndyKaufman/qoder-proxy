import { Injectable } from '@nestjs/common';
import { ProjectConfigService } from '../project-config/project-config.service';
import type { ProjectConfig } from '../project-config/project-config.models';

/**
 * Provides connection helpers for dashboard apps to access project services.
 *
 * Dashboard app controller.js files can use these to interact with
 * the services configured for each project.
 */
@Injectable()
export class ConnectionRegistry {
  constructor(private projectConfigService: ProjectConfigService) {}

  /**
   * Get PostgreSQL connection info for a project.
   * Returns a connection string suitable for pg or similar libraries.
   */
  getPgConnection(projectName: string): { connectionString: string; config: ProjectConfig['postgres'] } | null {
    const project = this.projectConfigService.resolveByNameOrAlias(projectName);
    if (!project?.postgres) return null;
    const { host, port, user, password, database } = project.postgres;
    return {
      connectionString: `postgresql://${user}:${password}@${host}:${port}/${database}`,
      config: project.postgres,
    };
  }

  /**
   * Get Redis connection info for a project.
   */
  getRedisConnection(projectName: string): { url: string; config: ProjectConfig['redis'] } | null {
    const project = this.projectConfigService.resolveByNameOrAlias(projectName);
    if (!project?.redis) return null;
    const { host, port, db } = project.redis;
    return {
      url: `redis://${host}:${port}/${db ?? 0}`,
      config: project.redis,
    };
  }

  /**
   * Get MinIO connection info for a project.
   */
  getMinioClient(projectName: string): {
    endpoint: string;
    port: number;
    accessKey: string;
    secretKey: string;
    bucket?: string;
    useSSL: boolean;
  } | null {
    const project = this.projectConfigService.resolveByNameOrAlias(projectName);
    if (!project?.minio) return null;
    const { endpoint, port, access_key, secret_key, bucket, use_ssl } = project.minio;
    return { endpoint, port, accessKey: access_key, secretKey: secret_key, bucket, useSSL: !!use_ssl };
  }

  /**
   * Get NATS connection info for a project.
   */
  getNatsConnection(projectName: string): { url: string } | null {
    const project = this.projectConfigService.resolveByNameOrAlias(projectName);
    if (!project?.nats) return null;
    return { url: project.nats.url };
  }

  /**
   * Get Docker connection info (shared, not per-project).
   */
  getDockerConnection(): { host: string } | null {
    const projects = this.projectConfigService.getAll();
    for (const p of projects) {
      if (p.docker) return { host: p.docker.host };
    }
    return null;
  }

  /**
   * Get the file system path for a project.
   */
  getProjectPath(projectName: string): string | null {
    const project = this.projectConfigService.resolveByNameOrAlias(projectName);
    return project?.path || null;
  }
}
