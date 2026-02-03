/**
 * Static Flow Configuration Loader
 *
 * Parses staticflow.config.yaml and provides typed access to all settings.
 * Supports environment variable overrides and falls back to defaults.
 */

import { join, dirname } from "@std/path";
import { parse as parseYaml } from "@std/yaml";

// Get project root
// Always use current working directory - user should run from their site root
const PROJECT_ROOT = Deno.cwd();

// ============================================================
// TYPE DEFINITIONS
// ============================================================

export interface SiteConfig {
  name: string;
  url: string;
  description: string;
  author: string;
  language: string[];
}

export interface PathsConfig {
  posts: string;
  photos: string;
  output: string;
  theme: string;
  cache: string;
}

export interface FeaturesConfig {
  search: boolean;
  vectorSearch: boolean;
  gallery: boolean;
  mediumExport: boolean;
  translation: boolean;
  chat: boolean;
}

export interface SearchBuildConfig {
  chunkSize: number;
  chunkOverlap: number;
  dimensions: number;
  model: string;
  batchSize: number;
}

export interface MediumBuildConfig {
  maxCodeLines: number;
}

export interface BuildConfig {
  imageCompression: boolean;
  maxImageWidth: number;
  imageQuality: number;
  staticHtml: boolean;
  search: SearchBuildConfig;
  medium: MediumBuildConfig;
}

export interface StaticFlowConfig {
  site: SiteConfig;
  paths: PathsConfig;
  features: FeaturesConfig;
  build: BuildConfig;
}

// ============================================================
// DEFAULT CONFIGURATION
// ============================================================

const DEFAULT_CONFIG: StaticFlowConfig = {
  site: {
    name: "My Blog",
    url: "https://example.com",
    description: "A personal blog and portfolio",
    author: "Your Name",
    language: ["en"],
  },
  paths: {
    posts: "content/posts",
    photos: "content/photos",
    output: "dist",
    theme: "themes/default",
    cache: ".cache",
  },
  features: {
    search: true,
    vectorSearch: true,
    gallery: true,
    mediumExport: false,
    translation: false,
    chat: false,
  },
  build: {
    imageCompression: true,
    maxImageWidth: 2000,
    imageQuality: 85,
    staticHtml: true,
    search: {
      chunkSize: 500,
      chunkOverlap: 50,
      dimensions: 512,
      model: "text-embedding-3-small",
      batchSize: 20,
    },
    medium: {
      maxCodeLines: 15,
    },
  },
};

// ============================================================
// CONFIGURATION LOADER
// ============================================================

let _config: StaticFlowConfig | null = null;

/**
 * Check if file exists
 */
