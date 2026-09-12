import fs from "node:fs";
import path from "node:path";
import {
  ensureCriticalCanvasCss,
  extractInlineElementorStyles,
  mirrorRemoteMediaUrls,
  patchElementorCssUrls,
  prepareGrapeHtmlForCanvas,
  rewriteAssetUrls,
  withBuilderCanvasStyles,
  writeElementorCanvasFixStyle,
  writeElementorKitVarsStyle,
  writeElementorPreviewStyle,
  writeSiteFontsStyle,
} from "./grape-prep";
import { pageKeyToComponent } from "./names";
import { cleanGeneratedProject, rmPathSafe } from "./fs-clean";
import { writeCanvasInlineScripts, readAssetManifest } from "./asset-manifest";
import { getMigratedDataDir } from "../shared/wp/config";
import { pageCanvasAssets, readPluginSite, type PluginSite } from "./read-plugin-site";
import {
  convertElementorDocument,
  type ElementorNode,
  type GrapeBlock,
  buildElementorResponsiveCss,
  buildElementorCustomCss,
  writeCustomCssFile,
  writeRewrittenPostCss,
  rewriteLinkedCssForBlocks,
} from "./elementor-to-grape";
import { assertValidAppTsx, buildAppTsx } from "./app-shell-template";
import { buildGrapeRegionTsx, GRAPE_EDITOR_CSS } from "./grape-region-template";
import {
  pipelineDetail,
  pipelineFail,
  pipelineInfo,
  pipelineOk,
  pipelineStep,
} from "../shared/pipeline-log";
import { getProjectsRoot } from "../shared/paths";

const GRAPE_BLOCKS_CSS = "/assets/inline/styles/grape-blocks.css";

/** Detect empty HTML documents from the WP plugin (DOCTYPE + empty body). */
function isExportHtmlBlank(html: string | undefined | null): boolean {
  if (!html?.trim()) return true;
  const stripped = html
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<(html|head|body|meta|title)[^>]*>/gi, "")
    .replace(/<\/(html|head|body|title)>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/\s+/g, "")
    .trim();
  return stripped.length < 8;
}

export function getProjectDir(slug: string): string {
  return path.join(getProjectsRoot(), slug);
}

/**
 * Generate an organized React + GrapeJS project from a plugin-export site.
 *
 * Layout (header/footer/menus) is rendered as shared React components; each
 * page's content slot is editable in GrapeJS.
 */
