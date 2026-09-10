/**
 * Shared integration test helpers.
 *
 * Because jest.resetModules() creates fresh module instances,
 * each test file must set up its own mocks and app.
 */

import type { Express } from 'express';

interface BuildAppResult {
  app: Express;
  mocks: {
    mockRunQoderRequest: jest.Mock;
    mockCheckQoderCli: jest.Mock;
  };
  restoreEnv: () => void;
}

/**
 * Build a fresh Express app with mocked spawn module.
 * Returns { app, mocks } where mocks has the current jest.fn() references.
 */
const buildApp = (envOverrides: Record<string, string | undefined> = {}): BuildAppResult => {
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

  jest.resetModules();

  const mockRunQoderRequest: jest.Mock = jest.fn();
  const mockCheckQoderCli: jest.Mock = jest.fn().mockResolvedValue('available');

  jest.mock('../../src/helpers/spawn', () => {
    const actual = jest.requireActual('../../src/helpers/spawn') as Record<string, unknown>;
    return {
      runQoderRequest: mockRunQoderRequest,
      checkQoderCli: mockCheckQoderCli,
      extractEventText: actual.extractEventText,
      hasVisibleAssistantText: actual.hasVisibleAssistantText,
      deepFindText: actual.deepFindText,
    };
  });

  // Dynamic require after resetModules — server.js is JS, no types
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { app } = require('../../src/server') as { app: Express };

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
