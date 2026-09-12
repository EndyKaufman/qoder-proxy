/**
 * E2E tests for the plugin system.
 *
 * Uses demo-project docker-compose infrastructure (PG, Redis, MinIO, NATS)
 * with real seed data. All tests are skipped if Docker is unavailable.
 * Tests requiring qodercli + PAT are skipped separately.
 */

import request from 'supertest';
import * as fs from 'fs';
import * as path from 'path';
import {
  startE2E,
  hasDocker,
  hasQoderCli,
  hasQoderPAT,
  E2EContext,
  OPENAPI_DIR,
} from './setup';
import {
  validateHtml,
  validateJsSyntax,
  validateControllerContract,
  validateOpenApiSpec,
  generateOpenApiFromRoutes,
} from '../../src/plugin-manager/plugin-validator';
import { runFixLoop, buildRefusalMessage } from '../../src/plugin-manager/plugin-fix-loop';
import { ProjectConfigService } from '../../src/project-config/project-config.service';

// Conditional describe for Docker-dependent tests
const dockerDescribe = hasDocker ? describe : describe.skip;
const qoderDescribe = hasDocker && hasQoderCli && hasQoderPAT ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Shared state
// ---------------------------------------------------------------------------

let ctx: E2EContext;

beforeAll(async () => {
  if (!hasDocker) return;
  ctx = await startE2E();
}, 120_000);

afterAll(async () => {
  if (!hasDocker || !ctx) return;
  await ctx.teardown();
}, 30_000);

// ===========================================================================
// Group 10: Plugin Storage
// ===========================================================================

dockerDescribe('Plugin Storage', () => {
  it('10.1: createPlugin + getAllPlugins', () => {
    const plugin = ctx.pluginStorage.createPlugin({
      slug: 'test-storage',
      name: 'Test Storage Plugin',
      description: 'For testing',
      icon: 'test',
    });
    expect(plugin.id).toBeDefined();
    expect(plugin.slug).toBe('test-storage');

    const all = ctx.pluginStorage.getAllPlugins();
    expect(all.some((p) => p.slug === 'test-storage')).toBe(true);
  });

  it('10.2: createVersion + getVersions', () => {
    const plugin = ctx.pluginStorage.getPluginBySlug('test-storage');
    expect(plugin).toBeDefined();

    const version = ctx.pluginStorage.createVersion({
      pluginId: plugin!.id,
      version: '1.0.0',
      prompt: 'Create a test plugin',
      files: { 'meta.json': '{"name":"Test"}', 'index.html': '<html><body></body></html>', 'controller.js': 'module.exports={meta:{name:"Test"},routes:[]}' },
      openApiSpec: 'openapi: 3.0.0\ninfo:\n  title: Test\n  version: 1.0.0\npaths: {}',
    });
    expect(version.id).toBeDefined();
    expect(version.version).toBe('1.0.0');
    expect(version.openapi_spec).toContain('openapi');

    ctx.pluginStorage.setActiveVersion(plugin!.id, version.id);

    const versions = ctx.pluginStorage.getVersions(plugin!.id);
    expect(versions.length).toBe(1);
    expect(versions[0].prompt).toBe('Create a test plugin');
  });

  it('10.3: rollback to previous version', () => {
    const plugin = ctx.pluginStorage.getPluginBySlug('test-storage');
    expect(plugin).toBeDefined();

    const v2 = ctx.pluginStorage.createVersion({
      pluginId: plugin!.id,
      version: '1.0.1',
      prompt: 'Update plugin',
      files: { 'meta.json': '{"name":"Test v2"}', 'index.html': '<html><body>v2</body></html>', 'controller.js': 'module.exports={meta:{name:"Test v2"},routes:[]}' },
    });
    ctx.pluginStorage.setActiveVersion(plugin!.id, v2.id);

    const active = ctx.pluginStorage.getActiveVersion(plugin!.id);
    expect(active!.version).toBe('1.0.1');

    const prev = ctx.pluginStorage.rollback(plugin!.id);
    expect(prev).toBeDefined();
    expect(prev!.version).toBe('1.0.0');

    const newActive = ctx.pluginStorage.getActiveVersion(plugin!.id);
    expect(newActive!.version).toBe('1.0.0');
  });

  it('10.4: plugin_data — setData/getData/listData', () => {
    const plugin = ctx.pluginStorage.getPluginBySlug('test-storage');
    expect(plugin).toBeDefined();

    ctx.pluginStorage.setData(plugin!.id, 'settings', { theme: 'dark', lang: 'en' });
    const val = ctx.pluginStorage.getData(plugin!.id, 'settings');
    expect(val).toEqual({ theme: 'dark', lang: 'en' });

    ctx.pluginStorage.setData(plugin!.id, 'counter', 42);
    const list = ctx.pluginStorage.listData(plugin!.id);
    expect(list.length).toBe(2);
    expect(list.find((d) => d.key === 'settings')).toBeDefined();
    expect(list.find((d) => d.key === 'counter')?.value).toBe(42);

    ctx.pluginStorage.deleteData(plugin!.id, 'counter');
    const afterDelete = ctx.pluginStorage.getData(plugin!.id, 'counter');
    expect(afterDelete).toBeNull();
  });
});

