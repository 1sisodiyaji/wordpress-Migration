import fs from "node:fs";
import path from "node:path";
import type { PluginExportAssetManifest, PluginExportAssetRef } from "../../lib/wp/types";
import { rewriteAssetUrls } from "./grape-prep";

const ASSETS_PREFIX = "/assets/";

/** jQuery for Elementor front-end widgets inside the GrapeJS canvas iframe. */
const JQUERY_CDN = "https://code.jquery.com/jquery-3.7.1.min.js";

/** Admin / editor handles that must never run in a static GrapeJS preview. */
const BLOCKED_SCRIPT_HANDLES = new Set([
  "admin-bar",
  "app-loader",
  "elementor-app-loader",
  "elementor-web-cli",
  "elementor-dev-tools",
  "elementor-common",
  "elementor-common-modules",
  "elementor-pro-app",
  "wp-api-request",
  "wp-hooks",
  "wp-i18n",
  "underscore",
  "backbone",
  "backbone-marionette",
  "backbone-radio",
  "elementor-dialog",
  "jquery-ui-core",
  "jquery-ui-mouse",
  "jquery-ui-draggable",
  "jquery-ui-position",
  "astra-flexibility",
  "astra-theme-js",
]);

/** Styles only needed in wp-admin. */
const BLOCKED_STYLE_HANDLES = new Set([
  "admin-bar",
  "dashicons",
  "wp-optimize-global",
]);

