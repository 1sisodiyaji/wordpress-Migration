import fs from "node:fs/promises";
import path from "node:path";
import { getMigratedDataDir } from "../../../app/api/wp/config";
import type { SiteHeadAssets } from "./asset-graph";
import { mergeHeadAssets, type PageAssetGraph } from "./asset-graph";
import {
  downloadStylesheet,
  downloadStylesheets,
  getCssRegistry,
  persistCssRegistry,
} from "./css-download";
import { downloadFont, getFontRegistry, persistFontRegistry } from "./font-download";
import {
  downloadScript,
  getJsRegistry,
  persistJsRegistry,
} from "./js-download";
import { getWpUrl } from "../../../app/api/wp/config";
import { saveSitePluginAssets } from "../../../app/api/wp/plugin-assets";
import { persistDocumentInlineStyles } from "./inline-styles-store";
import {
  loadSitePluginAssets,
  mergeSitePluginAssets,
} from "./plugin-assets-merge";

function headAssetsPath(siteSlug: string): string {
  return path.join(getMigratedDataDir(siteSlug), "head-assets.json");
}

async function loadHeadAssets(siteSlug: string): Promise<SiteHeadAssets | null> {
  try {
    const raw = await fs.readFile(headAssetsPath(siteSlug), "utf8");
    return JSON.parse(raw) as SiteHeadAssets;
  } catch {
    return null;
  }
}

export async function saveHeadAssets(
  siteSlug: string,
  assets: SiteHeadAssets,
): Promise<void> {
  await fs.mkdir(path.dirname(headAssetsPath(siteSlug)), { recursive: true });
  await fs.writeFile(headAssetsPath(siteSlug), JSON.stringify(assets, null, 2), "utf8");
}

async function fetchElementorPostCss(
  postId: number,
  registry: Map<string, string>,
): Promise<void> {
  const base = getWpUrl();
  const candidates = [
    `${base}/wp-content/uploads/elementor/css/post-${postId}.css`,
    `${base}/wp-content/uploads/elementor/css/post-${postId}.min.css`,
  ];
  for (const url of candidates) {
    await downloadStylesheet(url, registry);
  }
}

/**
 * Download every asset referenced by a page graph — CSS, JS, fonts, conditionals.
 */
export async function mirrorPageAssetGraph(
  graph: PageAssetGraph,
  siteSlug: string,
): Promise<void> {
  const cssReg = getCssRegistry();
  const allCss = [
    ...new Set([
      ...graph.stylesheets,
      ...graph.discoveredStylesheets,
      ...graph.conditionalStylesheets,
      ...graph.fontStylesheets,
    ]),
  ];
  await downloadStylesheets(allCss, cssReg);

  for (const id of graph.elementorDocumentIds) {
    await fetchElementorPostCss(id, cssReg);
  }

  const jsReg = getJsRegistry();
  const scriptUrls = [
    ...new Set([
      ...graph.scripts.map((s) => s.src).filter(Boolean) as string[],
      ...graph.discoveredScripts,
      ...graph.conditionalScripts,
    ]),
  ];
  for (const url of scriptUrls) {
    await downloadScript(url, jsReg);
  }

  const fontReg = getFontRegistry();
  for (const preload of graph.fontPreloads) {
    await downloadFont(preload.href, fontReg);
  }

  const existingHead = await loadHeadAssets(siteSlug);
  const mergedHead = mergeHeadAssets(existingHead, graph);
  await saveHeadAssets(siteSlug, mergedHead);

  const persistedInline = await persistDocumentInlineStyles(
    siteSlug,
    graph.inlineStyles,
  );
  const existingPlugins = await loadSitePluginAssets(siteSlug);
  const mergedPlugins = mergeSitePluginAssets(
    existingPlugins,
    graph,
    persistedInline,
  );
  saveSitePluginAssets(siteSlug, mergedPlugins);

  if (mergedPlugins.plugins.length || persistedInline.length) {
    console.log(
      `  ✓ Plugin assets: ${mergedPlugins.plugins.length} plugin(s), ${mergedPlugins.stylesheets.plugin.length} CSS, ${mergedPlugins.scripts.plugin.length} JS, ${mergedPlugins.stylesheets.cache.length} cache, ${persistedInline.length} inline CSS file(s)`,
    );
  }

  persistCssRegistry(siteSlug);
  persistJsRegistry(siteSlug);
  persistFontRegistry(siteSlug);
}
