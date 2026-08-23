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
import { convertElementorDocument, type ElementorNode, type GrapeBlock } from "./elementor-to-grape";

/**
 * Prefer public/sites/{slug}; if missing (common when data dir is a junction to
 * another slug), resolve the real data-dir slug and use that public folder.
 */
function resolveAssetsSourceDir(slug: string): string {
  const primary = getMigratedPublicDir(slug);
  if (fs.existsSync(primary)) return primary;
  try {
    const dataDir = getMigratedDataDir(slug);
    if (!fs.existsSync(dataDir)) return primary;
    const realData = fs.realpathSync(dataDir);
    const realSlug = path.basename(path.dirname(realData));
    if (realSlug && realSlug !== slug) {
      const alt = getMigratedPublicDir(realSlug);
      if (fs.existsSync(alt)) return alt;
    }
  } catch {
    /* keep primary */
  }
  return primary;
}

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
  /** Live WordPress origin (for kit CSS scrape when export lacks post-kit CSS). */
  wordpressUrl?: string;
  /** Busts GrapeJS localStorage when the export is re-imported. */
  exportFingerprint: string;
  headerHtml: string;
  footerHtml: string;
  /** Elementor→blocks when rendered header/footer HTML is empty. */
  headerBlocks?: GrapeBlock[];
  footerBlocks?: GrapeBlock[];
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

  const assetsSourceDir = resolveAssetsSourceDir(slug);
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

  const menus = layout.menus ?? [];
  const headerRegion = resolveRegionFromTemplates(dataDir, "header", menus);
  const footerRegion = resolveRegionFromTemplates(dataDir, "footer", menus);

  const headerHtml = layout.header?.html?.trim() || headerRegion.html;
  const footerHtml = layout.footer?.html?.trim() || footerRegion.html;

  return {
    slug,
    name: manifest?.site?.name ?? slug,
    wordpressUrl: manifest?.wordpressUrl ?? manifest?.site?.url,
    exportFingerprint,
    headerHtml,
    footerHtml,
    headerBlocks: headerHtml ? undefined : headerRegion.blocks,
    footerBlocks: footerHtml ? undefined : footerRegion.blocks,
    menus,
    pages,
    globalStyles,
    globalScripts,
    assetsSourceDir,
  };
}

type MenuLike = { slug?: string; items?: Array<{ title: string; url: string; parentId?: number }> };

/**
 * Recover header/footer when the exporter left rendered HTML empty.
 * Prefer HTML files; fall back to converting Elementor template JSON → Grape blocks.
 */
