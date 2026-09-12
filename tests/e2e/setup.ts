/**
 * E2E test setup using the demo project's docker-compose infrastructure.
 *
 * Starts PostgreSQL, Redis, MinIO, and NATS via docker-compose from
 * examples/demo-project/, seeds test data, then builds a NestJS app
 * without mocks for e2e testing.
 *
 * The whole suite is skipped if Docker is unavailable.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as express from 'express';
import * as path from 'path';
import * as fs from 'fs';
import { execSync } from 'child_process';
import { AppModule } from '../../src/app.module';
import { PluginStorageService } from '../../src/plugin-storage/plugin-storage.service';
import configuration from '../../src/config/configuration';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface E2EContext {
  app: INestApplication;
  pluginStorage: PluginStorageService;
  /** Temp directory for plugin DB and files */
  dataDir: string;
  /** Cleanup function — call in afterAll */
  teardown: () => Promise<void>;
}

// ---------------------------------------------------------------------------
// Paths
// ---------------------------------------------------------------------------

export const DEMO_PROJECT_DIR = path.resolve(__dirname, '../../examples/demo-project');
export const DOCKER_COMPOSE_FILE = path.join(DEMO_PROJECT_DIR, 'docker-compose.yml');
export const SEED_SCRIPT = path.join(DEMO_PROJECT_DIR, 'seed', 'seed.js');

// Fixture paths (OpenAPI specs are still needed for plugin creation tests)
export const FIXTURES_DIR = path.join(__dirname, 'fixtures');
export const OPENAPI_DIR = path.join(FIXTURES_DIR, 'openapi');

// Generated project config directory (temp, cleaned up after tests)
let projectConfigsDir: string;

// ---------------------------------------------------------------------------
// Check prerequisites
// ---------------------------------------------------------------------------

