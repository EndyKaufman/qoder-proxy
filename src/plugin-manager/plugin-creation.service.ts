import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as fs from 'fs';
import * as path from 'path';
import type { AppConfig } from '../config/configuration';
import { PluginStorageService } from '../plugin-storage/plugin-storage.service';
import { PluginLoaderService } from './plugin-loader.service';
import {
  validateHtml,
  validateJsSyntax,
  validateControllerContract,
  validateOpenApiSpec,
  generateOpenApiFromRoutes,
} from './plugin-validator';
import { runFixLoop, buildRefusalMessage } from './plugin-fix-loop';
import type { PluginFiles } from '../plugin-storage/plugin-storage.models';

/**
 * Result of a plugin creation attempt.
 */
export interface PluginCreationResult {
  success: boolean;
  slug?: string;
  version?: string;
  error?: string;
}

/**
 * Handles the creation of plugins via qodercli.
 *
 * Flow:
 * 1. Spawn qodercli with MCP + system prompt (including optional OpenAPI spec)
 * 2. Parse stdout to extract created files
 * 3. Validate HTML, JS syntax, controller contract, OpenAPI conformance
 * 4. If errors: run fix loop (3 fix + 3 regen attempts)
 * 5. Save to SQLite + filesystem
 * 6. Load the plugin
 */
@Injectable()
export class PluginCreationService {
  constructor(
    private configService: ConfigService<AppConfig>,
    private pluginStorage: PluginStorageService,
    private pluginLoader: PluginLoaderService,
  ) {}

  /**
   * Create a plugin from a prompt.
   *
   * @param prompt - Natural language description of the plugin
   * @param projectContext - System prompt context (MCP servers, project catalog)
   * @param openApiSpec - Optional OpenAPI YAML spec as contract
   * @param spawnFn - Function to spawn qodercli (injectable for testing)
   */
  async createPlugin(
    prompt: string,
    projectContext: string,
    openApiSpec?: string,
    spawnFn?: (prompt: string, systemPrompt: string) => Promise<string>,
  ): Promise<PluginCreationResult> {
    // Build system prompt with plugin contract
    const systemPrompt = this.buildSystemPrompt(projectContext, openApiSpec);

    // Spawn function (default: would use QoderCliService, but injectable for tests)
    const spawn = spawnFn || this.defaultSpawn.bind(this);

    // Initial creation
    let stdout: string;
    try {
      stdout = await spawn(prompt, systemPrompt);
    } catch (err: any) {
      return { success: false, error: `Failed to spawn qodercli: ${err.message}` };
    }

    // Parse files from stdout
    let files = this.parseFilesFromOutput(stdout);
    if (!files || Object.keys(files).length === 0) {
      return { success: false, error: 'No files extracted from qodercli output' };
    }

    // Validate
    let validationErrors = await this.validateFiles(files);

    // If OpenAPI spec provided, validate conformance
    if (openApiSpec && files['controller.js']) {
      const routes = this.extractRoutesFromController(files['controller.js']);
      if (routes.length > 0) {
        const specResult = validateOpenApiSpec(routes, openApiSpec);
        if (!specResult.valid) {
          validationErrors.push(...specResult.errors);
        }
      }
    }

    // Fix loop if validation failed
    if (validationErrors.length > 0) {
      const fixResult = runFixLoop(prompt, validationErrors);
      let fixed = false;

      for (const attempt of fixResult.prompts) {
        try {
          const fixStdout = await spawn(attempt.prompt, systemPrompt);
          const fixFiles = this.parseFilesFromOutput(fixStdout);
          if (!fixFiles || Object.keys(fixFiles).length === 0) continue;

          const fixErrors = await this.validateFiles(fixFiles);
          if (fixErrors.length === 0) {
            files = fixFiles;
            fixed = true;
            break;
          }
        } catch {
          // Continue to next attempt
        }
      }

      if (!fixed) {
        return { success: false, error: buildRefusalMessage(prompt) };
      }
    }

    // Extract meta from files
    const meta = this.extractMeta(files);
    const slug = this.slugify(meta.name || prompt.substring(0, 30));

    // Generate auto-spec if no OpenAPI was provided
    let finalOpenApiSpec = openApiSpec || null;
    if (!finalOpenApiSpec && files['controller.js']) {
      const routes = this.extractRoutesFromController(files['controller.js']);
      if (routes.length > 0) {
        finalOpenApiSpec = generateOpenApiFromRoutes(routes, meta);
      }
    }

    // Save to SQLite
    let plugin = this.pluginStorage.getPluginBySlug(slug);
    if (!plugin) {
      plugin = this.pluginStorage.createPlugin({
        slug,
        name: meta.name || slug,
        description: meta.description || '',
        icon: meta.icon || 'puzzle',
      });
    }

    const version = this.getNextVersion(plugin.id);
    const pluginVersion = this.pluginStorage.createVersion({
      pluginId: plugin.id,
      version,
      prompt,
      files,
      openApiSpec: finalOpenApiSpec || undefined,
    });

    this.pluginStorage.setActiveVersion(plugin.id, pluginVersion.id);

    // Write files to disk cache
    const filesDir = this.configService.get<string>('PLUGINS_FILES_DIR') || '/data/plugins';
    const versionDir = path.join(filesDir, slug, version);
    fs.mkdirSync(versionDir, { recursive: true });
    for (const [filename, content] of Object.entries(files)) {
      fs.writeFileSync(path.join(versionDir, filename), content, 'utf-8');
    }

    // Load the plugin
    this.pluginLoader.loadPlugin(plugin, pluginVersion);

    return { success: true, slug, version };
  }