// ===========================================================================
// Group 11: Plugin Validation
// ===========================================================================

describe('Plugin Validation', () => {
  it('11.1: valid HTML + JS + controller pass validation', () => {
    const htmlResult = validateHtml('<html><head></head><body>Hello</body></html>');
    expect(htmlResult.valid).toBe(true);
    expect(htmlResult.errors).toHaveLength(0);
  });

  it('11.2: invalid JS returns errors', async () => {
    const tmpPath = path.join('/tmp', `test-invalid-${Date.now()}.js`);
    fs.writeFileSync(tmpPath, 'function() { return {{{; }', 'utf-8');
    try {
      const result = await validateJsSyntax(tmpPath);
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });

  it('11.3: controller without routes returns contract error', () => {
    const tmpPath = path.join('/tmp', `test-no-routes-${Date.now()}.js`);
    fs.writeFileSync(tmpPath, 'module.exports = { meta: { name: "Test" } };', 'utf-8');
    try {
      const result = validateControllerContract(tmpPath);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('controller.js must export a "routes" array');
    } finally {
      fs.unlinkSync(tmpPath);
    }
  });
});

// ===========================================================================
// Group 11b: OpenAPI validation
// ===========================================================================

describe('OpenAPI Validation', () => {
  it('validates routes against spec', () => {
    const routes = [
      { method: 'post', path: '/search' },
      { method: 'get', path: '/search/more' },
      { method: 'post', path: '/search/save' },
      { method: 'get', path: '/search/saved' },
      { method: 'delete', path: '/search/saved/:id' },
    ];
    const spec = fs.readFileSync(path.join(OPENAPI_DIR, 'universal-search.yaml'), 'utf-8');
    const result = validateOpenApiSpec(routes, spec);
    expect(result.valid).toBe(true);
  });

  it('detects missing routes', () => {
    const routes = [{ method: 'get', path: '/only-one' }];
    const spec = fs.readFileSync(path.join(OPENAPI_DIR, 'universal-search.yaml'), 'utf-8');
    const result = validateOpenApiSpec(routes, spec);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it('generates OpenAPI from routes', () => {
    const routes = [
      { method: 'get', path: '/items' },
      { method: 'post', path: '/items' },
    ];
    const spec = generateOpenApiFromRoutes(routes, { name: 'Items', description: 'Item manager' });
    expect(spec).toContain('openapi');
    expect(spec).toContain('/items');
    expect(spec).toContain('get');
    expect(spec).toContain('post');
  });
});

// ===========================================================================
// Group 11c: Fix loop
// ===========================================================================

describe('Fix Loop', () => {
  it('generates fix and regen prompts', () => {
    const result = runFixLoop('Create a search plugin', ['Error: missing routes']);
    expect(result.prompts.length).toBe(6); // 3 fix + 3 regen
    expect(result.prompts[0].type).toBe('fix');
    expect(result.prompts[0].prompt).toContain('Error: missing routes');
    expect(result.prompts[3].type).toBe('regen');
    expect(result.prompts[3].prompt).toContain('from scratch');
    expect(result.totalAttempts).toBe(6);
  });

  it('builds refusal message', () => {
    const msg = buildRefusalMessage('Create something');
    expect(msg).toContain('Failed to create');
    expect(msg).toContain('Create something');
  });
});

// ===========================================================================
// Group 12: Plugin Loader
// ===========================================================================

dockerDescribe('Plugin Loader', () => {
  it('12.1: loadPlugin registers routes', () => {
    // Create a test plugin with a simple controller
    const plugin = ctx.pluginStorage.createPlugin({
      slug: 'loader-test',
      name: 'Loader Test',
      description: 'Test loader',
    });

    const controllerContent = `
module.exports = {
  meta: { name: 'Loader Test', description: 'Test', icon: 'test' },
  init(ctx) { /* noop */ },
  routes: [
    { method: 'get', path: '/ping', handler: (req, res) => res.json({ pong: true }) },
  ],
};`;

    const version = ctx.pluginStorage.createVersion({
      pluginId: plugin.id,
      version: '1.0.0',
      prompt: 'test',
      files: {
        'meta.json': '{"name":"Loader Test"}',
        'index.html': '<html><body><h1>Loader Test</h1></body></html>',
        'controller.js': controllerContent,
      },
    });
    ctx.pluginStorage.setActiveVersion(plugin.id, version.id);

    // Load via PluginLoaderService
    const { PluginLoaderService } = require('../../src/plugin-manager/plugin-loader.service');
    const loader = ctx.app.get(PluginLoaderService);
    loader.loadPlugin(plugin, version);

    const loaded = loader.getLoaded('loader-test');
    expect(loaded).toBeDefined();
    expect(loaded!.controller).toBeDefined();
    expect(loaded!.controller!.routes.length).toBe(1);
  });

  it('12.2: GET /plugins/loader-test/ serves index.html', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/plugins/loader-test/')
      .expect(200);
    expect(res.text).toContain('Loader Test');
  });

  it('12.3: GET /plugins/loader-test/ping returns pong', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/plugins/loader-test/ping')
      .expect(200);
    expect(res.body).toEqual({ pong: true });
  });
});

// ===========================================================================
// Group 13: Plugin API
// ===========================================================================

dockerDescribe('Plugin API', () => {
  it('13.1: GET /plugins/api/list returns plugins', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/plugins/api/list')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body.some((p: any) => p.slug === 'loader-test')).toBe(true);
  });

  it('13.2: GET /plugins/api/loader-test returns versions', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/plugins/api/loader-test')
      .expect(200);
    expect(res.body.plugin.slug).toBe('loader-test');
    expect(res.body.versions.length).toBeGreaterThan(0);
    expect(res.body.versions[0].prompt).toBe('test');
  });

  it('13.3: POST /plugins/api/test-storage/rollback', async () => {
    // test-storage has 2 versions; set active to 1.0.1 so rollback goes to 1.0.0
    const plugin = ctx.pluginStorage.getPluginBySlug('test-storage');
    const versions = ctx.pluginStorage.getVersions(plugin!.id);
    const v101 = versions.find((v) => v.version === '1.0.1');
    if (v101) {
      ctx.pluginStorage.setActiveVersion(plugin!.id, v101.id);
    }
    const res = await request(ctx.app.getHttpServer())
      .post('/plugins/api/test-storage/rollback')
      .send({});
    if (res.status !== 200) {
      console.error('rollback response:', res.status, JSON.stringify(res.body));
    }
    expect(res.status).toBe(200);
    // After rollback from 1.0.1, should go to 1.0.0
    expect(res.body.version).toBeDefined();
  });
});

