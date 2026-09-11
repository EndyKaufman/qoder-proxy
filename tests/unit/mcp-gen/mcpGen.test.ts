import * as fs from 'fs';
import { McpGenService } from '../../../src/mcp-gen/mcp-gen.service';
import type { ProjectConfig } from '../../../src/project-config/project-config.models';

describe('McpGenService', () => {
  let service: McpGenService;

  beforeEach(() => {
    service = new McpGenService();
  });

  it('should generate empty config for no projects', () => {
    const config = service.generateMcpConfig([]);
    expect(config.mcpServers).toEqual({});
  });

  it('should generate pg server for project with postgres', () => {
    const projects: ProjectConfig[] = [{
      name: 'alpha',
      path: '/projects/alpha',
      postgres: { host: 'localhost', port: 5432, user: 'pg', password: 'secret', database: 'mydb' },
    }];

    const config = service.generateMcpConfig(projects);
    expect(config.mcpServers['pg_alpha']).toBeDefined();
    expect(config.mcpServers['pg_alpha'].command).toBe('npx');
    expect(config.mcpServers['pg_alpha'].args).toContain('postgresql://pg:secret@localhost:5432/mydb');
  });

  it('should generate redis server for project with redis', () => {
    const projects: ProjectConfig[] = [{
      name: 'beta',
      path: '/projects/beta',
      redis: { host: 'localhost', port: 6379, db: 2 },
    }];

    const config = service.generateMcpConfig(projects);
    expect(config.mcpServers['redis_beta']).toBeDefined();
    expect(config.mcpServers['redis_beta'].env?.REDIS_URL).toBe('redis://localhost:6379/2');
  });

  it('should generate nats server', () => {
    const projects: ProjectConfig[] = [{
      name: 'svc',
      path: '/projects/svc',
      nats: { url: 'nats://localhost:4222' },
    }];

    const config = service.generateMcpConfig(projects);
    expect(config.mcpServers['nats_svc']).toBeDefined();
    expect(config.mcpServers['nats_svc'].env?.NATS_URL).toBe('nats://localhost:4222');
  });

  it('should generate minio server', () => {
    const projects: ProjectConfig[] = [{
      name: 'files',
      path: '/projects/files',
      minio: { endpoint: 'localhost', port: 9000, access_key: 'ak', secret_key: 'sk', bucket: 'data' },
    }];

    const config = service.generateMcpConfig(projects);
    expect(config.mcpServers['minio_files']).toBeDefined();
    expect(config.mcpServers['minio_files'].env?.MINIO_ENDPOINT).toBe('localhost');
    expect(config.mcpServers['minio_files'].env?.MINIO_PORT).toBe('9000');
  });

  it('should generate docker server without prefix (shared)', () => {
    const projects: ProjectConfig[] = [
      { name: 'a', path: '/a', docker: { host: 'unix:///var/run/docker.sock' } },
      { name: 'b', path: '/b', docker: { host: 'unix:///var/run/docker.sock' } },
    ];

    const config = service.generateMcpConfig(projects);
    // Only one docker entry, no prefix
    expect(config.mcpServers['docker']).toBeDefined();
    expect(config.mcpServers['docker_a']).toBeUndefined();
    expect(config.mcpServers['docker_b']).toBeUndefined();
  });

  it('should generate git server per project', () => {
    const projects: ProjectConfig[] = [
      { name: 'proj-a', path: '/projects/proj-a' },
      { name: 'proj-b', path: '/projects/proj-b' },
    ];

    const config = service.generateMcpConfig(projects);
    expect(config.mcpServers['git_proj_a']).toBeDefined();
    expect(config.mcpServers['git_proj_b']).toBeDefined();
    expect(config.mcpServers['git_proj_a'].env?.GIT_REPO_PATH).toBe('/projects/proj-a');
  });

  it('should include global playwright when projects exist', () => {
    const projects: ProjectConfig[] = [{ name: 'x', path: '/x' }];
    const config = service.generateMcpConfig(projects);
    expect(config.mcpServers['playwright']).toBeDefined();
    expect(config.mcpServers['playwright'].args).toContain('@playwright/mcp');
  });

  it('should sanitize project names in server prefixes', () => {
    const projects: ProjectConfig[] = [{ name: 'My Project!', path: '/p' }];
    const config = service.generateMcpConfig(projects);
    expect(config.mcpServers['git_my_project_']).toBeDefined();
  });

  it('should write MCP config to a temp file', () => {
    const config = service.writeMcpConfigFile({ mcpServers: { test: { command: 'echo', args: [] } } });
    expect(fs.existsSync(config)).toBe(true);
    const content = JSON.parse(fs.readFileSync(config, 'utf-8'));
    expect(content.mcpServers.test.command).toBe('echo');
    // Cleanup
    fs.unlinkSync(config);
  });
});
