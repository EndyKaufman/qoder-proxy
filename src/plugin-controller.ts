import {
  Controller,
  Get,
  Post,
  Param,
  Body,
  Res,
  HttpCode,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiProperty } from '@nestjs/swagger';
import { Response } from 'express';
import { PluginStorageService } from './plugin-storage/plugin-storage.service';
import { PluginLoaderService } from './plugin-manager/plugin-loader.service';

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

class RollbackDto {
  @ApiProperty({ description: 'Version to rollback to (optional, defaults to previous)', required: false })
  version?: string;
}

// ---------------------------------------------------------------------------
// Plugin API Controller
// ---------------------------------------------------------------------------

@ApiTags('plugins')
@Controller('plugins/api')
export class PluginController {
  constructor(
    private pluginStorage: PluginStorageService,
    private pluginLoader: PluginLoaderService,
  ) {}

  /**
   * GET /plugins/api/list
   * Returns all plugins with their active version info.
   * Used by LLM (via system prompt) and UI.
   */
  @Get('list')
  @ApiOperation({ summary: 'List all plugins' })
  @ApiResponse({ status: 200, description: 'Array of plugins' })
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
  @Get(':slug')
  @ApiOperation({ summary: 'Get plugin details with versions' })
  @ApiResponse({ status: 200, description: 'Plugin with versions' })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  getPlugin(@Param('slug') slug: string, @Res() res: Response) {
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
  @Get(':slug/:version')
  @ApiOperation({ summary: 'Get specific version details' })
  @ApiResponse({ status: 200, description: 'Version details with files' })
  @ApiResponse({ status: 404, description: 'Version not found' })
  getVersion(@Param('slug') slug: string, @Param('version') version: string, @Res() res: Response) {
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
  @Post(':slug/rollback')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rollback to previous version' })
  @ApiResponse({ status: 200, description: 'Rolled back successfully' })
  @ApiResponse({ status: 404, description: 'Plugin not found' })
  rollback(@Param('slug') slug: string, @Body() _body: RollbackDto, @Res() res: Response) {
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
}
