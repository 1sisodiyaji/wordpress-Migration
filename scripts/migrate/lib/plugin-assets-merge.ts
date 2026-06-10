import type { PageAssetGraph } from "./asset-graph";
import fs from "node:fs/promises";
import path from "node:path";
import {
  getSitePluginAssets,
  type SitePluginAssetsManifest,
} from "../../../app/api/wp/plugin-assets";
import { getMigratedDataDir } from "../../../app/api/wp/config";
import type { PersistedInlineStyle } from "../../../app/api/wp/plugin-assets";
import {
  collectPluginSlugs,
  collectThemeSlugs,
  layerScripts,
  layerStylesheets,
} from "./wp-asset-layers";

function mergeStylesheetLayers(
  existing: SitePluginAssetsManifest["stylesheets"],
  incoming: SitePluginAssetsManifest["stylesheets"],
): SitePluginAssetsManifest["stylesheets"] {
  const mergeList = (a: string[], b: string[]) => {
    const out = [...a];
    for (const url of b) {
      if (!out.includes(url)) out.push(url);
    }
    return out;
  };

  return {
    all: mergeList(existing.all, incoming.all),
    core: mergeList(existing.core, incoming.core),
    theme: mergeList(existing.theme, incoming.theme),
    plugin: mergeList(existing.plugin, incoming.plugin),
    uploads: mergeList(existing.uploads, incoming.uploads),
    cache: mergeList(existing.cache ?? [], incoming.cache ?? []),
    external: mergeList(existing.external, incoming.external),
  };
}

function scriptKey(s: { src?: string; inline?: string; id?: string }): string {
  return s.src ?? `inline:${s.id ?? s.inline?.slice(0, 48) ?? ""}`;
}

function mergeScriptLayers(
  existing: SitePluginAssetsManifest["scripts"],
  incoming: SitePluginAssetsManifest["scripts"],
): SitePluginAssetsManifest["scripts"] {
  const mergeEntries = <T extends { src?: string; inline?: string; id?: string }>(
    a: T[],
    b: T[],
  ) => {
    const out = [...a];
    const seen = new Set(a.map(scriptKey));
    for (const entry of b) {
      const key = scriptKey(entry);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(entry);
    }
    return out;
  };

  return {
    all: mergeEntries(existing.all, incoming.all),
    core: mergeEntries(existing.core, incoming.core),
    theme: mergeEntries(existing.theme, incoming.theme),
    plugin: mergeEntries(existing.plugin, incoming.plugin),
    uploads: mergeEntries(existing.uploads, incoming.uploads),
    cache: mergeEntries(existing.cache ?? [], incoming.cache ?? []),
    external: mergeEntries(existing.external, incoming.external),
  };
}

function mergeInlineStyles(
  existing: PersistedInlineStyle[],
  incoming: PersistedInlineStyle[],
): PersistedInlineStyle[] {
  const out = [...existing];
  const seen = new Set(existing.map((s) => s.publicPath));
  for (const style of incoming) {
    if (seen.has(style.publicPath)) continue;
    seen.add(style.publicPath);
    out.push(style);
  }
  return out;
}

/** Build layered manifest from a single page asset graph. */
export function manifestFromPageGraph(
  graph: PageAssetGraph,
  inlineStyles: PersistedInlineStyle[] = [],
): SitePluginAssetsManifest {
  const allCss = [
    ...graph.stylesheets,
    ...graph.discoveredStylesheets,
    ...graph.conditionalStylesheets,
    ...graph.fontStylesheets,
  ];
  const allScripts = [
    ...graph.scripts,
    ...graph.discoveredScripts.map((src) => ({ src })),
    ...graph.conditionalScripts.map((src) => ({ src })),
  ];

  const stylesheets = layerStylesheets(allCss);
  const scripts = layerScripts(allScripts);

  return {
    fetchedAt: new Date().toISOString(),
    plugins: collectPluginSlugs(stylesheets, scripts),
    themes: collectThemeSlugs(stylesheets, scripts),
    stylesheets,
    scripts,
    inlineStyles,
  };
}

export async function loadSitePluginAssets(
  siteSlug: string,
): Promise<SitePluginAssetsManifest | null> {
  try {
    const file = path.join(getMigratedDataDir(siteSlug), "plugin-assets.json");
    const raw = await fs.readFile(file, "utf8");
    return JSON.parse(raw) as SitePluginAssetsManifest;
  } catch {
    return getSitePluginAssets(siteSlug);
  }
}

export function mergeSitePluginAssets(
  existing: SitePluginAssetsManifest | null,
  graph: PageAssetGraph,
  inlineStyles: PersistedInlineStyle[] = [],
): SitePluginAssetsManifest {
  const incoming = manifestFromPageGraph(graph, inlineStyles);
  if (!existing) return incoming;

  const stylesheets = mergeStylesheetLayers(existing.stylesheets, incoming.stylesheets);
  const scripts = mergeScriptLayers(existing.scripts, incoming.scripts);

  return {
    fetchedAt: new Date().toISOString(),
    plugins: [...new Set([...existing.plugins, ...incoming.plugins])].sort(),
    themes: [...new Set([...existing.themes, ...incoming.themes])].sort(),
    stylesheets,
    scripts,
    inlineStyles: mergeInlineStyles(existing.inlineStyles ?? [], incoming.inlineStyles),
  };
}
