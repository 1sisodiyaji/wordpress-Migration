import fs from "node:fs/promises";
import path from "node:path";
import { getMigratedDataDir, getWpUrl } from "../../../app/api/wp/config";
import {
  printVerificationReport,
  verifyAssetsAgainstHtml,
} from "./asset-verify";
import { downloadStylesheets, getCssRegistry } from "./css-download";
import { downloadScripts, getJsRegistry } from "./js-download";
import {
  allPluginAssetUrls,
  buildWpContentTree,
  type WpContentTreeManifest,
} from "./wp-content-tree";

function treePath(siteSlug: string): string {
  return path.join(getMigratedDataDir(siteSlug), "wp-content-tree.json");
}

export async function saveWpContentTree(
  siteSlug: string,
  tree: WpContentTreeManifest,
): Promise<void> {
  await fs.mkdir(getMigratedDataDir(siteSlug), { recursive: true });
  await fs.writeFile(treePath(siteSlug), JSON.stringify(tree, null, 2), "utf8");
}

/**
 * Scan wp-content/plugins + mu-plugins from HTML (and listings when available),
 * clone CSS/JS, persist tree manifest, cross-check vs HTML.
 */
export async function mirrorWpContentPluginAssets(
  html: string,
  pageUrl: string,
  siteSlug: string,
): Promise<{ tree: WpContentTreeManifest; css: string[]; js: string[] }> {
  const siteBase = getWpUrl() || pageUrl;
  const tree = await buildWpContentTree(html, siteBase, pageUrl);
  const { css, js } = allPluginAssetUrls(tree);

  const cssReg = getCssRegistry();
  const jsReg = getJsRegistry();

  const beforeCss = cssReg.size;
  const beforeJs = jsReg.size;

  await downloadStylesheets(css, cssReg);
  await downloadScripts(js, jsReg, siteSlug);

  await saveWpContentTree(siteSlug, tree);

  const addedCss = cssReg.size - beforeCss;
  const addedJs = jsReg.size - beforeJs;
  if (tree.plugins.length) {
    console.log(
      `  ✓ wp-content tree: ${tree.plugins.length} plugin(s), +${addedCss} CSS, +${addedJs} JS cloned`,
    );
    for (const note of tree.notes) console.log(`    ${note}`);
  }

  const report = verifyAssetsAgainstHtml(html, pageUrl, siteSlug);
  printVerificationReport(report);

  return { tree, css, js };
}
