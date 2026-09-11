import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { DashboardAppsService } from '../../../src/dashboard-apps/dashboard-apps.service';

const makeConfigService = (appsDir: string) =>
  ({
    get: (key: string) => {
      if (key === 'DASHBOARD_APPS_DIR') return appsDir;
      return undefined;
    },
  }) as any;

describe('DashboardAppsService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'dash-apps-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should return empty list when no apps exist', () => {
    const service = new DashboardAppsService(makeConfigService(tmpDir));
    service.onModuleInit();
    expect(service.listApps()).toEqual([]);
    service.onModuleDestroy();
  });

  it('should scan and load dashboard apps with meta.json', () => {
    const appDir = path.join(tmpDir, 'test-app');
    fs.mkdirSync(appDir);
    fs.writeFileSync(path.join(appDir, 'meta.json'), JSON.stringify({
      name: 'Test App',
      description: 'A test dashboard app',
    }));
    fs.writeFileSync(path.join(appDir, 'index.html'), '<h1>Test</h1>');

    const service = new DashboardAppsService(makeConfigService(tmpDir));
    service.onModuleInit();

    const apps = service.listApps();
    expect(apps).toHaveLength(1);
    expect(apps[0].appName).toBe('test-app');
    expect(apps[0].meta.name).toBe('Test App');
    expect(apps[0].meta.description).toBe('A test dashboard app');
    service.onModuleDestroy();
  });

  it('should use directory name as fallback when no meta.json', () => {
    const appDir = path.join(tmpDir, 'no-meta-app');
    fs.mkdirSync(appDir);
    fs.writeFileSync(path.join(appDir, 'index.html'), '<h1>No Meta</h1>');

    const service = new DashboardAppsService(makeConfigService(tmpDir));
    service.onModuleInit();

    const apps = service.listApps();
    expect(apps).toHaveLength(1);
    expect(apps[0].meta.name).toBe('no-meta-app');
    service.onModuleDestroy();
  });

  it('should load controller.js routes', () => {
    const appDir = path.join(tmpDir, 'with-controller');
    fs.mkdirSync(appDir);
    fs.writeFileSync(path.join(appDir, 'meta.json'), '{"name":"ctrl-app"}');
    fs.writeFileSync(
      path.join(appDir, 'controller.js'),
      `module.exports = { routes: [{ method: 'get', path: '/api/data', handler: (req, res) => res.json({ ok: true }) }] };`,
    );

    const service = new DashboardAppsService(makeConfigService(tmpDir));
    service.onModuleInit();

    const app = service.getApp('with-controller');
    expect(app).toBeDefined();
    expect(app?.controller?.routes).toHaveLength(1);
    expect(app?.controller?.routes[0].method).toBe('get');
    expect(app?.controller?.routes[0].path).toBe('/api/data');
    service.onModuleDestroy();
  });

  it('should handle non-existent apps directory', () => {
    const service = new DashboardAppsService(makeConfigService('/nonexistent'));
    service.onModuleInit();
    expect(service.listApps()).toEqual([]);
    service.onModuleDestroy();
  });

  it('should load multiple apps', () => {
    fs.mkdirSync(path.join(tmpDir, 'app1'));
    fs.writeFileSync(path.join(tmpDir, 'app1', 'meta.json'), '{"name":"App 1"}');
    fs.mkdirSync(path.join(tmpDir, 'app2'));
    fs.writeFileSync(path.join(tmpDir, 'app2', 'meta.json'), '{"name":"App 2"}');

    const service = new DashboardAppsService(makeConfigService(tmpDir));
    service.onModuleInit();

    expect(service.listApps()).toHaveLength(2);
    service.onModuleDestroy();
  });
});