function existsSync(path: string): boolean {
  try {
    Deno.statSync(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * Deep merge two objects
 */
// deno-lint-ignore no-explicit-any
function deepMerge(target: any, source: any): any {
  if (!source) return target;
  const result = { ...target };
  for (const key of Object.keys(source)) {
    const sourceValue = source[key];
    const targetValue = target[key];
    if (
      sourceValue !== undefined &&
      typeof sourceValue === "object" &&
      sourceValue !== null &&
      !Array.isArray(sourceValue) &&
      typeof targetValue === "object" &&
      targetValue !== null &&
      !Array.isArray(targetValue)
    ) {
      result[key] = deepMerge(targetValue, sourceValue);
    } else if (sourceValue !== undefined) {
      result[key] = sourceValue;
    }
  }
  return result;
}

/**
 * Apply environment variable overrides
 */
function applyEnvOverrides(config: StaticFlowConfig): StaticFlowConfig {
  const result = { ...config };

  // Site overrides
  if (Deno.env.get("STATICFLOW_SITE_NAME")) {
    result.site = { ...result.site, name: Deno.env.get("STATICFLOW_SITE_NAME")! };
  }
  if (Deno.env.get("STATICFLOW_SITE_URL")) {
    result.site = { ...result.site, url: Deno.env.get("STATICFLOW_SITE_URL")! };
  }
  if (Deno.env.get("STATICFLOW_SITE_AUTHOR")) {
    result.site = { ...result.site, author: Deno.env.get("STATICFLOW_SITE_AUTHOR")! };
  }

  // Path overrides
  if (Deno.env.get("STATICFLOW_POSTS_DIR")) {
    result.paths = { ...result.paths, posts: Deno.env.get("STATICFLOW_POSTS_DIR")! };
  }
  if (Deno.env.get("STATICFLOW_PHOTOS_DIR")) {
    result.paths = { ...result.paths, photos: Deno.env.get("STATICFLOW_PHOTOS_DIR")! };
  }
  if (Deno.env.get("STATICFLOW_OUTPUT_DIR")) {
    result.paths = { ...result.paths, output: Deno.env.get("STATICFLOW_OUTPUT_DIR")! };
  }

  // Build overrides
  if (Deno.env.get("STATICFLOW_MAX_IMAGE_WIDTH")) {
    result.build = {
      ...result.build,
      maxImageWidth: parseInt(Deno.env.get("STATICFLOW_MAX_IMAGE_WIDTH")!, 10),
    };
  }
  if (Deno.env.get("STATICFLOW_IMAGE_QUALITY")) {
    result.build = {
      ...result.build,
      imageQuality: parseInt(Deno.env.get("STATICFLOW_IMAGE_QUALITY")!, 10),
    };
  }

  return result;
}

/**
 * Load configuration from file and apply overrides
 */
export function loadConfig(): StaticFlowConfig {
  if (_config) {
    return _config;
  }

  const configPath = join(PROJECT_ROOT, "staticflow.config.yaml");
  let fileConfig: Partial<StaticFlowConfig> = {};

  if (existsSync(configPath)) {
    try {
      const content = Deno.readTextFileSync(configPath);
      fileConfig = parseYaml(content) as Partial<StaticFlowConfig>;
    } catch (err) {
      console.warn(`Warning: Could not parse config file: ${(err as Error).message}`);
      console.warn("Using default configuration.");
    }
  } else {
    console.warn("Warning: staticflow.config.yaml not found. Using defaults.");
  }

  // Merge with defaults
  const merged = deepMerge(DEFAULT_CONFIG, fileConfig) as StaticFlowConfig;

  // Apply environment variable overrides
  const config = applyEnvOverrides(merged);

  _config = config;
  return config;
}

/**
 * Get configuration (cached)
 */
export function getConfig(): StaticFlowConfig {
  return loadConfig();
}

/**
 * Reset configuration cache (useful for testing)
 */
export function resetConfig(): void {
  _config = null;
}

// ============================================================
// PATH RESOLUTION HELPERS
// ============================================================

/**
 * Get absolute path for posts directory
 */
export function getPostsDir(): string {
  const config = getConfig();
  return join(PROJECT_ROOT, config.paths.posts);
}

/**
 * Get absolute path for photos directory
 */
export function getPhotosDir(): string {
  const config = getConfig();
  return join(PROJECT_ROOT, config.paths.photos);
}

/**
 * Get absolute path for output directory
 */
export function getOutputDir(): string {
  const config = getConfig();
  return join(PROJECT_ROOT, config.paths.output);
}

/**
 * Get absolute path for theme directory
 */
export function getThemeDir(): string {
  const config = getConfig();
  return join(PROJECT_ROOT, config.paths.theme);
}

/**
 * Get absolute path for cache directory
 */
export function getCacheDir(): string {
  const config = getConfig();
  return join(PROJECT_ROOT, config.paths.cache);
}

/**
 * Get project root directory
 */
export function getProjectRoot(): string {
  return PROJECT_ROOT;
}

// ============================================================
// EXPORTS
// ============================================================

export { PROJECT_ROOT };

// CLI: Print config when run directly
if (import.meta.main) {
  const config = loadConfig();
  console.log("Static Flow Configuration");
  console.log("=".repeat(40));
  console.log(JSON.stringify(config, null, 2));
  console.log("");
  console.log("Resolved Paths:");
  console.log(`  Posts:  ${getPostsDir()}`);
  console.log(`  Photos: ${getPhotosDir()}`);
  console.log(`  Output: ${getOutputDir()}`);
  console.log(`  Theme:  ${getThemeDir()}`);
  console.log(`  Cache:  ${getCacheDir()}`);
}
