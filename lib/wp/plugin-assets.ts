import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir } from "./config";

export interface LayeredStylesheets {
  all: string[];
  core: string[];
  theme: string[];
  plugin: string[];
  uploads: string[];
  cache: string[];
  external: string[];
}

export interface PluginScriptEntry {
  src?: string;
  inline?: string;
  id?: string;
  type?: string;
  layer?: string;
  pluginSlug?: string;
}

export interface LayeredScripts {
  all: PluginScriptEntry[];
  core: PluginScriptEntry[];
  theme: PluginScriptEntry[];
  plugin: PluginScriptEntry[];
  uploads: PluginScriptEntry[];
  cache: PluginScriptEntry[];
  external: PluginScriptEntry[];
}

export interface PersistedInlineStyle {
  id?: string;
  publicPath: string;
  bytes: number;
}

/** Per-site manifest: theme + plugin CSS/JS in live WP enqueue order. */
export interface SitePluginAssetsManifest {
  fetchedAt: string;
  plugins: string[];
  themes: string[];
  stylesheets: LayeredStylesheets;
  scripts: LayeredScripts;
  /** Head inline CSS persisted to disk (WP Rocket wpr-usedcss, etc.) */
  inlineStyles: PersistedInlineStyle[];
}

function manifestPath(siteSlug: string): string {
  return path.join(getMigratedDataDir(siteSlug), "plugin-assets.json");
}

export function getSitePluginAssets(siteSlug: string): SitePluginAssetsManifest | null {
  const file = manifestPath(siteSlug);
  if (!fs.existsSync(file)) return null;
  const data = JSON.parse(fs.readFileSync(file, "utf8")) as Partial<SitePluginAssetsManifest>;
  return {
    ...data,
    fetchedAt: data.fetchedAt ?? "",
    plugins: data.plugins ?? [],
    themes: data.themes ?? [],
    inlineStyles: data.inlineStyles ?? [],
    stylesheets: {
      all: [],
      core: [],
      theme: [],
      plugin: [],
      uploads: [],
      cache: [],
      external: [],
      ...data.stylesheets,
    },
    scripts: {
      all: [],
      core: [],
      theme: [],
      plugin: [],
      uploads: [],
      cache: [],
      external: [],
      ...data.scripts,
    },
  };
}

export function saveSitePluginAssets(
  siteSlug: string,
  manifest: SitePluginAssetsManifest,
): void {
  const dir = getMigratedDataDir(siteSlug);
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(manifestPath(siteSlug), JSON.stringify(manifest, null, 2), "utf8");
}
