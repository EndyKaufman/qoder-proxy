// ---------------------------------------------------------------------------
// Project configuration models
// ---------------------------------------------------------------------------

export interface PostgresConfig {
  host: string;
  port: number;
  user: string;
  password: string;
  database: string;
}

export interface RedisConfig {
  host: string;
  port: number;
  db?: number;
}

export interface NatsConfig {
  url: string;
}

export interface MinioConfig {
  endpoint: string;
  port: number;
  access_key: string;
  secret_key: string;
  bucket?: string;
  use_ssl?: boolean;
}

export interface DockerConfig {
  host: string;
}

/**
 * Configuration for a single project, loaded from a YAML file.
 *
 * Required: `name` and `path`.
 * Optional: `aliases`, service connections, `github_url`.
 */
export interface ProjectConfig {
  name: string;
  path: string;
  aliases?: string[];
  github_url?: string;
  postgres?: PostgresConfig;
  redis?: RedisConfig;
  nats?: NatsConfig;
  minio?: MinioConfig;
  docker?: DockerConfig;
}

/**
 * Raw YAML shape -- same as ProjectConfig but all fields optional
 * (validation happens at load time).
 */
export type RawProjectConfig = Partial<ProjectConfig>;
