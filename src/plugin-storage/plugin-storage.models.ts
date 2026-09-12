// ---------------------------------------------------------------------------
// Plugin storage models
// ---------------------------------------------------------------------------

export interface Plugin {
  id: number;
  slug: string;
  name: string;
  description: string;
  icon: string;
  created_at: string;
  updated_at: string;
}

export interface PluginVersion {
  id: number;
  plugin_id: number;
  version: string;
  prompt: string;
  files_json: string; // JSON: {"meta.json": "...", "index.html": "...", "controller.js": "..."}
  openapi_spec: string | null;
  created_at: string;
}

export interface PluginActive {
  plugin_id: number;
  version_id: number;
}

export interface PluginData {
  id: number;
  plugin_id: number;
  key: string;
  value_json: string;
  created_at: string;
  updated_at: string;
}

/** Files stored in a plugin version — map of filename to content. */
export type PluginFiles = Record<string, string>;

/** Input for creating a new plugin. */
export interface CreatePluginInput {
  slug: string;
  name: string;
  description?: string;
  icon?: string;
}

/** Input for creating a new version. */
export interface CreateVersionInput {
  pluginId: number;
  version: string;
  prompt: string;
  files: PluginFiles;
  openApiSpec?: string;
}