export async function generateReactGrapeProjectV2(opts: {
  siteSlug: string;
  port?: number;
}): Promise<string> {
  const slug = opts.siteSlug;
  const site = readPluginSite(slug);
  const projectDir = getProjectDir(slug);
  const port = opts.port ?? 8000;

  pipelineStep("convert", `Starting codegen for "${slug}"`, slug);
  pipelineDetail("projectDir", projectDir, slug);
  pipelineDetail("pages", String(site.pages.length), slug);
  pipelineDetail("assetsSource", site.assetsSourceDir, slug);

  try {
    cleanGeneratedProject(projectDir);

    fs.mkdirSync(path.join(projectDir, "src", "components", "layout"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, "src", "components", "grape"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, "src", "pages"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, "src", "data"), { recursive: true });
    fs.mkdirSync(path.join(projectDir, "public", "assets"), { recursive: true });

    const projectAssetsDir = path.join(projectDir, "public", "assets");
    // Import lands at public/wp-content + public/inline; Vite serves from public/assets/*.
    // Never copy public/ → public/assets/ wholesale (that nests forever and blows the stack).
    const copied = copyImportedPublicIntoViteAssets(site.assetsSourceDir, projectAssetsDir);
    pipelineStep("convert", `Copied imported assets → ${projectAssetsDir}`, slug);
    for (const name of copied) pipelineInfo(`asset: ${name}`, slug);

    const assetManifest = readAssetManifest(getMigratedDataDir(slug));
    if (assetManifest) {
      writeCanvasInlineScripts(assetManifest, site.assetsSourceDir, projectAssetsDir);
    }

    const isElementor = (site.pageBuilder ?? "unknown") === "elementor";
    if (isElementor) {
      const tryDataRoots = [
        path.join(process.cwd(), "Docker", "try-data", "radius-ois", "www"),
        path.join(process.cwd(), "Docker", "try-data", "smartco-20260705T182508Z-3-001", "smartco"),
        path.join(process.cwd(), "Docker", "try-data", "orbit-commercial-bank", "Orbit-Commercial-Bank"),
      ];
      ensureCriticalCanvasCss(projectAssetsDir, [site.assetsSourceDir, projectAssetsDir, ...tryDataRoots]);
      writeElementorPreviewStyle(projectAssetsDir);
      writeElementorCanvasFixStyle(projectAssetsDir);
      patchElementorCssUrls(projectAssetsDir);
    }

    writeGrapeBlocksStyle(projectAssetsDir);
    writeSiteFontsStyle(projectAssetsDir, { wordpressUrl: site.wordpressUrl });

    pipelineStep("convert", "Converting Elementor trees → GrapeJS blocks + writing site data", slug);
    writeData(projectDir, site, []);
    const elementorKitClasses = isElementor
      ? writeElementorKitVarsStyle(projectAssetsDir, {
          wordpressUrl: site.wordpressUrl,
        })
      : [];
    patchSiteKitClasses(projectDir, elementorKitClasses);

    pipelineStep("convert", "Writing React app shell (layout, pages, App.tsx)", slug);
    writeLayoutComponents(projectDir);
    writeSiteAssets(projectDir);
    writeGrapeRegion(projectDir);
    writePageModules(projectDir, site);
    writeRootFiles(projectDir, site, port);

    pipelineOk(`Converted → ${projectDir} (dev port ${port})`, slug);
    pipelineDetail("site.json", path.join(projectDir, "src", "data", "site.json"), slug);
    pipelineDetail("App.tsx", path.join(projectDir, "src", "App.tsx"), slug);
    return projectDir;
  } catch (err) {
    pipelineFail(err instanceof Error ? err.message : String(err), slug);
    throw err;
  }
}

/**
 * Copy imported public roots into the Vite assets folder.
 * Only copies known import entries — never mirrors `public` into `public/assets`.
 */
function copyImportedPublicIntoViteAssets(publicDir: string, viteAssetsDir: string): string[] {
  const copied: string[] = [];
  if (!fs.existsSync(publicDir)) return copied;

  fs.mkdirSync(viteAssetsDir, { recursive: true });

  const prefer = ["wp-content", "inline"];
  const names = new Set([
    ...prefer.filter((n) => fs.existsSync(path.join(publicDir, n))),
    ...fs.readdirSync(publicDir).filter((n) => {
      if (n === "assets") return false;
      const full = path.join(publicDir, n);
      try {
        return fs.statSync(full).isDirectory() || fs.statSync(full).isFile();
      } catch {
        return false;
      }
    }),
  ]);

  for (const name of names) {
    if (name === "assets") continue;
    const from = path.join(publicDir, name);
    const to = path.join(viteAssetsDir, name);
    if (!fs.existsSync(from)) continue;
    // Guard: never copy a path into itself / its descendant.
    if (isSameOrInside(to, from) || isSameOrInside(from, to)) continue;
    rmPathSafe(to);
    copyTreeSafe(from, to);
    copied.push(name);
  }

  return copied;
}

function isSameOrInside(child: string, parent: string): boolean {
  const rel = path.relative(path.resolve(parent), path.resolve(child));
  return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
}

