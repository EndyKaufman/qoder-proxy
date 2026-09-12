"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.ConnectionRegistry = void 0;
const common_1 = require("@nestjs/common");
const project_config_service_1 = require("../project-config/project-config.service");
/**
 * Provides connection helpers for dashboard apps to access project services.
 *
 * Dashboard app controller.js files can use these to interact with
 * the services configured for each project.
 */
let ConnectionRegistry = class ConnectionRegistry {
    constructor(projectConfigService) {
        this.projectConfigService = projectConfigService;
    }
    /**
     * Get PostgreSQL connection info for a project.
     * Returns a connection string suitable for pg or similar libraries.
     */
    getPgConnection(projectName) {
        const project = this.projectConfigService.resolveByNameOrAlias(projectName);
        if (!project?.postgres)
            return null;
        const { host, port, user, password, database } = project.postgres;
        return {
            connectionString: `postgresql://${user}:${password}@${host}:${port}/${database}`,
            config: project.postgres,
        };
    }
    /**
     * Get Redis connection info for a project.
     */
    getRedisConnection(projectName) {
        const project = this.projectConfigService.resolveByNameOrAlias(projectName);
        if (!project?.redis)
            return null;
        const { host, port, db } = project.redis;
        return {
            url: `redis://${host}:${port}/${db ?? 0}`,
            config: project.redis,
        };
    }
    /**
     * Get MinIO connection info for a project.
     */
    getMinioClient(projectName) {
        const project = this.projectConfigService.resolveByNameOrAlias(projectName);
        if (!project?.minio)
            return null;
        const { endpoint, port, access_key, secret_key, bucket, use_ssl } = project.minio;
        return { endpoint, port, accessKey: access_key, secretKey: secret_key, bucket, useSSL: !!use_ssl };
    }
    /**
     * Get NATS connection info for a project.
     */
    getNatsConnection(projectName) {
        const project = this.projectConfigService.resolveByNameOrAlias(projectName);
        if (!project?.nats)
            return null;
        return { url: project.nats.url };
    }
    /**
     * Get Docker connection info (shared, not per-project).
     */
    getDockerConnection() {
        const projects = this.projectConfigService.getAll();
        for (const p of projects) {
            if (p.docker)
                return { host: p.docker.host };
        }
        return null;
    }
    /**
     * Get the file system path for a project.
     */
    getProjectPath(projectName) {
        const project = this.projectConfigService.resolveByNameOrAlias(projectName);
        return project?.path || null;
    }
};
exports.ConnectionRegistry = ConnectionRegistry;
exports.ConnectionRegistry = ConnectionRegistry = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [project_config_service_1.ProjectConfigService])
], ConnectionRegistry);
