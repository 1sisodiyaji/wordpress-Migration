import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir } from "./config";
import { getStyles } from "./load-migrated";
import {
  extractPageShellBody,
  getPageShellAssets,
  getPageShellHtml,
} from "./page-shell";
import { buildPreviewHeadLinks } from "./head-assets";
import { resolvePreviewScripts } from "./resolve-preview-scripts";
import { resolvePreviewStylesheets } from "./resolve-preview-stylesheets";
import type { PageShellAssets } from "./types";

function escapeAttr(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function buildStyleTags(assets: PageShellAssets | null): string {
  if (!assets?.styles?.length) return "";
  return assets.styles
    .filter((s) => s.inline)
    .map((s) => {
      const id = s.id ? ` id="${escapeAttr(s.id)}"` : "";
      return `<style${id}>${s.inline}</style>`;
    })
    .join("\n");
}

function isSpeculationRulesJson(inline: string): boolean {
  const t = inline.trim();
  return t.startsWith("{") && t.includes('"prefetch"');
}

/** Preserve crawl order — inline configs must run before their src handlers. */
function buildScriptTags(scripts: PageShellAssets["scripts"]): string {
  return scripts
    .map((s) => {
      if (s.src) {
        const id = s.id ? ` id="${escapeAttr(s.id)}"` : "";
        return `<script${id} src="${escapeAttr(s.src)}"></script>`;
      }
      if (s.inline) {
        if (isSpeculationRulesJson(s.inline)) return "";
        const id = s.id ? ` id="${escapeAttr(s.id)}"` : "";
        const type = s.type ? ` type="${escapeAttr(s.type)}"` : "";
        const body = s.inline.replace(/<\/script>/gi, "<\\/script>");
        return `<script${id}${type}>${body}</script>`;
      }
      return "";
    })
    .filter(Boolean)
    .join("\n");
}

const METRICS_BEACON = `
<script>
(function () {
  function send() {
    var nav = performance.getEntriesByType("navigation")[0];
    var resources = performance.getEntriesByType("resource");
    var transfer = 0;
    for (var i = 0; i < resources.length; i++) {
      transfer += resources[i].transferSize || 0;
    }
    var navSize = nav && nav.transferSize ? nav.transferSize : 0;
    parent.postMessage({
      type: "wp-migrate-metrics",
      pane: "migrated",
      loadTimeMs: nav ? Math.round(nav.loadEventEnd - nav.startTime) : 0,
      domContentLoadedMs: nav ? Math.round(nav.domContentLoadedEventEnd - nav.startTime) : 0,
      ttfbMs: nav ? Math.round(nav.responseStart - nav.startTime) : 0,
      pageSizeBytes: transfer + navSize,
      resourceCount: resources.length
    }, "*");
  }
  if (document.readyState === "complete") send();
  else window.addEventListener("load", send);
})();
</script>`;

/**
 * Full HTML document replay — permanent fix for Elementor CSS/JS parity.
 * Avoids React HTML parsing; runs crawled script stack in native order.
 */
export function buildRawPreviewDocument(siteSlug: string, routePath = "/"): string {
  const styles = getStyles(siteSlug);
  const rawHtml = getPageShellHtml(routePath, siteSlug);
  if (!rawHtml) {
    return "<!DOCTYPE html><html><body><p>Preview not ready</p></body></html>";
  }
  const html = extractPageShellBody(rawHtml);

  const assets = getPageShellAssets(routePath, siteSlug);
  const bodyClasses = [...(styles?.bodyClasses ?? []), "wp-migrated-root"].join(" ");
  const htmlClasses = styles?.htmlClasses?.join(" ") ?? "";

  const globalCssPath = path.join(
    getMigratedDataDir(siteSlug),
    "elementor",
    "global-styles.css",
  );
  const globalCss = fs.existsSync(globalCssPath)
    ? fs.readFileSync(globalCssPath, "utf8")
    : "";

  const headLinks = buildPreviewHeadLinks(siteSlug);
  const cssHrefs = resolvePreviewStylesheets(siteSlug);

  const cssLinks = cssHrefs
    .filter(Boolean)
    .map((href) => `<link rel="stylesheet" href="${escapeAttr(href)}">`)
    .join("\n");

  const scripts = buildScriptTags(
    resolvePreviewScripts(siteSlug, assets?.scripts ?? []),
  );
  const inlineHeadStyles = buildStyleTags(assets);

  return `<!DOCTYPE html>
<html lang="en" class="${escapeAttr(htmlClasses)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  ${headLinks}
  ${cssLinks}
  ${inlineHeadStyles}
  ${globalCss ? `<style id="elementor-global-custom">${globalCss}</style>` : ""}
  <style>
    body { margin: 0; box-sizing: border-box; }
    *, *::before, *::after { box-sizing: border-box; }
    img { max-width: 100%; height: auto; }
  </style>
</head>
<body class="${escapeAttr(bodyClasses)}">
${html}
${scripts}
${METRICS_BEACON}
</body>
</html>`;
}