function copyTreeSafe(src: string, dest: string, depth = 0): void {
  if (depth > 40) {
    throw new Error(`Asset copy exceeded max depth at ${src} (possible recursive nest)`);
  }
  const stat = fs.statSync(src);
  if (stat.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
      // Skip leftover nested assets/assets folders from older buggy generates.
      if (entry.name === "assets" && depth > 0) continue;
      const from = path.join(src, entry.name);
      const to = path.join(dest, entry.name);
      if (isSameOrInside(to, from) || isSameOrInside(from, to)) continue;
      copyTreeSafe(from, to, depth + 1);
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

function writeGrapeBlocksStyle(projectAssetsDir: string): void {
  const file = path.join(projectAssetsDir, "inline", "styles", "grape-blocks.css");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `/* Base styles for Elementor → GrapeJS block conversion (Stage 3) */
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: "Manrope", "Google Sans", system-ui, sans-serif; color: #202124; line-height: 1.5; }
section, div { min-width: 0; }
img { max-width: 100%; height: auto; }
a { color: inherit; }
h1, h2, h3, h4, h5, h6 { margin: 0 0 0.5em; line-height: 1.2; }
p { margin: 0 0 1em; }
ul { margin: 0; padding: 0; }
.gradient-text { background: linear-gradient(90deg, #FDCC4B, #282C31); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }

/* Logo / integration marquees (replaces miga_slide JS) */
.grape-marquee {
  overflow: hidden !important;
  width: 100%;
  max-width: 100%;
}
.grape-marquee-track {
  display: flex !important;
  flex-direction: row !important;
  align-items: center;
  width: max-content;
  gap: 28px;
  animation: grape-marquee-scroll 45s linear infinite;
}
.grape-marquee-track.is-reverse {
  animation-direction: reverse;
}
.grape-marquee-track img {
  flex: 0 0 auto;
  max-height: 48px;
  width: auto;
}
@keyframes grape-marquee-scroll {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}
@media (prefers-reduced-motion: reduce) {
  .grape-marquee-track { animation: none; }
}

/* Icon sizing — responsive CSS sets --ekit-*-size on [data-el-id]; these consume it */
[data-widget="elementskit-funfact"] {
  --ekit-funfact-icon-size: 35px;
}
[data-widget="elementskit-funfact"] > img,
[data-widget="elementskit-funfact"] img[alt=""] {
  width: var(--ekit-funfact-icon-size) !important;
  height: var(--ekit-funfact-icon-size) !important;
  max-width: none !important;
  object-fit: contain;
}
[data-widget="elementskit-button"] {
  --ekit-icon-size: 20px;
}
[data-widget="elementskit-button"] img {
  width: var(--ekit-icon-size) !important;
  height: var(--ekit-icon-size) !important;
  max-width: none !important;
  object-fit: contain;
  flex: 0 0 auto;
}
[data-widget="elementskit-button"] i,
[data-widget="elementskit-funfact"] i {
  font-size: var(--ekit-icon-size, var(--ekit-funfact-icon-size, 1em));
  line-height: 1;
}
`,
    "utf8",
  );
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

function loadGrapeBlocksForPage(siteSlug: string, pageKey: string): GrapeBlock[] | undefined {
  const dataDir = getMigratedDataDir(siteSlug);
  const rawPath = path.join(dataDir, "pages", pageKey, "raw.json");
  const metaPath = path.join(dataDir, "pages", pageKey, "meta.json");
  if (!fs.existsSync(rawPath)) return undefined;
  const meta = fs.existsSync(metaPath)
    ? (JSON.parse(fs.readFileSync(metaPath, "utf8")) as { pageBuilder?: string })
    : {};
  if (meta.pageBuilder !== "elementor") return undefined;
  const tree = JSON.parse(fs.readFileSync(rawPath, "utf8")) as ElementorNode[];
  if (!Array.isArray(tree) || tree.length === 0) return undefined;

  type MenuLike = { slug?: string; items?: Array<{ title: string; url: string; parentId?: number }> };
  let menus: MenuLike[] = [];
  const layoutPath = path.join(dataDir, "layout.json");
  if (fs.existsSync(layoutPath)) {
    try {
      menus = (JSON.parse(fs.readFileSync(layoutPath, "utf8")) as { menus?: MenuLike[] }).menus ?? [];
    } catch {
      menus = [];
    }
  }

  return convertElementorDocument(tree, {
    resolveTemplate: (id) => resolveTemplateDocument(dataDir, id),
    resolveMenu: (slug) => menus.find((m) => m.slug === slug)?.items ?? null,
  });
}

function writeResponsiveCssFile(
  assetsRoot: string,
  name: string,
  css: string,
): string | null {
  const trimmed = css.trim();
  if (!trimmed || trimmed.split("\n").length <= 1) return null;
  const rel = `inline/styles/${name}.css`;
  const abs = path.join(assetsRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${trimmed}\n`, "utf8");
  return `/assets/${rel}`;
}

function loadRawElementorTree(siteSlug: string, pageKey: string): ElementorNode[] | null {
  const dataDir = getMigratedDataDir(siteSlug);
  const rawPath = path.join(dataDir, "pages", pageKey, "raw.json");
  const metaPath = path.join(dataDir, "pages", pageKey, "meta.json");
  if (!fs.existsSync(rawPath)) return null;
  if (fs.existsSync(metaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as { pageBuilder?: string };
      if (meta.pageBuilder && meta.pageBuilder !== "elementor") return null;
    } catch {
      /* continue */
    }
  }
  try {
    const tree = JSON.parse(fs.readFileSync(rawPath, "utf8")) as ElementorNode[];
    return Array.isArray(tree) && tree.length > 0 ? tree : null;
  } catch {
    return null;
  }
}

function loadTemplateTreeByType(
  siteSlug: string,
  region: "header" | "footer",
): ElementorNode[] | null {
  const dataDir = getMigratedDataDir(siteSlug);
  const indexPath = path.join(dataDir, "templates", "index.json");
  if (!fs.existsSync(indexPath)) return null;
  type Tpl = { type?: string; title?: string; slug?: string; dataFile?: string };
  const templates = JSON.parse(fs.readFileSync(indexPath, "utf8")) as Tpl[];
  const ranked = templates
    .map((tpl) => {
      const type = (tpl.type ?? "").toLowerCase();
      const title = (tpl.title ?? "").toLowerCase();
      const slug = (tpl.slug ?? "").toLowerCase();
      let score = 0;
      if (type === region) score = 100;
      else if (title === region || slug === region) score = 70;
      else if (title.includes(region) || slug.includes(region)) score = 40;
      return { tpl, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score);
  for (const { tpl } of ranked) {
    if (!tpl.dataFile) continue;
    const abs = path.join(dataDir, tpl.dataFile);
    if (!fs.existsSync(abs)) continue;
    try {
      const tree = JSON.parse(fs.readFileSync(abs, "utf8")) as ElementorNode[];
      if (Array.isArray(tree) && tree.length > 0) return tree;
    } catch {
      /* next */
    }
  }
  return null;
}

/** Blocks mode still needs Elementor/theme CSS so layout, buttons, and images match the site. */
function blockModeCanvasStyles(fullStyles: string[]): string[] {
  return [GRAPE_BLOCKS_CSS, ...fullStyles.filter((s) => s !== GRAPE_BLOCKS_CSS)];
}

/** Extract <style> from Elementor library templates (nested shortcodes / logo carousels). */
function extractLibraryTemplateStyles(siteSlug: string, assetsRoot: string): string[] {
  const hrefs: string[] = [];
  const seen = new Set<string>();
  const dirs = [
    path.join(getMigratedDataDir(siteSlug), "templates"),
    path.join(
      process.cwd(),
      "Docker", "try-data",
      "radius-ois",
      "www",
      "wp-content",
      "uploads",
      "wp-grape-export",
      "latest",
      "templates",
    ),
  ];
  for (const dir of dirs) {
    if (!fs.existsSync(dir)) continue;
    for (const file of fs.readdirSync(dir)) {
      if (!file.endsWith(".html")) continue;
      const id = file.replace(/-.*$/, "").replace(/\.html$/i, "");
      if (!id || seen.has(id)) continue;
      const html = fs.readFileSync(path.join(dir, file), "utf8");
      if (!/<style/i.test(html)) continue;
      const extracted = extractInlineElementorStyles(html, assetsRoot, {
        name: `template-${id}-inline`,
      });
      if (extracted.styleHrefs.length) {
        seen.add(id);
        hrefs.push(...extracted.styleHrefs);
      }
    }
  }
  return hrefs;
}

/** Copy plugin-export sidecar CSS (Elementor / Otter page inline styles). */
function copyPageExportInlineCss(siteSlug: string, pageKey: string, assetsRoot: string): string[] {
  const dataDir = getMigratedDataDir(siteSlug);
  const hrefs: string[] = [];
  for (const name of ["inline.css", "atomic-wind.css"]) {
    const src = path.join(dataDir, "pages", pageKey, name);
    if (!fs.existsSync(src) || fs.statSync(src).size === 0) continue;
    const rel = `inline/styles/page-${pageKey}-${name.replace(/\.css$/, "")}.css`;
    const dest = path.join(assetsRoot, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, rewriteAssetUrls(fs.readFileSync(src, "utf8")), "utf8");
    hrefs.push(`/assets/${rel}`);
  }
  return hrefs;
}

function writeData(projectDir: string, site: PluginSite, elementorKitClasses: string[] = []): void {
  const assetsRoot = path.join(projectDir, "public", "assets");
  const isElementor = (site.pageBuilder ?? "unknown") === "elementor";

  const headerExtracted = extractInlineElementorStyles(
    mirrorRemoteMediaUrls(rewriteAssetUrls(site.headerHtml), assetsRoot),
    assetsRoot,
    { name: "layout-header-inline" },
  );
  const footerExtracted = extractInlineElementorStyles(
    mirrorRemoteMediaUrls(rewriteAssetUrls(site.footerHtml), assetsRoot),
    assetsRoot,
    { name: "layout-footer-inline" },
  );
  const libraryStyleHrefs = isElementor ? extractLibraryTemplateStyles(site.slug, assetsRoot) : [];
  const layoutStyleHrefs = [
    ...headerExtracted.styleHrefs,
    ...footerExtracted.styleHrefs,
    ...libraryStyleHrefs,
  ];

  // Page-level responsive CSS for header/footer Elementor templates (blocks path).
  const layoutResponsiveHrefs: string[] = [];
  if (isElementor) {
    const headerTree = loadTemplateTreeByType(site.slug, "header");
    if (headerTree) {
      const href = writeResponsiveCssFile(
        assetsRoot,
        "layout-header-responsive",
        buildElementorResponsiveCss(headerTree, "header"),
      );
      if (href) layoutResponsiveHrefs.push(href);
    }
    const footerTree = loadTemplateTreeByType(site.slug, "footer");
    if (footerTree) {
      const href = writeResponsiveCssFile(
        assetsRoot,
        "layout-footer-responsive",
        buildElementorResponsiveCss(footerTree, "footer"),
      );
      if (href) layoutResponsiveHrefs.push(href);
    }
  }

  const pages = site.pages.map((p) => {
    const canvas = pageCanvasAssets(site, p, assetsRoot);
    const grapeBlocks = isElementor ? loadGrapeBlocksForPage(site.slug, p.key) : null;
    const rawTree = isElementor ? loadRawElementorTree(site.slug, p.key) : null;
    const pageResponsiveHref =
      rawTree &&
      writeResponsiveCssFile(
        assetsRoot,
        `page-${p.key}-responsive`,
        buildElementorResponsiveCss(rawTree, p.key),
      );
    const pageCustomCssHref =
      rawTree &&
      writeCustomCssFile(
        assetsRoot,
        `page-${p.key}-custom`,
        buildElementorCustomCss(rawTree),
      );

    const mirrored = mirrorRemoteMediaUrls(rewriteAssetUrls(p.contentHtml), assetsRoot);
    const extracted = extractInlineElementorStyles(mirrored, assetsRoot, { postId: p.postId });
    const preparedHtml = prepareGrapeHtmlForCanvas(extracted.html, assetsRoot);
    const htmlIsBlank = isExportHtmlBlank(preparedHtml);
    const hasBlocks = Array.isArray(grapeBlocks) && grapeBlocks.length > 0;
    // Prefer rendered HTML when present; fall back to Elementor→blocks when HTML is empty.
    const contentMode = !htmlIsBlank ? ("html" as const) : hasBlocks ? ("blocks" as const) : ("html" as const);
    pipelineInfo(
      `page "${p.key}" → mode=${contentMode}${hasBlocks ? ` blocks=${grapeBlocks!.length}` : ""}`,
      site.slug,
    );
    const rewrittenPostCss = isElementor
      ? writeRewrittenPostCss(assetsRoot, p.postId, contentMode)
      : null;
    const exportInlineHrefs = copyPageExportInlineCss(site.slug, p.key, assetsRoot);
    const inlineHrefs =
      contentMode === "blocks"
        ? extracted.styleHrefs.map((href) => rewriteLinkedCssForBlocks(assetsRoot, href))
        : extracted.styleHrefs;

    const canvasStyles = withBuilderCanvasStyles(
      [
        ...canvas.styles,
        ...layoutStyleHrefs,
        ...layoutResponsiveHrefs,
        ...(pageResponsiveHref ? [pageResponsiveHref] : []),
        ...(pageCustomCssHref ? [pageCustomCssHref] : []),
        ...(rewrittenPostCss ? [rewrittenPostCss] : []),
        ...exportInlineHrefs,
        ...inlineHrefs,
      ],
      site.pageBuilder,
    );

    return {
      key: p.key,
      route: p.route,
      title: p.title,
      postId: p.postId,
      contentMode,
      grapeBlocks: grapeBlocks ?? undefined,
      contentHtml: preparedHtml,
      canvasStyles: contentMode === "blocks" ? blockModeCanvasStyles(canvasStyles) : canvasStyles,
      canvasScripts: canvas.scripts,
    };
  });

  const globalScripts = new Set<string>(site.globalScripts);
  for (const p of pages) {
    for (const s of p.canvasScripts) globalScripts.add(s);
  }

  fs.writeFileSync(
    path.join(projectDir, "src", "data", "site.json"),
    JSON.stringify(
      {
        slug: site.slug,
        name: site.name,
        exportFingerprint: site.exportFingerprint,
        elementorKitClasses,
        // Parent document must NOT load Elementor CSS (breaks GrapeJS icons).
        canvasStyles: [],
        canvasScripts: [...globalScripts],
        pages,
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "src", "data", "layout.json"),
    JSON.stringify(
      {
        headerHtml: prepareGrapeHtmlForCanvas(headerExtracted.html, assetsRoot),
        footerHtml: prepareGrapeHtmlForCanvas(footerExtracted.html, assetsRoot),
        headerBlocks: site.headerBlocks ?? null,
        footerBlocks: site.footerBlocks ?? null,
        menus: site.menus,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function patchSiteKitClasses(projectDir: string, elementorKitClasses: string[]): void {
  const sitePath = path.join(projectDir, "src", "data", "site.json");
  if (!fs.existsSync(sitePath)) return;
  const site = JSON.parse(fs.readFileSync(sitePath, "utf8")) as { elementorKitClasses?: string[] };
  site.elementorKitClasses = elementorKitClasses;
  fs.writeFileSync(sitePath, JSON.stringify(site, null, 2), "utf8");
}

function writeLayoutComponents(projectDir: string): void {
  const layoutDir = path.join(projectDir, "src", "components", "layout");

  fs.writeFileSync(
    path.join(layoutDir, "SiteNav.tsx"),
    `import layout from "../../data/layout.json";

interface MenuItem {
  id: number;
  title: string;
  url: string;
  parentId?: number;
}

function buildTree(items: MenuItem[]): Array<MenuItem & { children: MenuItem[] }> {
  const byId = new Map<number, MenuItem & { children: MenuItem[] }>();
  items.forEach((it) => byId.set(it.id, { ...it, children: [] }));
  const roots: Array<MenuItem & { children: MenuItem[] }> = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  });
  return roots;
}

/** Structured nav rendered from exported WordPress menus (fallback when no header HTML). */
export function SiteNav() {
  const menu = layout.menus?.[0];
  if (!menu) return null;
  const tree = buildTree(menu.items as MenuItem[]);

  return (
    <nav className="site-nav">
      <ul>
        {tree.map((item) => (
          <li key={item.id}>
            <a
              href={item.url}
              onClick={(e) => {
                if (item.url.startsWith("#")) {
                  e.preventDefault();
                  window.location.hash = item.url;
                }
              }}
            >
              {item.title}
            </a>
            {item.children.length > 0 && (
              <ul>
                {item.children.map((child) => (
                  <li key={child.id}>
                    <a
                      href={child.url}
                      onClick={(e) => {
                        if (child.url.startsWith("#")) {
                          e.preventDefault();
                          window.location.hash = child.url;
                        }
                      }}
                    >
                      {child.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(layoutDir, "SiteHeader.tsx"),
    `import layout from "../../data/layout.json";

/** Header HTML source from the WP export. Injected into each page canvas via GrapeRegion (\`site-header\`). */
export function SiteHeader() {
  if (!layout.headerHtml?.trim()) return null;
  return <div className="site-header" dangerouslySetInnerHTML={{ __html: layout.headerHtml }} />;
}

export function getHeaderHtml(): string {
  return layout.headerHtml?.trim() ?? "";
}

export function getHeaderBlocks(): unknown[] | null {
  const blocks = (layout as { headerBlocks?: unknown[] | null }).headerBlocks;
  return Array.isArray(blocks) && blocks.length > 0 ? blocks : null;
}
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(layoutDir, "SiteFooter.tsx"),
    `import layout from "../../data/layout.json";

/** Footer HTML source from the WP export. Injected into each page canvas via GrapeRegion (\`site-footer\`). */
export function SiteFooter() {
  if (!layout.footerHtml?.trim()) return null;
  return <div className="site-footer" dangerouslySetInnerHTML={{ __html: layout.footerHtml }} />;
}

export function getFooterHtml(): string {
  return layout.footerHtml?.trim() ?? "";
}

export function getFooterBlocks(): unknown[] | null {
  const blocks = (layout as { footerBlocks?: unknown[] | null }).footerBlocks;
  return Array.isArray(blocks) && blocks.length > 0 ? blocks : null;
}
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(layoutDir, "SiteLayout.tsx"),
    `import type { ReactNode } from "react";
import { SiteAssets } from "./SiteAssets";

/**
 * Editor shell only. Header/footer are GrapeJS components injected into each
 * page canvas (see GrapeRegion) so styles match the WordPress export.
 */
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site-layout">
      <SiteAssets />
      <main className="site-content">{children}</main>
    </div>
  );
}
`,
    "utf8",
  );
}

function writeSiteAssets(projectDir: string): void {
  fs.writeFileSync(
    path.join(projectDir, "src", "components", "layout", "SiteAssets.tsx"),
    `/** Canvas CSS must load only inside the GrapeJS iframe (canvas.styles). */
export function SiteAssets() {
  return null;
}
`,
    "utf8",
  );
}

function writeGrapeRegion(projectDir: string): void {
  fs.writeFileSync(
    path.join(projectDir, "src", "components", "grape", "GrapeRegion.tsx"),
    buildGrapeRegionTsx(),
    "utf8",
  );
}

function writePageModules(projectDir: string, site: PluginSite): void {
  for (const page of site.pages) {
    const componentName = pageKeyToComponent(page.key);
    fs.writeFileSync(
      path.join(projectDir, "src", "pages", `${componentName}.tsx`),
      `import { GrapeRegion } from "../components/grape/GrapeRegion";

export default function ${componentName}() {
  return <GrapeRegion pageKey=${JSON.stringify(page.key)} />;
}
`,
      "utf8",
    );
  }
}

function writeRootFiles(projectDir: string, site: PluginSite, port: number): void {
  const defaultPage = site.pages[0]?.key ?? "home";

  // Self-contained persist plugin for the generated Vite app (editor → filesystem).
  const persistSrc = path.join(process.cwd(), "Converter", "lib", "grape-persist-plugin.ts");
  if (fs.existsSync(persistSrc)) {
    fs.copyFileSync(persistSrc, path.join(projectDir, "grape-persist-plugin.ts"));
  }

  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify(
      {
        name: `grape-${site.slug}`,
        private: true,
        type: "module",
        scripts: {
          dev: "vite",
          build: "tsc -b && vite build",
          preview: `vite preview --host 0.0.0.0 --port ${port}`,
        },
        dependencies: {
          grapesjs: "^0.22.8",
          "lucide-react": "^0.544.0",
          react: "^19.2.0",
          "react-dom": "^19.2.0",
          "react-router-dom": "^7.9.4",
        },
        devDependencies: {
          "@types/react": "^19",
          "@types/react-dom": "^19",
          "@vitejs/plugin-react": "^4.7.0",
          typescript: "^5.9.0",
          vite: "^6.4.0",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "vite.config.ts"),
    `import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { grapePersistPlugin } from "./grape-persist-plugin";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), grapePersistPlugin(root)],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: path.resolve(root, "node_modules/react"),
      "react-dom": path.resolve(root, "node_modules/react-dom"),
    },
  },
  optimizeDeps: { include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"] },
  server: {
    host: true,
    port: Number(process.env.PORT) || ${port},
    strictPort: true,
    allowedHosts: true,
    // Do not HMR-reload the editor when we write site.json / page HTML on save.
    watch: {
      ignored: [
        "**/public/assets/**",
        "**/src/data/site.json",
        "**/src/data/layout.json",
        "**/data/pages/**",
      ],
    },
  },
});
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          skipLibCheck: true,
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          noEmit: true,
          resolveJsonModule: true,
        },
        include: ["src"],
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "index.html"),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${site.slug} — GrapeJS Editor</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "src", "main.tsx"),
    `import { createRoot } from "react-dom/client";
import "grapesjs/dist/css/grapes.min.css";
import App from "./App";
import "./App.css";

createRoot(document.getElementById("root")!).render(<App />);
`,
    "utf8",
  );

  const imports = site.pages
    .map((p) => `import ${pageKeyToComponent(p.key)} from "./pages/${pageKeyToComponent(p.key)}";`)
    .join("\n");

  const pageElementEntries = site.pages
    .map((p) => `  ${JSON.stringify(p.key)}: <${pageKeyToComponent(p.key)} />,`)
    .join("\n");

  const appTsx = buildAppTsx({
    siteName: site.name,
    imports,
    pageElementEntries,
    defaultPageKey: defaultPage,
  });
  assertValidAppTsx(appTsx);
  fs.writeFileSync(path.join(projectDir, "src", "App.tsx"), appTsx, "utf8");

  fs.writeFileSync(
    path.join(projectDir, "src", "App.css"),
    `* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; }
html, body, #root { height: 100%; }

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.app-main { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.site-layout { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; }
.site-content { flex: 1; min-height: 0; display: flex; flex-direction: column; }

.grape-region {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
}
${GRAPE_EDITOR_CSS}

/* Floating Pages button (bottom-right) */
.pages-fab {
  position: fixed;
  right: 20px;
  bottom: 24px;
  z-index: 70;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1rem;
  border: none;
  border-radius: 999px;
  background: #0d9488;
  color: #042f2e;
  font-size: 0.9375rem;
  font-weight: 700;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(13, 148, 136, 0.4);
}
.pages-fab:hover,
.pages-fab.is-open {
  background: #14b8a6;
}
.pages-fab-count {
  min-width: 1.5rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 0.75rem;
  text-align: center;
}

.pages-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  z-index: 80;
}
.pages-overlay.is-open {
  opacity: 1;
  pointer-events: auto;
}

.pages-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: min(340px, 92vw);
  background: #0f172a;
  color: #e5e7eb;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.35);
  transform: translateX(100%);
  transition: transform 0.25s ease;
  z-index: 90;
  display: flex;
  flex-direction: column;
}
.pages-sidebar.is-open {
  transform: translateX(0);
}

.pages-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid #1f2937;
}
.pages-sidebar-head h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
.pages-close {
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.15rem 0.4rem;
}
.pages-close:hover { color: #fff; }

.pages-search {
  padding: 0.75rem 1rem 0.25rem;
}
.pages-search input {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border: 1px solid #374151;
  border-radius: 6px;
  background: #111827;
  color: #e5e7eb;
  font-size: 0.875rem;
}
.pages-search input:focus {
  outline: none;
  border-color: #2563eb;
}

.pages-nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  overflow: auto;
  flex: 1;
}
.pages-nav a {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  width: 100%;
  text-align: left;
  padding: 0.65rem 0.85rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #e5e7eb;
  cursor: pointer;
  font-size: 0.9rem;
  text-decoration: none;
  box-sizing: border-box;
}
.pages-nav a:hover { background: #1f2937; }
.pages-nav a.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.pages-nav-title { font-weight: 600; }
.pages-nav-path {
  font-size: 0.7rem;
  opacity: 0.7;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
}
.pages-empty {
  margin: 1rem;
  color: #9ca3af;
  font-size: 0.875rem;
}
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "src", "vite-env.d.ts"),
    `/// <reference types="vite/client" />
`,
    "utf8",
  );
}
