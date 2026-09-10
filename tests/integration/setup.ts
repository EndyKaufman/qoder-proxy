/**
 * Shared integration test helpers.
 *
 * Uses @nestjs/testing to create a test NestJS app with mocked QoderCliService.
 */

import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import * as express from 'express';
import { AppModule } from '../../src/app.module';
import { QoderCliService } from '../../src/qoder-cli/qoder-cli.service';
import configuration from '../../src/config/configuration';

interface BuildAppResult {
  app: INestApplication;
  mocks: {
    mockRunQoderRequest: jest.Mock;
    mockCheckQoderCli: jest.Mock;
  };
  restoreEnv: () => void;
}

/**
 * Build a fresh NestJS app with mocked QoderCliService.
 */
const buildApp = async (envOverrides: Record<string, string | undefined> = {}): Promise<BuildAppResult> => {
  // Apply env overrides
  const prevEnv: Record<string, string | undefined> = {};
  for (const [key, val] of Object.entries(envOverrides)) {
    prevEnv[key] = process.env[key];
    if (val === undefined || val === null) {
      delete process.env[key];
    } else {
      process.env[key] = val;
    }
  }

  const mockRunQoderRequest = jest.fn();
  const mockCheckQoderCli = jest.fn().mockResolvedValue('available');

  const moduleFixture: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(QoderCliService)
    .useValue({
      runQoderRequest: mockRunQoderRequest,
      checkQoderCli: mockCheckQoderCli,
    })
    .compile();

  const app = moduleFixture.createNestApplication();

  // Apply body parsers to match production setup
  const expressApp = app.getHttpAdapter().getInstance();
  expressApp.use(express.json({ limit: '10mb' }));
  expressApp.use(express.urlencoded({ extended: true }));

  await app.init();

  return {
    app,
    mocks: { mockRunQoderRequest, mockCheckQoderCli },
    restoreEnv: () => {
      for (const [key, val] of Object.entries(envOverrides)) {
        if (prevEnv[key] === undefined) {
          delete process.env[key];
        } else {
          process.env[key] = prevEnv[key];
        }
      }
    },
  };
};

export { buildApp };