  // -------------------------------------------------------------------------
  // Internal helpers
  // -------------------------------------------------------------------------

  private buildSystemPrompt(projectContext: string, openApiSpec?: string): string {
    const parts = [
      projectContext,
      '',
      '## Plugin Contract',
      'You are creating a plugin for qoder-proxy. Create exactly these files:',
      '- meta.json: {"name": "...", "description": "...", "icon": "..."}',
      '- index.html: Frontend UI (must have <html> and <body> tags)',
      '- controller.js: Backend API routes',
      '',
      'controller.js must export:',
      '```',
      'module.exports = {',
      '  meta: { name: "...", description: "...", icon: "..." },',
      '  init({ pg, redis, minio, storage, db }) { /* setup */ },',
      '  routes: [',
      '    { method: "get", path: "/endpoint", handler: async (req, res) => {} },',
      '  ],',
      '  setupStream: (req, res) => {} // optional SSE',
      '};',
      '```',
      '',
      'storage API: storage.get(key), storage.set(key, value), storage.delete(key), storage.list()',
      'db: better-sqlite3 instance for plugin data (create your own tables)',
      'pg/redis/minio: connection helpers (call with project name)',
    ];

    if (openApiSpec) {
      parts.push('');
      parts.push('## Plugin Contract (OpenAPI)');
      parts.push('The plugin MUST implement exactly these endpoints:');
      parts.push(openApiSpec);
    }

    return parts.join('\n');
  }

  /**
   * Default spawn function — would use QoderCliService in production.
   * For now, returns empty string (overridden by tests or ChatController).
   */
  private async defaultSpawn(_prompt: string, _systemPrompt: string): Promise<string> {
    throw new Error('PluginCreationService: spawn function not provided');
  }