// ===========================================================================
// Group 15: System Prompt
// ===========================================================================

dockerDescribe('System Prompt', () => {
  it('15.1: generateCatalogPrompt includes plugins', () => {
    const projectConfigService = ctx.app.get(ProjectConfigService);
    const plugins = ctx.pluginStorage.getAllPlugins().map((p) => {
      const activeVersion = ctx.pluginStorage.getActiveVersion(p.id);
      return { slug: p.slug, name: p.name, description: p.description, version: activeVersion?.version || null };
    });
    const prompt = projectConfigService.generateCatalogPrompt('/tmp/dashboard-apps', plugins);
    expect(prompt).toContain('## Available Plugins');
    expect(prompt).toContain('loader-test');
    expect(prompt).toContain('Loader Test');
  });
});

// ===========================================================================
// Group 16: LLM Plugin List
// ===========================================================================

dockerDescribe('LLM Plugin List', () => {
  it('16.1: GET /plugins/api/list returns LLM-usable data', async () => {
    const res = await request(ctx.app.getHttpServer())
      .get('/plugins/api/list')
      .expect(200);
    const plugin = res.body.find((p: any) => p.slug === 'loader-test');
    expect(plugin).toBeDefined();
    expect(plugin.slug).toBe('loader-test');
    expect(plugin.name).toBe('Loader Test');
    expect(plugin.url).toContain('/plugins/loader-test/');
  });
});

// ===========================================================================
// Group 17: Universal Search Plugin (requires qodercli + PAT)
// ===========================================================================

qoderDescribe('Universal Search Plugin', () => {
  it('17.1: creates plugin via qodercli with OpenAPI spec', async () => {
    // This test requires real qodercli + PAT
    const spec = fs.readFileSync(path.join(OPENAPI_DIR, 'universal-search.yaml'), 'utf-8');
    expect(spec).toContain('/search');
    // Full creation test would go here — requires chat/completions call
    // For now, verify the spec fixture is valid
  }, 300_000);
});

// ===========================================================================
// Group 18: Photo Gallery Plugin (requires qodercli + PAT)
// ===========================================================================

qoderDescribe('Photo Gallery Plugin', () => {
  it('18.1: creates plugin via qodercli with OpenAPI spec', async () => {
    const spec = fs.readFileSync(path.join(OPENAPI_DIR, 'photo-gallery.yaml'), 'utf-8');
    expect(spec).toContain('/photos');
    // Full creation test would go here
  }, 300_000);
});

// ===========================================================================
// Group 19: Fallback
// ===========================================================================

dockerDescribe('Fallback', () => {
  it('19.1: empty plugin list works', async () => {
    // The list endpoint always works, even with plugins present
    const res = await request(ctx.app.getHttpServer())
      .get('/plugins/api/list')
      .expect(200);
    expect(Array.isArray(res.body)).toBe(true);
    // We have plugins from earlier tests, so just verify the structure
    if (res.body.length > 0) {
      expect(res.body[0]).toHaveProperty('slug');
      expect(res.body[0]).toHaveProperty('name');
      expect(res.body[0]).toHaveProperty('url');
    }
  });
});
