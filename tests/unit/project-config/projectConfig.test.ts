import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { ProjectConfigService } from '../../../src/project-config/project-config.service';

// Minimal ConfigService mock
const makeConfigService = (configDir: string) =>
  ({
    get: (key: string) => {
      if (key === 'PROJECTS_CONFIG_DIR') return configDir;
      if (key === 'PROJECTS_ROOT_DIR') return '/projects';
      if (key === 'DASHBOARD_APPS_DIR') return '/dashboard-apps';
      return undefined;
    },
  }) as any;

describe('ProjectConfigService', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'proj-cfg-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('should load valid YAML configs', async () => {
    const yaml = `name: alpha\npath: /projects/alpha\naliases:\n  - a1\n  - project-alpha\n`;
    fs.writeFileSync(path.join(tmpDir, 'alpha.yaml'), yaml);

    const service = new ProjectConfigService(makeConfigService(tmpDir));
    await service.loadAll();

    const all = service.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe('alpha');
    expect(all[0].path).toBe('/projects/alpha');
    expect(all[0].aliases).toEqual(['a1', 'project-alpha']);
  });

  it('should skip configs missing required fields', async () => {
    // Missing path
    fs.writeFileSync(path.join(tmpDir, 'bad.yaml'), 'name: bad\n');
    // Missing name
    fs.writeFileSync(path.join(tmpDir, 'bad2.yaml'), 'path: /x\n');

    const service = new ProjectConfigService(makeConfigService(tmpDir));
    await service.loadAll();

    expect(service.getAll()).toHaveLength(0);
  });

  it('should resolve by name or alias (case-insensitive)', async () => {
    const yaml = `name: Beta\npath: /projects/beta\naliases:\n  - b-project\n  - Бета\n`;
    fs.writeFileSync(path.join(tmpDir, 'beta.yaml'), yaml);

    const service = new ProjectConfigService(makeConfigService(tmpDir));
    await service.loadAll();

    expect(service.resolveByNameOrAlias('Beta')?.name).toBe('Beta');
    expect(service.resolveByNameOrAlias('beta')?.name).toBe('Beta');
    expect(service.resolveByNameOrAlias('B-PROJECT')?.name).toBe('Beta');
    expect(service.resolveByNameOrAlias('бета')?.name).toBe('Beta');
    expect(service.resolveByNameOrAlias('nonexistent')).toBeUndefined();
  });

  it('should handle empty config directory', async () => {
    const service = new ProjectConfigService(makeConfigService(tmpDir));
    await service.loadAll();
    expect(service.getAll()).toHaveLength(0);
  });

  it('should handle non-existent config directory', async () => {
    const service = new ProjectConfigService(makeConfigService('/nonexistent/path'));
    await service.loadAll();
    expect(service.getAll()).toHaveLength(0);
  });

  it('should generate catalog prompt with project info', async () => {
    const yaml = `name: gamma\npath: /projects/gamma\naliases:\n  - g\npostgres:\n  host: localhost\n  port: 5432\n  user: pg\n  password: secret\n  database: mydb\n`;
    fs.writeFileSync(path.join(tmpDir, 'gamma.yaml'), yaml);

    const service = new ProjectConfigService(makeConfigService(tmpDir));
    await service.loadAll();

    const prompt = service.generateCatalogPrompt('/dashboard-apps');
    expect(prompt).toContain('gamma');
    expect(prompt).toContain('/projects/gamma');
    expect(prompt).toContain('pg_gamma');
    expect(prompt).toContain('Dashboard Apps');
    expect(prompt).toContain('/dashboard-apps');
  });

  it('should return empty catalog prompt when no projects', async () => {
    const service = new ProjectConfigService(makeConfigService(tmpDir));
    await service.loadAll();
    expect(service.generateCatalogPrompt()).toBe('');
  });

  it('should load multiple projects', async () => {
    fs.writeFileSync(path.join(tmpDir, 'a.yaml'), 'name: a\npath: /a\n');
    fs.writeFileSync(path.join(tmpDir, 'b.yaml'), 'name: b\npath: /b\n');

    const service = new ProjectConfigService(makeConfigService(tmpDir));
    await service.loadAll();

    expect(service.getAll()).toHaveLength(2);
    expect(service.getByName('a')).toBeDefined();
    expect(service.getByName('b')).toBeDefined();
  });
});