export const hasDocker = (() => {
  try {
    require('child_process').execSync('docker compose version', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
})();

export const hasQoderCli = (() => {
  try {
    require('child_process').execSync('qodercli --version', { stdio: 'ignore', timeout: 5000 });
    return true;
  } catch {
    return false;
  }
})();

export const hasQoderPAT = !!process.env.QODER_PERSONAL_ACCESS_TOKEN;

// ---------------------------------------------------------------------------
// Docker-compose helpers
// ---------------------------------------------------------------------------

function dockerComposeUp(): void {
  console.log('Starting demo-project infrastructure via docker-compose...');
  execSync(
    `docker compose -f "${DOCKER_COMPOSE_FILE}" --env-file "${path.join(DEMO_PROJECT_DIR, '.env')}" up -d`,
    { stdio: 'inherit', timeout: 120_000 }
  );
}

function dockerComposeDown(): void {
  console.log('Stopping demo-project infrastructure...');
  try {
    execSync(
      `docker compose -f "${DOCKER_COMPOSE_FILE}" --env-file "${path.join(DEMO_PROJECT_DIR, '.env')}" down -v --remove-orphans`,
      { stdio: 'inherit', timeout: 60_000 }
    );
  } catch {
    // Best effort cleanup
  }
}

function waitForHealthy(containerName: string, checkCmd: string, maxRetries = 30): Promise<void> {
  return new Promise((resolve, reject) => {
    const tryCheck = async (attempt: number) => {
      if (attempt >= maxRetries) {
        return reject(new Error(`${containerName} not healthy after ${maxRetries}s`));
      }
      try {
        execSync(checkCmd, { stdio: 'ignore', timeout: 5000 });
        resolve();
      } catch {
        setTimeout(() => tryCheck(attempt + 1), 1000);
      }
    };
    tryCheck(0);
  });
}

async function waitForInfrastructure(): Promise<void> {
  console.log('Waiting for services to be healthy...');

  // PostgreSQL
  await waitForHealthy(
    'postgres',
    'docker exec demo-project-postgres-1 pg_isready -U demo',
    30
  );
  console.log('  PostgreSQL: ready');

  // Redis
  await waitForHealthy(
    'redis',
    'docker exec demo-project-redis-1 redis-cli ping',
    30
  );
  console.log('  Redis: ready');

  // MinIO
  await waitForHealthy(
    'minio',
    'docker exec demo-project-minio-1 mc ready local',
    30
  );
  console.log('  MinIO: ready');

  // NATS
  await waitForHealthy(
    'nats',
    'docker exec demo-project-nats-1 wget -qO- http://localhost:8222/healthz',
    30
  );
  console.log('  NATS: ready');
}

function runSeed(): void {
  console.log('Running seed script...');
  execSync(`node "${SEED_SCRIPT}"`, {
    stdio: 'inherit',
    timeout: 30_000,
    env: {
      ...process.env,
      MINIO_ENDPOINT: 'localhost',
      MINIO_PORT: '9100',
      REDIS_URL: 'redis://localhost:63791',
    },
  });
}

// ---------------------------------------------------------------------------
// Build E2E app
// ---------------------------------------------------------------------------

/**
 * Start demo-project infrastructure, seed data, and build a NestJS app
 * configured for e2e testing.
 *
 * Plugins DB uses a fixed path (./data/e2e-plugins.db) so it survives
 * after tests finish — the user can inspect created plugins via API.
 * Previous plugins are cleaned up at the START, not at the end.
 */
export async function startE2E(): Promise<E2EContext> {
  // Use fixed paths for plugin data so it persists after tests
  const dataDir = path.resolve('./data');
  const pluginsDbPath = path.join(dataDir, 'e2e-plugins.db');
  const pluginsFilesDir = path.join(dataDir, 'e2e-plugins');
  fs.mkdirSync(dataDir, { recursive: true });
  fs.mkdirSync(pluginsFilesDir, { recursive: true });

  // Clean up plugins from previous run
  try { fs.unlinkSync(pluginsDbPath); } catch { /* ignore */ }
  try { fs.rmSync(pluginsFilesDir, { recursive: true, force: true }); } catch { /* ignore */ }
  fs.mkdirSync(pluginsFilesDir, { recursive: true });

  // Create temp project configs dir
  projectConfigsDir = fs.mkdtempSync(path.join('/tmp', 'e2e-configs-'));

  // Start infrastructure
  dockerComposeUp();
  await waitForInfrastructure();

  // Seed MinIO and Redis
  runSeed();

  // Set env vars for the app
  process.env.PROJECTS_CONFIG_DIR = projectConfigsDir;
  process.env.PROJECTS_ROOT_DIR = DEMO_PROJECT_DIR;
  process.env.DASHBOARD_APPS_DIR = path.join(dataDir, 'dashboard-apps');
  process.env.PLUGINS_DB_PATH = pluginsDbPath;
  process.env.PLUGINS_FILES_DIR = pluginsFilesDir;
  process.env.DASHBOARD_ENABLED = 'false';
  process.env.DASHBOARD_PASSWORD = 'test';

  // Write demo-project.yaml with actual ports from docker-compose
  const demoProjectConfig = `
name: demo-project
path: ${DEMO_PROJECT_DIR}
aliases:
  - demo
  - test-project
postgres:
  host: localhost
  port: 54321
  user: demo
  password: demo
  database: demo
redis:
  host: localhost
  port: 63791
  db: 0
minio:
  endpoint: localhost
  port: 9100
  access_key: minioadmin
  secret_key: minioadmin
nats:
  url: nats://localhost:42222
`.trim();
  fs.writeFileSync(path.join(projectConfigsDir, 'demo-project.yaml'), demoProjectConfig);

  // Build NestJS app
  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();

  const app = moduleFixture.createNestApplication();

  // Apply body parsers
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(express.json({ limit: '10mb' }));
  expressApp.use(express.urlencoded({ extended: true }));

  await app.init();

  const pluginStorage = app.get(PluginStorageService);

  return {
    app,
    pluginStorage,
    dataDir,
    teardown: async () => {
      await app.close();
      // Don't stop docker-compose or delete plugins DB —
      // the user may want to inspect created plugins via API.
      // Clean up only the temp project configs dir.
      try { fs.rmSync(projectConfigsDir, { recursive: true, force: true }); } catch { /* ignore */ }
      console.log(`\n  Plugins DB preserved at: ${pluginsDbPath}`);
      console.log(`  Run "npm run test:e2e:teardown" to stop infrastructure when done.`);
    },
  };
}