  /**
   * Parse created files from qodercli stdout.
   * Looks for file write patterns in the output.
   */
  parseFilesFromOutput(stdout: string): PluginFiles {
    const files: PluginFiles = {};

    // Look for patterns like:
    // Writing to /path/to/file: or
    // File: filename\n---content---
    // Or JSON blocks with file contents

    // Try to extract from structured output (qodercli tool_use results)
    try {
      const lines = stdout.split('\n');
      let currentFile: string | null = null;
      let currentContent: string[] = [];
      let inFile = false;

      for (const line of lines) {
        // Detect file start markers
        const fileMatch = line.match(/(?:Writing|Created|File:)\s+(meta\.json|index\.html|controller\.js)/);
        if (fileMatch) {
          if (currentFile && currentContent.length > 0) {
            files[currentFile] = currentContent.join('\n').trim();
          }
          currentFile = fileMatch[1];
          currentContent = [];
          inFile = true;
          continue;
        }

        if (inFile && line.startsWith('---')) {
          if (currentFile) {
            files[currentFile] = currentContent.join('\n').trim();
          }
          currentFile = null;
          currentContent = [];
          inFile = false;
          continue;
        }

        if (inFile) {
          currentContent.push(line);
        }
      }

      // Flush last file
      if (currentFile && currentContent.length > 0) {
        files[currentFile] = currentContent.join('\n').trim();
      }
    } catch {
      // Ignore parse errors
    }

    return files;
  }

  /**
   * Validate all plugin files.
   */
  async validateFiles(files: PluginFiles): Promise<string[]> {
    const errors: string[] = [];

    // Validate HTML
    if (files['index.html']) {
      const htmlResult = validateHtml(files['index.html']);
      if (!htmlResult.valid) {
        errors.push(...htmlResult.errors.map((e) => `index.html: ${e}`));
      }
    }

    // Validate JS syntax (write to temp file for node --check)
    if (files['controller.js']) {
      const tmpPath = path.join('/tmp', `validate-${Date.now()}.js`);
      try {
        fs.writeFileSync(tmpPath, files['controller.js'], 'utf-8');
        const jsResult = await validateJsSyntax(tmpPath);
        if (!jsResult.valid) {
          errors.push(...jsResult.errors.map((e) => `controller.js: ${e}`));
        }

        // Validate controller contract
        if (jsResult.valid) {
          const contractResult = validateControllerContract(tmpPath);
          if (!contractResult.valid) {
            errors.push(...contractResult.errors.map((e) => `controller.js: ${e}`));
          }
        }
      } finally {
        try { fs.unlinkSync(tmpPath); } catch { /* ignore */ }
      }
    }

    return errors;
  }

  /**
   * Extract meta from files.
   */
  private extractMeta(files: PluginFiles): { name: string; description: string; icon: string } {
    if (files['meta.json']) {
      try {
        const meta = JSON.parse(files['meta.json']);
        return {
          name: meta.name || 'Unnamed Plugin',
          description: meta.description || '',
          icon: meta.icon || 'puzzle',
        };
      } catch { /* ignore */ }
    }
    return { name: 'Unnamed Plugin', description: '', icon: 'puzzle' };
  }

  /**
   * Extract routes from controller.js content (static analysis).
   */
  private extractRoutesFromController(content: string): Array<{ method: string; path: string }> {
    const routes: Array<{ method: string; path: string }> = [];
    // Match patterns like: { method: 'get', path: '/query' }
    const routeRegex = /method:\s*['"](\w+)['"]\s*,\s*path:\s*['"]([^'"]+)['"]/g;
    let match;
    while ((match = routeRegex.exec(content)) !== null) {
      routes.push({ method: match[1], path: match[2] });
    }
    return routes;
  }

  /**
   * Get next semver version for a plugin.
   */
  private getNextVersion(pluginId: number): string {
    const versions = this.pluginStorage.getVersions(pluginId);
    if (versions.length === 0) return '1.0.0';

    const last = versions[0]; // DESC order
    const parts = last.version.split('.').map(Number);
    parts[2] = (parts[2] || 0) + 1; // bump patch
    return parts.join('.');
  }

  /**
   * Slugify a string for use as a plugin slug.
   */
  private slugify(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')
      .substring(0, 50);
  }
}
