import fs from "node:fs";
import path from "node:path";
import { getMigratedDataDir, getMigratedPublicDir } from "../../lib/wp/config";
import type {
  MigrationManifest,
  PluginExportBundleLayout,
  PluginExportMenu,
} from "../../lib/wp/types";
import { readAssetManifest, resolveCanvasScripts, resolveSiteStyles } from "./asset-manifest";
import { collectCanvasStyles } from "./grape-prep";

export interface PluginSitePage {
  key: string;
  route: string;
  title: string;
  postId?: number;
  /** Content-slot HTML (no header/footer). */
  contentHtml: string;
}

export interface PluginSite {
  slug: string;
  name: string;
  /** Busts GrapeJS localStorage when the export is re-imported. */
  exportFingerprint: string;
  headerHtml: string;
  footerHtml: string;
  menus: PluginExportMenu[];
  pages: PluginSitePage[];
  /** Site-wide stylesheet hrefs for shell + GrapeJS canvas. */
  globalStyles: string[];
  /** Site-wide script srcs for shell + GrapeJS canvas. */
  globalScripts: string[];
  assetsSourceDir: string;
}

function routeKey(routePath: string): string {
  if (routePath === "/") return "home";
  return routePath
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .replace(/\//g, "__")
    .replace(/[^\w-]+/g, "-") || "page";
}

/** True when the site was produced by the wp-grape-export importer (has v2 layout data). */
export function isPluginSite(slug: string): boolean {
  const dataDir = getMigratedDataDir(slug);
  return fs.existsSync(path.join(dataDir, "layout.json"));
}

/**
 * Load the v2 plugin-export site model from sites/{slug}/data.
 */
export function readPluginSite(slug: string): PluginSite {
  const dataDir = getMigratedDataDir(slug);

  const layoutPath = path.join(dataDir, "layout.json");
  if (!fs.existsSync(layoutPath)) {
    throw new Error(`No plugin-export layout for "${slug}". Run: pnpm import:plugin -- --zip <bundle> --site ${slug}`);
  }

  const layout = JSON.parse(fs.readFileSync(layoutPath, "utf8")) as PluginExportBundleLayout;

  let manifest: MigrationManifest | null = null;
  const manifestPath = path.join(dataDir, "manifest.json");
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as MigrationManifest;
  }

  const assetsSourceDir = getMigratedPublicDir(slug);
  const assetManifest = readAssetManifest(dataDir);
  const globalStyles = assetManifest
    ? resolveSiteStyles(assetManifest, assetsSourceDir)
    : [];
  const globalScripts = assetManifest
    ? resolveCanvasScripts(assetManifest, assetsSourceDir)
    : [];

  const pagesDir = path.join(dataDir, "pages");
  const pages: PluginSitePage[] = [];

  const routes = manifest?.routes ?? [];
  for (const route of routes) {
    const key = routeKey(route.path);

    const slotPath = path.join(pagesDir, key, "rendered.html");
    const flatPath = path.join(pagesDir, `${key}.html`);
    let contentHtml = "";
    if (fs.existsSync(slotPath)) {
      contentHtml = fs.readFileSync(slotPath, "utf8");
    } else if (fs.existsSync(flatPath)) {
      contentHtml = fs.readFileSync(flatPath, "utf8");
    }

    pages.push({
      key,
      route: route.path,
      title: titleForRoute(route.path, route.slug),
      postId: route.postId,
      contentHtml,
    });
  }

  pages.sort((a, b) => (a.route === "/" ? -1 : b.route === "/" ? 1 : a.route.localeCompare(b.route)));

  const exportFingerprint =
    manifest?.pluginExport?.exportedAt ?? manifest?.migratedAt ?? slug;

  const headerHtml =
    layout.header?.html?.trim() ||
    resolveRegionHtmlFromTemplates(dataDir, "header");
  const footerHtml =
    layout.footer?.html?.trim() ||
    resolveRegionHtmlFromTemplates(dataDir, "footer");

  return {
    slug,
    name: manifest?.site?.name ?? slug,
    exportFingerprint,
    headerHtml,
    footerHtml,
    menus: layout.menus ?? [],
    pages,
    globalStyles,
    globalScripts,
    assetsSourceDir,
  };
}

/**
 * Recover header/footer when the exporter mistyped ElementsKit templates as
 * wp-post/section. Prefer slug "header-all" / "footer-all", then "header"/"footer".
 */
function resolveRegionHtmlFromTemplates(dataDir: string, region: "header" | "footer"): string {
  const indexPath = path.join(dataDir, "templates", "index.json");
  if (!fs.existsSync(indexPath)) return "";

  type Tpl = { slug?: string; title?: string; type?: string; htmlFile?: string };
  const templates = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Tpl[];

  const score = (tpl: Tpl): number => {
    const slug = (tpl.slug ?? "").toLowerCase();
    const title = (tpl.title ?? "").toLowerCase();
    const type = (tpl.type ?? "").toLowerCase();
    if (type === region) return 100;
    if (slug === `${region}-all` || title === `${region}-all`) return 90;
    if (slug === region || title === region) return 70;
    if (slug.startsWith(region) || title.startsWith(region)) return 50;
    return 0;
  };

  const ranked = templates
    .map((tpl) => ({ tpl, score: score(tpl) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { tpl } of ranked) {
    if (!tpl.htmlFile) continue;
    const abs = path.join(dataDir, tpl.htmlFile);
    if (fs.existsSync(abs)) {
      const html = fs.readFileSync(abs, "utf8").trim();
      if (html) return html;
    }
  }
  return "";
}

/** Per-page canvas assets: global manifest + Elementor post CSS on disk. */
export function pageCanvasAssets(
  site: PluginSite,
  page: PluginSitePage,
  projectAssetsRoot: string,
): { styles: string[]; scripts: string[] } {
  const diskStyles = collectCanvasStyles(projectAssetsRoot, page.postId);
  return {
    styles: [...new Set([...diskStyles, ...site.globalStyles])],
    scripts: [...site.globalScripts],
  };
}

function titleForRoute(routePath: string, slug?: string): string {
  if (routePath === "/") return "Home";
  const base = slug ?? routePath.replace(/^\//, "").replace(/\/$/, "");
  return base
    .split(/[-_/]/)
    .filter(Boolean)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ") || "Page";
}