/** Map a bundle-relative path to the URL served by the generated Vite app. */
export function bundlePathToHref(bundlePath: string): string {
  const normalized = bundlePath.replace(/^assets\//, "");
  return `${ASSETS_PREFIX}${normalized}`;
}

function fileExists(assetsRoot: string, bundlePath: string): boolean {
  const rel = bundlePath.replace(/^assets\//, "");
  return fs.existsSync(path.join(assetsRoot, rel));
}

function entryHref(entry: PluginExportAssetRef, assetsRoot: string): string | null {
  if (entry.bundlePath && fileExists(assetsRoot, entry.bundlePath)) {
    return bundlePathToHref(entry.bundlePath);
  }
  if (entry.src) {
    const rewritten = rewriteAssetUrls(`"${entry.src}"`).slice(1, -1);
    if (rewritten.startsWith("/assets/wp-content/")) {
      const rel = rewritten.replace("/assets/", "");
      if (fs.existsSync(path.join(assetsRoot, rel))) return rewritten;
    }
  }
  return null;
}

function isBlockedStyle(entry: PluginExportAssetRef): boolean {
  const handle = entry.handle ?? "";
  if (BLOCKED_STYLE_HANDLES.has(handle)) return true;
  if (handle.includes("admin")) return true;
  const src = entry.src ?? "";
  return /wp-includes\//i.test(src);
}

function isBlockedScript(entry: PluginExportAssetRef): boolean {
  const handle = entry.handle ?? "";
  if (BLOCKED_SCRIPT_HANDLES.has(handle)) return true;
  if (handle.includes("admin")) return true;
  const src = entry.src ?? "";
  return /wp-includes\//i.test(src);
}

function patchInlineScript(js: string): string {
  return rewriteAssetUrls(js);
}

function inlineHref(handle: string, position: "before" | "after"): string {
  return `${ASSETS_PREFIX}inline/scripts/${handle}-${position}.js`;
}

function bundledInlineHref(entry: PluginExportAssetRef, assetsRoot: string): string | null {
  if (entry.bundleInline && fileExists(assetsRoot, entry.bundleInline)) {
    return bundlePathToHref(entry.bundleInline);
  }
  return null;
}

/** Minimal Elementor front-end config when the export missed inlineBefore. */
export function buildElementorFrontendConfigScript(version = "3.29.2"): string {
  const config = {
    environmentMode: { edit: false, wpPreview: false, isScriptDebug: false },
    i18n: {
      shareOnFacebook: "Share on Facebook",
      shareOnTwitter: "Share on Twitter",
      pinIt: "Pin it",
      download: "Download",
      downloadImage: "Download image",
      fullscreen: "Fullscreen",
      zoom: "Zoom",
      share: "Share",
      playVideo: "Play Video",
      previous: "Previous",
      next: "Next",
      close: "Close",
      a11yCarouselPrevSlideMessage: "Previous slide",
      a11yCarouselNextSlideMessage: "Next slide",
      a11yCarouselFirstSlideMessage: "This is the first slide",
      a11yCarouselLastSlideMessage: "This is the last slide",
      a11yCarouselPaginationBulletMessage: "Go to slide",
    },
    is_rtl: false,
    breakpoints: { xs: 0, sm: 480, md: 768, lg: 1025, xl: 1440, xxl: 1600 },
    responsive: {
      breakpoints: {
        mobile: { label: "Mobile Portrait", value: 767, default_value: 767, direction: "max", is_enabled: true },
        mobile_extra: { label: "Mobile Landscape", value: 880, default_value: 880, direction: "max", is_enabled: false },
        tablet: { label: "Tablet Portrait", value: 1024, default_value: 1024, direction: "max", is_enabled: true },
        tablet_extra: { label: "Tablet Landscape", value: 1200, default_value: 1200, direction: "max", is_enabled: false },
        laptop: { label: "Laptop", value: 1366, default_value: 1366, direction: "max", is_enabled: false },
        widescreen: { label: "Widescreen", value: 2400, default_value: 2400, direction: "min", is_enabled: false },
      },
      hasCustomBreakpoints: false,
    },
    version,
    is_static: false,
    experimentalFeatures: {
      e_font_icon_svg: true,
      additional_custom_breakpoints: true,
      container: true,
      e_local_google_fonts: true,
      theme_builder_v2: true,
      "nested-elements": true,
      editor_v2: true,
      e_element_cache: true,
      home_screen: true,
      "launchpad-checklist": true,
      "cloud-library": true,
      e_opt_in_v4_page: true,
    },
    urls: {
      assets: `${ASSETS_PREFIX}wp-content/plugins/elementor/assets/`,
      ajaxurl: "/wp-admin/admin-ajax.php",
      uploadUrl: `${ASSETS_PREFIX}wp-content/uploads`,
    },
    nonces: { floatingButtonsClickTracking: "preview" },
    swiperClass: "swiper",
    settings: { page: [], editorPreferences: [] },
    kit: {
      active_breakpoints: ["viewport_mobile", "viewport_tablet"],
      global_image_lightbox: "yes",
      lightbox_enable_counter: "yes",
      lightbox_enable_fullscreen: "yes",
      lightbox_enable_zoom: "yes",
      lightbox_enable_share: "yes",
      lightbox_title_src: "title",
      lightbox_description_src: "description",
    },
    post: { id: 0, title: "", excerpt: "", featuredImage: false },
  };
  return `var elementorFrontendConfig = ${JSON.stringify(config)};`;
}

function findCanvasEntry(
  manifest: PluginExportAssetManifest,
  href: string,
  assetsRoot: string,
): PluginExportAssetRef | undefined {
  return manifest.scripts?.find((entry) => entryHref(entry, assetsRoot) === href);
}

function inlineBlocksForEntry(
  entry: PluginExportAssetRef,
  assetsRoot: string,
): { before: string[]; after: string[] } {
  const handle = entry.handle ?? "script";
  const bundled = bundledInlineHref(entry, assetsRoot);
  if (bundled) return { before: [bundled], after: [] };

  const before: string[] = [];
  const after: string[] = [];
  if (entry.inlineBefore) before.push(inlineHref(handle, "before"));
  else if (handle === "elementor-frontend") before.push(inlineHref("elementor-frontend", "before"));
  if (entry.inlineAfter) after.push(inlineHref(handle, "after"));
  return { before, after };
}

function writeIfMissing(filePath: string, content: string): void {
  if (fs.existsSync(filePath)) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf8");
}

/**
 * Write inline script blocks referenced by the canvas script list into the project.
 */
export function writeCanvasInlineScripts(
  manifest: PluginExportAssetManifest,
  assetsRoot: string,
  projectAssetsDir: string,
): void {
  const srcInline = path.join(assetsRoot, "inline");
  if (fs.existsSync(srcInline)) {
    copyTree(srcInline, path.join(projectAssetsDir, "inline"));
  }

  const inlineDir = path.join(projectAssetsDir, "inline", "scripts");
  fs.mkdirSync(inlineDir, { recursive: true });

  for (const entry of manifest.scripts ?? []) {
    if (isBlockedScript(entry)) continue;
    const href = entryHref(entry, assetsRoot);
    if (!href || !isCanvasScriptHref(href)) continue;

    const handle = entry.handle ?? "script";
    if (bundledInlineHref(entry, assetsRoot)) continue;

    if (entry.inlineBefore) {
      writeIfMissing(
        path.join(inlineDir, `${handle}-before.js`),
        patchInlineScript(entry.inlineBefore),
      );
    } else if (handle === "elementor-frontend") {
      writeIfMissing(
        path.join(inlineDir, "elementor-frontend-before.js"),
        buildElementorFrontendConfigScript(entry.ver ?? undefined),
      );
    }

    if (entry.inlineAfter) {
      writeIfMissing(
        path.join(inlineDir, `${handle}-after.js`),
        patchInlineScript(entry.inlineAfter),
      );
    }
  }
}

function copyTree(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyTree(from, to);
    else fs.copyFileSync(from, to);
  }
}

/** Keep only local plugin scripts needed for Elementor front-end behaviour. */
function isCanvasScriptHref(href: string): boolean {
  if (!href.startsWith("/assets/wp-content/")) return false;
  return (
    href.includes("/elementor/assets/js/webpack.runtime") ||
    href.includes("/elementor/assets/js/frontend-modules") ||
    href.includes("/elementor/assets/js/frontend.min.js") ||
    href.includes("/elementor/assets/lib/swiper/") ||
    href.includes("/elementor-pro/assets/js/webpack-pro.runtime") ||
    href.includes("/elementor-pro/assets/js/frontend.min.js") ||
    href.includes("/elementor-pro/assets/js/elements-handlers") ||
    href.includes("/elementor-pro/assets/lib/smartmenus/") ||
    href.includes("/elementor-pro/assets/lib/sticky/") ||
    (href.includes("/elementskit-lite/") && href.endsWith(".js")) ||
    href.includes("/slide-everything-for-elementor/") ||
    (href.includes("/essential-addons") && href.endsWith(".js")) ||
    (href.includes("/aos/") && href.endsWith(".js")) ||
    (href.includes("/gsap") && href.endsWith(".js")) ||
    (href.includes("/locomotive-scroll/") && href.endsWith(".js"))
  );
}

export interface ResolvedSiteAssets {
  styles: string[];
  scripts: string[];
}

/**
 * Resolve stylesheet URLs from the exported manifest (preview-safe, local only).
 */
export function resolveSiteStyles(
  manifest: PluginExportAssetManifest,
  assetsRoot: string,
): string[] {
  const styles: string[] = [];
  for (const entry of manifest.stylesheets ?? []) {
    if (isBlockedStyle(entry)) continue;
    const href = entryHref(entry, assetsRoot);
    if (href?.startsWith("/assets/")) styles.push(href);
  }
  return [...new Set(styles)];
}

/**
 * Curated front-end scripts for the GrapeJS canvas iframe.
 * Skips wp-admin/editor bundles and remote wp-includes deps.
 */
export function resolveCanvasScripts(
  manifest: PluginExportAssetManifest,
  assetsRoot: string,
): string[] {
  const local: string[] = [];
  for (const entry of manifest.scripts ?? []) {
    if (isBlockedScript(entry)) continue;
    const href = entryHref(entry, assetsRoot);
    if (href && isCanvasScriptHref(href)) local.push(href);
  }

  const orderedUrls = [
    ...local.filter((u) => u.includes("webpack.runtime") && u.includes("/elementor/assets/")),
    ...local.filter((u) => u.includes("frontend-modules")),
    ...local.filter((u) => u.includes("/swiper/") && u.endsWith(".js")),
    ...local.filter((u) => u.includes("/elementor/assets/js/frontend.min.js")),
    ...local.filter((u) => u.includes("webpack-pro.runtime")),
    ...local.filter((u) => u.includes("/elementor-pro/assets/js/frontend.min.js")),
    ...local.filter((u) => u.includes("elements-handlers")),
    ...local.filter((u) => u.includes("smartmenus") || u.includes("sticky")),
    ...local.filter(
      (u) =>
        !u.includes("webpack.runtime") &&
        !u.includes("frontend-modules") &&
        !u.includes("/swiper/") &&
        !u.includes("/elementor/assets/js/frontend.min.js") &&
        !u.includes("webpack-pro.runtime") &&
        !u.includes("/elementor-pro/assets/js/frontend.min.js") &&
        !u.includes("elements-handlers") &&
        !u.includes("smartmenus") &&
        !u.includes("sticky"),
    ),
  ];

  const ordered: string[] = [JQUERY_CDN];
  for (const href of orderedUrls) {
    const entry = findCanvasEntry(manifest, href, assetsRoot);
    if (entry) {
      const { before, after } = inlineBlocksForEntry(entry, assetsRoot);
      ordered.push(...before);
    }
    ordered.push(href);
    if (entry) {
      const { after } = inlineBlocksForEntry(entry, assetsRoot);
      ordered.push(...after);
    }
  }

  return [...new Set(ordered)];
}

/**
 * Resolve stylesheet + script URLs from the exported manifest and copied bundle files.
 */
export function resolveSiteAssets(
  manifest: PluginExportAssetManifest,
  assetsRoot: string,
): ResolvedSiteAssets {
  return {
    styles: resolveSiteStyles(manifest, assetsRoot),
    scripts: resolveCanvasScripts(manifest, assetsRoot),
  };
}

export function readAssetManifest(dataDir: string): PluginExportAssetManifest | null {
  const p = path.join(dataDir, "assets", "manifest.json");
  if (!fs.existsSync(p)) return null;
  try {
    return JSON.parse(fs.readFileSync(p, "utf8")) as PluginExportAssetManifest;
  } catch {
    return null;
  }
}