function resolveRegionFromTemplates(
  dataDir: string,
  region: "header" | "footer",
  menus: MenuLike[],
): { html: string; blocks?: GrapeBlock[] } {
  const indexPath = path.join(dataDir, "templates", "index.json");
  if (!fs.existsSync(indexPath)) return { html: "" };

  type Tpl = {
    slug?: string;
    title?: string;
    type?: string;
    htmlFile?: string;
    dataFile?: string;
  };
  const templates = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Tpl[];

  const score = (tpl: Tpl): number => {
    const slug = (tpl.slug ?? "").toLowerCase();
    const title = (tpl.title ?? "").toLowerCase();
    const type = (tpl.type ?? "").toLowerCase();
    if (type === region) return 100;
    if (slug === `${region}-all` || title === `${region}-all`) return 90;
    if (slug === region || title === region) return 70;
    if (slug.startsWith(region) || title.startsWith(region)) return 50;
    if (title.includes(region)) return 40;
    return 0;
  };

  const ranked = templates
    .map((tpl) => ({ tpl, score: score(tpl) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);

  for (const { tpl } of ranked) {
    if (tpl.htmlFile) {
      const abs = path.join(dataDir, tpl.htmlFile);
      if (fs.existsSync(abs)) {
        const html = fs.readFileSync(abs, "utf8").trim();
        if (html) return { html };
      }
    }
  }

  for (const { tpl } of ranked) {
    if (!tpl.dataFile) continue;
    const abs = path.join(dataDir, tpl.dataFile);
    if (!fs.existsSync(abs)) continue;
    try {
      const tree = JSON.parse(fs.readFileSync(abs, "utf8")) as ElementorNode[];
      if (!Array.isArray(tree) || tree.length === 0) continue;
      const blocks = convertElementorDocument(tree, {
        resolveTemplate: (id) => resolveTemplateDocument(dataDir, id),
        resolveMenu: (slug) => {
          const menu = menus.find((m) => m.slug === slug);
          return menu?.items ?? null;
        },
      });
      if (blocks.length > 0) return { html: "", blocks };
    } catch {
      /* try next */
    }
  }
  return { html: "" };
}

function resolveTemplateDocument(dataDir: string, templateId: string): ElementorNode[] | null {
  const templatesDir = path.join(dataDir, "templates");
  if (!fs.existsSync(templatesDir)) return null;
  const match = fs
    .readdirSync(templatesDir)
    .find((f) => f.startsWith(`${templateId}-`) && f.endsWith(".json"));
  if (!match) return null;
  try {
    const tree = JSON.parse(fs.readFileSync(path.join(templatesDir, match), "utf8")) as ElementorNode[];
    return Array.isArray(tree) ? tree : null;
  } catch {
    return null;
  }
}

/** @deprecated kept for callers; prefer resolveRegionFromTemplates */
function resolveRegionHtmlFromTemplates(dataDir: string, region: "header" | "footer"): string {
  return resolveRegionFromTemplates(dataDir, region, []).html;
}

interface PageAssetProfile {
  styles?: string[];
  scripts?: string[];
  widgets?: string[];
  animations?: string[];
  plugins?: string[];
  postCss?: string | null;
}

function hrefIfAssetExists(projectAssetsRoot: string, relOrHref: string): string | null {
  const raw = relOrHref.replace(/^\/assets\//, "").replace(/^\/+/, "");
  const rels = raw.startsWith("wp-content/")
    ? [raw, raw.replace(/^wp-content\//, "")]
    : raw.startsWith("inline/")
      ? [raw]
      : [`wp-content/${raw}`, raw, `wp-content/uploads/${raw}`];

  for (const rel of rels) {
    const abs = path.join(projectAssetsRoot, rel);
    if (fs.existsSync(abs) && fs.statSync(abs).size > 0) {
      return `/assets/${rel.replace(/\\/g, "/")}`;
    }
  }
  return null;
}

/** Per-page canvas assets: per-page export profile + global manifest + Elementor post CSS. */
export function pageCanvasAssets(
  site: PluginSite,
  page: PluginSitePage,
  projectAssetsRoot: string,
): { styles: string[]; scripts: string[] } {
  const diskStyles = collectCanvasStyles(projectAssetsRoot, page.postId);
  const pageProfile = readPageAssetProfile(site.slug, page.key);

  const profileStyles: string[] = [];
  for (const rel of pageProfile?.styles ?? []) {
    const href = hrefIfAssetExists(projectAssetsRoot, rel);
    if (href) profileStyles.push(href);
  }
  if (pageProfile?.postCss) {
    const href = hrefIfAssetExists(projectAssetsRoot, pageProfile.postCss);
    if (href) profileStyles.push(href);
  }

  const profileScripts: string[] = [];
  for (const rel of pageProfile?.scripts ?? []) {
    const href = hrefIfAssetExists(projectAssetsRoot, rel);
    if (href) profileScripts.push(href);
  }

  for (const extra of [
    "plugins/elementor/assets/lib/swiper/v8/swiper.min.js",
    "plugins/slide-everything-for-elementor/scripts/main.js",
  ]) {
    const href = hrefIfAssetExists(projectAssetsRoot, extra);
    if (href) profileScripts.push(href);
  }

  return {
    styles: [...new Set([...diskStyles, ...profileStyles, ...site.globalStyles])],
    scripts: [...new Set([...site.globalScripts, ...profileScripts])],
  };
}

function readPageAssetProfile(slug: string, pageKey: string): PageAssetProfile | null {
  const p = path.join(getMigratedDataDir(slug), "pages", pageKey, "assets.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as PageAssetProfile;
  } catch {
    return null;
  }
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
