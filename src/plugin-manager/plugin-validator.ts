import { execFile } from 'child_process';
import * as YAML from 'yaml';

// ---------------------------------------------------------------------------
// Validation result shape
// ---------------------------------------------------------------------------

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

// ---------------------------------------------------------------------------
// HTML validation
// ---------------------------------------------------------------------------

/**
 * Basic HTML structure validation: must have <html>, <body>, no critical parse errors.
 */
export function validateHtml(content: string): ValidationResult {
  const errors: string[] = [];
  const lower = content.toLowerCase();

  if (!lower.includes('<html')) {
    errors.push('Missing <html> tag');
  }
  if (!lower.includes('<body')) {
    errors.push('Missing <body> tag');
  }
  if (content.trim().length === 0) {
    errors.push('HTML content is empty');
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// JS syntax validation
// ---------------------------------------------------------------------------

/**
 * Validate JS syntax via `node --check`.
 */
export function validateJsSyntax(filePath: string): Promise<ValidationResult> {
  return new Promise((resolve) => {
    execFile('node', ['--check', filePath], { timeout: 10_000 }, (error, _stdout, stderr) => {
      if (error) {
        resolve({
          valid: false,
          errors: [stderr || error.message || 'JS syntax error'],
        });
      } else {
        resolve({ valid: true, errors: [] });
      }
    });
  });
}

// ---------------------------------------------------------------------------
// Controller contract validation
// ---------------------------------------------------------------------------

/**
 * Validate that controller.js exports the expected contract:
 *  - routes: array of {method, path, handler}
 *  - meta: object with at least {name}
 */
export function validateControllerContract(filePath: string): ValidationResult {
  const errors: string[] = [];

  try {
    // Clear require cache for fresh load
    delete require.cache[require.resolve(filePath)];
    const mod = require(filePath);

    if (!mod.meta || typeof mod.meta !== 'object') {
      errors.push('controller.js must export a "meta" object');
    } else if (!mod.meta.name || typeof mod.meta.name !== 'string') {
      errors.push('meta.name must be a non-empty string');
    }

    if (!Array.isArray(mod.routes)) {
      errors.push('controller.js must export a "routes" array');
    } else {
      for (let i = 0; i < mod.routes.length; i++) {
        const r = mod.routes[i];
        if (!r.method || !['get', 'post', 'put', 'delete', 'patch'].includes(r.method)) {
          errors.push(`routes[${i}].method must be one of: get, post, put, delete, patch`);
        }
        if (!r.path || typeof r.path !== 'string') {
          errors.push(`routes[${i}].path must be a string`);
        }
        if (typeof r.handler !== 'function') {
          errors.push(`routes[${i}].handler must be a function`);
        }
      }
    }

    if (mod.setupStream && typeof mod.setupStream !== 'function') {
      errors.push('setupStream must be a function if provided');
    }
  } catch (err: any) {
    errors.push(`Failed to load controller.js: ${err.message}`);
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// OpenAPI spec validation
// ---------------------------------------------------------------------------

interface OpenApiRoute {
  method: string;
  path: string;
}

/**
 * Validate that all paths from an OpenAPI spec are implemented in routes.
 */
export function validateOpenApiSpec(
  routes: OpenApiRoute[],
  openApiYaml: string,
): ValidationResult {
  const errors: string[] = [];

  try {
    const spec = YAML.parse(openApiYaml);
    if (!spec || !spec.paths) {
      errors.push('OpenAPI spec has no "paths" section');
      return { valid: false, errors };
    }

    // Normalize path params: Express :param → OpenAPI {param}
    const normalize = (p: string) => p.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, '{$1}');

    const routeSet = new Set(
      routes.map((r) => `${r.method.toLowerCase()} ${normalize(r.path.startsWith('/') ? r.path : '/' + r.path)}`),
    );

    for (const [pathKey, methods] of Object.entries(spec.paths)) {
      if (!methods || typeof methods !== 'object') continue;
      for (const method of Object.keys(methods as object)) {
        const normalized = `${method.toLowerCase()} ${normalize(pathKey)}`;
        if (!routeSet.has(normalized)) {
          errors.push(`Missing route: ${normalized}`);
        }
      }
    }
  } catch (err: any) {
    errors.push(`Failed to parse OpenAPI YAML: ${err.message}`);
  }

  return { valid: errors.length === 0, errors };
}

// ---------------------------------------------------------------------------
// Auto-generate OpenAPI from routes
// ---------------------------------------------------------------------------

/**
 * Generate a minimal OpenAPI 3.0 spec from controller routes and meta.
 */
export function generateOpenApiFromRoutes(
  routes: OpenApiRoute[],
  meta: { name: string; description?: string },
): string {
  const paths: Record<string, Record<string, object>> = {};

  for (const route of routes) {
    const pathKey = route.path.startsWith('/') ? route.path : '/' + route.path;
    if (!paths[pathKey]) paths[pathKey] = {};
    paths[pathKey][route.method.toLowerCase()] = {
      summary: `${route.method.toUpperCase()} ${pathKey}`,
      responses: {
        '200': { description: 'Success' },
      },
    };
  }

  const spec = {
    openapi: '3.0.0',
    info: {
      title: meta.name,
      description: meta.description || '',
      version: '1.0.0',
    },
    paths,
  };

  return YAML.stringify(spec);
}
