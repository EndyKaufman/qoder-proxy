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
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.PluginController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const plugin_storage_service_1 = require("./plugin-storage/plugin-storage.service");
const plugin_loader_service_1 = require("./plugin-manager/plugin-loader.service");
// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------
class RollbackDto {
}
__decorate([
    (0, swagger_1.ApiProperty)({ description: 'Version to rollback to (optional, defaults to previous)', required: false }),
    __metadata("design:type", String)
], RollbackDto.prototype, "version", void 0);
// ---------------------------------------------------------------------------
// Plugin API Controller
// ---------------------------------------------------------------------------
let PluginController = class PluginController {
    constructor(pluginStorage, pluginLoader) {
        this.pluginStorage = pluginStorage;
        this.pluginLoader = pluginLoader;
    }
    /**
     * GET /plugins/api/list
     * Returns all plugins with their active version info.
     * Used by LLM (via system prompt) and UI.
     */
    listPlugins() {
        const plugins = this.pluginStorage.getAllPlugins();
        return plugins.map((p) => {
            const activeVersion = this.pluginStorage.getActiveVersion(p.id);
            return {
                slug: p.slug,
                name: p.name,
                description: p.description,
                icon: p.icon,
                version: activeVersion?.version || null,
                url: `/plugins/${p.slug}/`,
            };
        });
    }
    /**
     * GET /plugins/api/:slug
     * Returns plugin details with all versions.
     */
    getPlugin(slug, res) {
        const plugin = this.pluginStorage.getPluginBySlug(slug);
        if (!plugin) {
            return res.status(404).json({ error: { message: 'Plugin not found' } });
        }
        const versions = this.pluginStorage.getVersions(plugin.id);
        const activeVersion = this.pluginStorage.getActiveVersion(plugin.id);
        return res.json({
            plugin: {
                slug: plugin.slug,
                name: plugin.name,
                description: plugin.description,
                icon: plugin.icon,
                activeVersion: activeVersion?.version || null,
            },
            versions: versions.map((v) => ({
                version: v.version,
                prompt: v.prompt,
                openapi_spec: v.openapi_spec,
                created_at: v.created_at,
            })),
        });
    }
    /**
     * GET /plugins/api/:slug/:version
     * Returns details of a specific version including files.
     */
    getVersion(slug, version, res) {
        const plugin = this.pluginStorage.getPluginBySlug(slug);
        if (!plugin) {
            return res.status(404).json({ error: { message: 'Plugin not found' } });
        }
        const versions = this.pluginStorage.getVersions(plugin.id);
        const target = versions.find((v) => v.version === version);
        if (!target) {
            return res.status(404).json({ error: { message: 'Version not found' } });
        }
        const files = this.pluginStorage.parseFiles(target);
        return res.json({
            version: target.version,
            prompt: target.prompt,
            openapi_spec: target.openapi_spec,
            files: Object.keys(files),
            created_at: target.created_at,
        });
    }
    /**
     * POST /plugins/api/:slug/rollback
     * Rollback to the previous version.
     */
    rollback(slug, _body, res) {
        const plugin = this.pluginStorage.getPluginBySlug(slug);
        if (!plugin) {
            return res.status(404).json({ error: { message: 'Plugin not found' } });
        }
        const prev = this.pluginStorage.rollback(plugin.id);
        if (!prev) {
            return res.status(400).json({ error: { message: 'No previous version to rollback to' } });
        }
        // Reload the plugin with the new active version
        this.pluginLoader.unloadPlugin(slug);
        this.pluginLoader.loadPlugin(plugin, prev);
        return res.json({ version: prev.version });
    }
};
exports.PluginController = PluginController;
__decorate([
    (0, common_1.Get)('list'),
    (0, swagger_1.ApiOperation)({ summary: 'List all plugins' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Array of plugins' }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "listPlugins", null);
__decorate([
    (0, common_1.Get)(':slug'),
    (0, swagger_1.ApiOperation)({ summary: 'Get plugin details with versions' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Plugin with versions' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Plugin not found' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "getPlugin", null);
__decorate([
    (0, common_1.Get)(':slug/:version'),
    (0, swagger_1.ApiOperation)({ summary: 'Get specific version details' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Version details with files' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Version not found' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Param)('version')),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, Object]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "getVersion", null);
__decorate([
    (0, common_1.Post)(':slug/rollback'),
    (0, common_1.HttpCode)(200),
    (0, swagger_1.ApiOperation)({ summary: 'Rollback to previous version' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: 'Rolled back successfully' }),
    (0, swagger_1.ApiResponse)({ status: 404, description: 'Plugin not found' }),
    __param(0, (0, common_1.Param)('slug')),
    __param(1, (0, common_1.Body)()),
    __param(2, (0, common_1.Res)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, RollbackDto, Object]),
    __metadata("design:returntype", void 0)
], PluginController.prototype, "rollback", null);
exports.PluginController = PluginController = __decorate([
    (0, swagger_1.ApiTags)('plugins'),
    (0, common_1.Controller)('plugins/api'),
    __metadata("design:paramtypes", [plugin_storage_service_1.PluginStorageService,
        plugin_loader_service_1.PluginLoaderService])
], PluginController);
