import { loadCssRegistry } from "../../../app/api/wp/css-registry";
import { loadJsRegistry } from "../../../app/api/wp/js-registry";
import {
  collectCdnAssetUrlsFromHtml,
  collectPluginAssetUrlsFromHtml,
} from "./wp-content-tree";

export interface AssetVerificationReport {
  checkedAt: string;
  htmlPluginCss: string[];
  htmlPluginJs: string[];
  htmlCdnCss: string[];
  htmlCdnJs: string[];
  missingPluginCss: string[];
  missingPluginJs: string[];
  missingCdnCss: string[];
  missingCdnJs: string[];
  clonedPluginCss: number;
  clonedPluginJs: number;
}

function registryHas(registry: Record<string, string>, url: string): boolean {
  const bare = url.split("?")[0]!;
  return Boolean(registry[url] || registry[bare]);
}

/** Cross-check HTML references against downloaded registries. */
export function verifyAssetsAgainstHtml(
  html: string,
  pageUrl: string,
  siteSlug: string,
): AssetVerificationReport {
  const cssReg = loadCssRegistry(siteSlug);
  const jsReg = loadJsRegistry(siteSlug);

  const plugin = collectPluginAssetUrlsFromHtml(html, pageUrl);
  const cdn = collectCdnAssetUrlsFromHtml(html, pageUrl);

  const missingPluginCss = plugin.css.filter((u) => !registryHas(cssReg, u));
  const missingPluginJs = plugin.js.filter((u) => !registryHas(jsReg, u));
  const missingCdnCss = cdn.css.filter((u) => !registryHas(cssReg, u));
  const missingCdnJs = cdn.js.filter((u) => !registryHas(jsReg, u));

  return {
    checkedAt: new Date().toISOString(),
    htmlPluginCss: plugin.css,
    htmlPluginJs: plugin.js,
    htmlCdnCss: cdn.css,
    htmlCdnJs: cdn.js,
    missingPluginCss,
    missingPluginJs,
    missingCdnCss,
    missingCdnJs,
    clonedPluginCss: plugin.css.length - missingPluginCss.length,
    clonedPluginJs: plugin.js.length - missingPluginJs.length,
  };
}

export function printVerificationReport(report: AssetVerificationReport): void {
  console.log(
    `  ✓ Asset verify: plugin CSS ${report.clonedPluginCss}/${report.htmlPluginCss.length}, plugin JS ${report.clonedPluginJs}/${report.htmlPluginJs.length}`,
  );
  if (report.missingPluginCss.length) {
    console.log(`  ⚠ Missing plugin CSS (${report.missingPluginCss.length}):`);
    for (const u of report.missingPluginCss.slice(0, 8)) console.log(`    - ${u}`);
    if (report.missingPluginCss.length > 8) {
      console.log(`    … +${report.missingPluginCss.length - 8} more`);
    }
  }
  if (report.missingPluginJs.length) {
    console.log(`  ⚠ Missing plugin JS (${report.missingPluginJs.length}):`);
    for (const u of report.missingPluginJs.slice(0, 8)) console.log(`    - ${u}`);
    if (report.missingPluginJs.length > 8) {
      console.log(`    … +${report.missingPluginJs.length - 8} more`);
    }
  }
  if (report.htmlCdnCss.length || report.htmlCdnJs.length) {
    console.log(
      `  ℹ CDN/external: ${report.htmlCdnCss.length} CSS, ${report.htmlCdnJs.length} JS (${report.missingCdnCss.length + report.missingCdnJs.length} not mirrored)`,
    );
  }
}
