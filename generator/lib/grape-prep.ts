import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { extractPageShellBody } from "../../lib/wp/page-shell";

/** Body HTML for GrapeJS, with wp-content URLs rewritten to /assets/wp-content/. */
export function prepareGrapeHtml(html: string): string {
  const withoutDoctype = html.trim().replace(/^<!DOCTYPE[^>]*>\s*/i, "");
  const body = extractPageShellBody(withoutDoctype);
  return rewriteAssetUrls(body);
}

export function rewriteAssetUrls(html: string): string {
  return html
    .replace(/https?:\/\/[^"'()\s]+?\/wp-content\//gi, "/assets/wp-content/")
    .replace(/(?<=["'(])\/?wp-content\//g, "/assets/wp-content/");
}

/** Drop srcset candidates that were not copied (common cause of missing logos). */
export function pruneMissingSrcset(html: string, assetsRoot: string): string {
  return html.replace(/\ssrcset=["']([^"']*)["']/gi, (full, srcset: string) => {
    const kept = srcset
      .split(",")
      .map((part) => part.trim())
      .filter((part) => {
        const url = part.split(/\s+/)[0] ?? "";
        if (!url.startsWith("/assets/")) return true;
        const rel = url.replace(/^\/assets\//, "").split("?")[0] ?? "";
        const abs = path.join(assetsRoot, rel);
        return fs.existsSync(abs) && fs.statSync(abs).size > 0;
      });
    if (!kept.length) return "";
    return ` srcset="${kept.join(", ")}"`;
  });
}

/** Canvas stylesheet that reveals Elementor widgets before front-end JS runs animations. */
export const ELEMENTOR_PREVIEW_STYLE_HREF = "/assets/inline/styles/elementor-preview.css";
/** Makes Elementor kit CSS variables resolve inside the GrapeJS iframe (no WP body class). */
export const ELEMENTOR_KIT_VARS_STYLE_HREF = "/assets/inline/styles/elementor-kit-vars.css";
/** Canvas font stack + local/remote font stylesheet imports. */
export const SITE_FONTS_STYLE_HREF = "/assets/inline/styles/site-fonts.css";

/** Remote stylesheets the WP export often omits (fonts / Font Awesome). */
export const CANVAS_REMOTE_STYLES: string[] = [
  "https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap",
  "https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.1/css/all.min.css",
];

const ELEMENTOR_PREVIEW_STYLE_CONTENT = `/* Elementor marks animated widgets invisible until JS runs — show them in GrapeJS preview */
.elementor-invisible {
  visibility: visible !important;
}
`;

/**
 * Strip Elementor animation gating + force eager images.
 * GrapeJS iframes often never fire IntersectionObserver for loading="lazy".
 */
export function prepareGrapeHtmlForCanvas(html: string, assetsRoot?: string): string {
  let out = rewriteAssetUrls(html)
    .replace(/\s*elementor-invisible\b/g, "")
    .replace(/\s*elementor-animation-\S+/g, "")
    .replace(/\sloading=["']lazy["']/gi, ' loading="eager"')
    .replace(/\sdecoding=["']async["']/gi, "")
    .replace(/\sfetchpriority=["'][^"']*["']/gi, "");
  if (assetsRoot) out = pruneMissingSrcset(out, assetsRoot);
  return out;
}

export const ELEMENTOR_CANVAS_FIX_STYLE_HREF = "/assets/inline/styles/elementor-canvas-fixes.css";

const ELEMENTOR_CANVAS_FIX_STYLE_CONTENT = `/* GrapeJS canvas hardening for Elementor HTML */
img, video, svg {
  max-width: 100%;
  height: auto;
  opacity: 1 !important;
  visibility: visible !important;
}
.elementor-invisible,
.elementor-widget-image img {
  opacity: 1 !important;
  visibility: visible !important;
}
.e-con, .e-con-full, .e-flex, .elementor-widget-wrap {
  min-width: 0;
}
`;

export function writeElementorCanvasFixStyle(projectAssetsDir: string): void {
  const file = path.join(projectAssetsDir, "inline", "styles", "elementor-canvas-fixes.css");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, ELEMENTOR_CANVAS_FIX_STYLE_CONTENT, "utf8");
}

export function writeElementorPreviewStyle(projectAssetsDir: string): void {
  const file = path.join(projectAssetsDir, "inline", "styles", "elementor-preview.css");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, ELEMENTOR_PREVIEW_STYLE_CONTENT, "utf8");
  }
}

/**
 * Elementor stores global colors on `.elementor-kit-N` (applied to WP `<body>`).
 * GrapeJS canvas body lacks that class, so footer/header `var(--e-global-color-*)`
 * values never resolve. Mirror kit custom properties onto `:root, body`.
 */
export function writeElementorKitVarsStyle(
  projectAssetsDir: string,
  opts?: { wordpressUrl?: string },
): string[] {
  const kitClasses: string[] = [];
  const varBlocks: string[] = [];
  const seenKits = new Set<string>();

  const ingestCss = (css: string, label: string): void => {
    for (const match of css.matchAll(
      /(?:\:root,\s*body,\s*)?\.elementor-kit-(\d+)\s*\{([^}]*)\}/g,
    )) {
      const id = match[1]!;
      const body = match[2]?.trim() ?? "";
      const cls = `elementor-kit-${id}`;
      if (!kitClasses.includes(cls)) kitClasses.push(cls);
      if (!body || !/--e-global-/.test(body) || seenKits.has(cls)) continue;
      seenKits.add(cls);
      varBlocks.push(`/* from ${label} */\n:root, body, .${cls} { ${body} }`);
    }
  };

  const cssDir = path.join(projectAssetsDir, "wp-content", "uploads", "elementor", "css");
  if (fs.existsSync(cssDir)) {
    for (const file of fs.readdirSync(cssDir).sort()) {
      if (!file.endsWith(".css")) continue;
      const abs = path.join(cssDir, file);
      let css = fs.readFileSync(abs, "utf8");
      const patched = css.replace(
        /(?<!:root, body, )\.elementor-kit-(\d+)(\s*\{)/g,
        ":root, body, .elementor-kit-$1$2",
      );
      if (patched !== css) {
        fs.writeFileSync(abs, patched, "utf8");
        css = patched;
      }
      ingestCss(css, file);
    }
  }

  const inlineDir = path.join(projectAssetsDir, "inline", "styles");
  if (fs.existsSync(inlineDir)) {
    for (const file of fs.readdirSync(inlineDir).sort()) {
      if (!file.endsWith(".css") || file === "elementor-kit-vars.css") continue;
      ingestCss(fs.readFileSync(path.join(inlineDir, file), "utf8"), `inline/${file}`);
    }
  }

  if (!varBlocks.length && opts?.wordpressUrl) {
    try {
      const html = execFileSync(
        "curl",
        ["-fsSL", "--max-time", "20", opts.wordpressUrl.replace(/\/$/, "")],
        { encoding: "utf8", maxBuffer: 8 * 1024 * 1024 },
      );
      const match = html.match(/\.elementor-kit-\d+\s*\{[^}]+\}/);
      if (match?.[0]) ingestCss(match[0], opts.wordpressUrl);
    } catch {
      /* offline / unreachable */
    }
  }

  const out = path.join(projectAssetsDir, "inline", "styles", "elementor-kit-vars.css");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  let content =
    `/* Elementor kit globals for GrapeJS canvas (WP applies .elementor-kit-N on body) */\n` +
    (varBlocks.length
      ? `${varBlocks.join("\n")}\n`
      : `:root, body {\n  --e-global-color-primary: #000000;\n  --e-global-color-secondary: #54595F;\n  --e-global-color-text: #7A7A7A;\n  --e-global-color-accent: #FDCC4B;\n}\n`);
  // Kit declares Google Sans; canvas loads Manrope (licensed CDN face).
  content = content.replace(/"Google Sans"/gi, '"Manrope", "Google Sans"');
  fs.writeFileSync(out, content, "utf8");
  return kitClasses;
}

/**
 * Write site font + plugin CSS glue so typography matches the live WP site.
 * Pulls Astra local fonts + ElementsKit Pro styles when wordpressUrl is known.
 */
export function writeSiteFontsStyle(
  projectAssetsDir: string,
  opts?: { wordpressUrl?: string },
): string {
  const origin = (opts?.wordpressUrl ?? "https://radius-ois.ai").replace(/\/$/, "");
  const pluginImports: string[] = [];

  const remoteCss = [
    `${origin}/wp-content/astra-local-fonts/astra-local-fonts.css`,
    `${origin}/wp-content/plugins/elementskit/widgets/init/assets/css/widget-styles-pro.css`,
  ];

  for (const url of remoteCss) {
    try {
      const name = url.includes("astra-local-fonts")
        ? "astra-local-fonts.css"
        : "elementskit-widget-styles-pro.css";
      const dest = path.join(projectAssetsDir, "inline", "styles", name);
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
        execFileSync("curl", ["-fsSL", "--max-time", "25", "-o", dest, url], { stdio: "ignore" });
      }
      if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
        // Keep absolute origin URLs inside astra font-face (font files stay on WP).
        let css = fs.readFileSync(dest, "utf8");
        css = css.replace(/url\(\s*['"]?(?!https?:|data:)([^'")]+)['"]?\s*\)/gi, (_full, rel: string) => {
          const cleaned = rel.replace(/^\.\//, "").replace(/^\//, "");
          if (url.includes("astra-local-fonts")) {
            return `url("${origin}/wp-content/astra-local-fonts/${cleaned}")`;
          }
          return `url("${origin}/wp-content/plugins/elementskit/widgets/init/assets/css/${cleaned}")`;
        });
        fs.writeFileSync(dest, css, "utf8");
        pluginImports.push(`@import url("/assets/inline/styles/${name}");`);
      }
    } catch {
      /* offline — still emit Manrope remote import below */
    }
  }

  const out = path.join(projectAssetsDir, "inline", "styles", "site-fonts.css");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const css = `/* Site fonts + missing plugin stylesheets for GrapeJS canvas */
@import url("https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap");
${pluginImports.join("\n")}

:root, body {
  --e-canvas-font: "Manrope", "Google Sans", system-ui, sans-serif;
  font-family: var(--e-canvas-font);
}

h1, h2, h3, h4, h5, h6,
[data-widget="heading"],
[data-widget="text-editor"],
[data-widget="elementskit-button"],
[data-widget="elementskit-funfact"],
[data-widget="ekit-nav-menu"],
[data-widget="nav-menu"] {
  font-family: var(--e-canvas-font);
}
`;
  fs.writeFileSync(out, css, "utf8");
  return SITE_FONTS_STYLE_HREF;
}

export function withElementorPreviewStyle(styles: string[]): string[] {
  const remote = new Set(CANVAS_REMOTE_STYLES);
  const without = styles.filter(
    (s) =>
      s !== ELEMENTOR_PREVIEW_STYLE_HREF &&
      s !== ELEMENTOR_KIT_VARS_STYLE_HREF &&
      s !== ELEMENTOR_CANVAS_FIX_STYLE_HREF &&
      s !== SITE_FONTS_STYLE_HREF &&
      !remote.has(s),
  );
  return [
    SITE_FONTS_STYLE_HREF,
    ELEMENTOR_KIT_VARS_STYLE_HREF,
    ELEMENTOR_PREVIEW_STYLE_HREF,
    ELEMENTOR_CANVAS_FIX_STYLE_HREF,
    ...CANVAS_REMOTE_STYLES,
    ...without,
  ];
}

function pushIfExists(styles: string[], assetsRoot: string, rel: string): void {
  const abs = path.join(assetsRoot, "wp-content", rel);
  if (fs.existsSync(abs)) styles.push(`/assets/wp-content/${rel}`);
}

/** Core Elementor / theme CSS required for canvas fidelity (often missing from export enqueue). */
export const CRITICAL_CANVAS_CSS: string[] = [
  "plugins/elementor/assets/css/frontend.min.css",
  "plugins/elementor/assets/lib/eicons/css/elementor-icons.min.css",
  "plugins/elementor/assets/lib/font-awesome/css/all.min.css",
  "plugins/elementor/assets/lib/font-awesome/css/v4-shims.min.css",
  "plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css",
  "plugins/elementor/assets/css/conditionals/e-swiper.min.css",
  "plugins/elementor/assets/css/widget-heading.min.css",
  "plugins/elementor/assets/css/widget-image.min.css",
  "plugins/elementor/assets/css/widget-text-editor.min.css",
  "plugins/elementor/assets/css/widget-image-carousel.min.css",
  "plugins/elementor/assets/css/widget-button.min.css",
  "plugins/elementor/assets/css/widget-icon-box.min.css",
  "plugins/elementor/assets/css/widget-icon-list.min.css",
  "plugins/elementor/assets/css/widget-divider.min.css",
  "plugins/elementor/assets/css/widget-video.min.css",
  "plugins/elementor/assets/css/widget-social-icons.min.css",
  "plugins/elementor/assets/css/widget-counter.min.css",
  "plugins/elementor/assets/lib/animations/animations.min.css",
  "plugins/elementor-pro/assets/css/widget-form.min.css",
  "plugins/elementor-pro/assets/css/widget-nav-menu.min.css",
  "plugins/elementor-pro/assets/css/widget-call-to-action.min.css",
  "plugins/elementor-pro/assets/css/widget-carousel-module-base.min.css",
  "plugins/elementor/assets/css/widget-icon.min.css",
  "plugins/elementor/assets/css/widget-button.min.css",
  "plugins/elementskit-lite/modules/elementskit-icon-pack/assets/css/ekiticons.css",
  "plugins/elementskit-lite/widgets/init/assets/css/widget-styles.css",
  "plugins/elementskit-lite/widgets/init/assets/css/responsive.css",
  "plugins/elementskit-lite/widgets/init/assets/css/common.css",
  "plugins/elementskit-lite/widgets/init/assets/css/client-logo.css",
  "plugins/elementskit-lite/widgets/init/assets/css/button.css",
  "plugins/elementskit-lite/widgets/init/assets/css/funfact.css",
  "plugins/elementskit-lite/widgets/init/assets/css/icon-box.css",
  "plugins/elementskit-lite/widgets/init/assets/css/nav-menu.css",
  "plugins/elementskit-lite/widgets/init/assets/css/header-offcanvas.css",
  "plugins/elementskit-lite/widgets/init/assets/css/header-search.css",
  "plugins/elementskit-lite/widgets/init/assets/css/header-info.css",
  "uploads/elementor/css/custom-pro-widget-nav-menu.min.css",
  "themes/astra/assets/css/minified/main.min.css",
];

const CRITICAL_FONT_DIRS: string[] = [
  "plugins/elementor/assets/lib/eicons/fonts",
  "plugins/elementor/assets/lib/font-awesome/webfonts",
  "plugins/elementskit-lite/modules/elementskit-icon-pack/assets/fonts",
];

const CRITICAL_JS: string[] = [
  "plugins/elementor/assets/lib/swiper/v8/swiper.min.js",
  "plugins/slide-everything-for-elementor/scripts/main.js",
];

/**
 * Copy missing critical CSS into the project assets tree from fallback WP roots
 * (export public dir, try-data WordPress trees, etc.).
 */
export function ensureCriticalCanvasCss(
  projectAssetsDir: string,
  fallbackRoots: string[] = [],
): string[] {
  const copied: string[] = [];
  for (const rel of CRITICAL_CANVAS_CSS) {
    const dest = path.join(projectAssetsDir, "wp-content", rel);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;

    for (const root of fallbackRoots) {
      if (!root || !fs.existsSync(root)) continue;
      const candidates = [
        path.join(root, "wp-content", rel),
        path.join(root, "assets", "wp-content", rel),
        path.join(root, rel),
      ];
      const src = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).size > 0);
      if (!src) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      copied.push(rel);
      break;
    }
  }

  for (const dirRel of CRITICAL_FONT_DIRS) {
    const destDir = path.join(projectAssetsDir, "wp-content", dirRel);
    for (const root of fallbackRoots) {
      if (!root || !fs.existsSync(root)) continue;
      const srcDir = [
        path.join(root, "wp-content", dirRel),
        path.join(root, "assets", "wp-content", dirRel),
      ].find((p) => fs.existsSync(p));
      if (!srcDir) continue;
      fs.mkdirSync(destDir, { recursive: true });
      for (const file of fs.readdirSync(srcDir)) {
        const from = path.join(srcDir, file);
        const to = path.join(destDir, file);
        if (!fs.statSync(from).isFile()) continue;
        if (!fs.existsSync(to) || fs.statSync(to).size === 0) {
          fs.copyFileSync(from, to);
          copied.push(`${dirRel}/${file}`);
        }
      }
      break;
    }
  }

  for (const dirRel of [
    "plugins/elementskit-lite/widgets/init/assets/css",
    "plugins/elementskit/widgets/init/assets/css",
    "plugins/elementor/assets/css/conditionals",
  ]) {
    for (const root of fallbackRoots) {
      if (!root || !fs.existsSync(root)) continue;
      const srcDir = [
        path.join(root, "wp-content", dirRel),
        path.join(root, "assets", "wp-content", dirRel),
      ].find((p) => fs.existsSync(p));
      if (!srcDir) continue;
      const destDir = path.join(projectAssetsDir, "wp-content", dirRel);
      fs.mkdirSync(destDir, { recursive: true });
      for (const file of fs.readdirSync(srcDir)) {
        if (!file.endsWith(".css")) continue;
        const from = path.join(srcDir, file);
        const to = path.join(destDir, file);
        if (!fs.existsSync(from) || !fs.statSync(from).isFile()) continue;
        if (!fs.existsSync(to) || fs.statSync(to).size === 0) {
          fs.copyFileSync(from, to);
          copied.push(`${dirRel}/${file}`);
        }
      }
    }
  }

  const kitCssDirRel = "uploads/elementor/css";
  for (const root of fallbackRoots) {
    if (!root || !fs.existsSync(root)) continue;
    const srcDir = [
      path.join(root, "wp-content", kitCssDirRel),
      path.join(root, "assets", "wp-content", kitCssDirRel),
    ].find((p) => fs.existsSync(p));
    if (!srcDir) continue;
    const destDir = path.join(projectAssetsDir, "wp-content", kitCssDirRel);
    fs.mkdirSync(destDir, { recursive: true });
    for (const file of fs.readdirSync(srcDir)) {
      if (!file.endsWith(".css")) continue;
      if (!/^(custom-|base-|global|local-)/.test(file)) continue;
      const from = path.join(srcDir, file);
      const to = path.join(destDir, file);
      if (!fs.existsSync(from) || !fs.statSync(from).isFile()) continue;
      if (!fs.existsSync(to) || fs.statSync(to).size === 0) {
        fs.copyFileSync(from, to);
        copied.push(`${kitCssDirRel}/${file}`);
      }
    }
  }

  for (const rel of CRITICAL_JS) {
    const dest = path.join(projectAssetsDir, "wp-content", rel);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;
    for (const root of fallbackRoots) {
      if (!root || !fs.existsSync(root)) continue;
      const src = [
        path.join(root, "wp-content", rel),
        path.join(root, "assets", "wp-content", rel),
      ].find((p) => fs.existsSync(p) && fs.statSync(p).size > 0);
      if (!src) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      copied.push(rel);
      break;
    }
  }
  return copied;
}

/** Href list for critical CSS that exist under the project assets root. */
export function criticalCanvasStyleHrefs(assetsRoot: string): string[] {
  const styles: string[] = [];
  for (const rel of CRITICAL_CANVAS_CSS) pushIfExists(styles, assetsRoot, rel);
  return styles;
}

export function collectCanvasStyles(assetsRoot: string, postId?: number): string[] {
  const styles: string[] = [];
  const wpRoot = path.join(assetsRoot, "wp-content");
  if (!fs.existsSync(wpRoot)) return styles;

  for (const href of criticalCanvasStyleHrefs(assetsRoot)) styles.push(href);

  for (const dirRel of [
    "plugins/elementskit-lite/widgets/init/assets/css",
    "plugins/elementskit/widgets/init/assets/css",
    "plugins/elementor/assets/css/conditionals",
  ]) {
    const absDir = path.join(wpRoot, dirRel);
    if (!fs.existsSync(absDir)) continue;
    for (const file of fs.readdirSync(absDir).sort()) {
      if (!file.endsWith(".css")) continue;
      styles.push(`/assets/wp-content/${dirRel}/${file}`);
    }
  }

  const fixed = ["uploads/elementor/google-fonts/css/manrope.css", "uploads/elementor/google-fonts/css/roboto.css"];
  for (const rel of fixed) pushIfExists(styles, assetsRoot, rel);

  const elementorCssDir = path.join(wpRoot, "uploads/elementor/css");
  if (fs.existsSync(elementorCssDir)) {
    if (postId) {
      const pageCss = `post-${postId}.css`;
      if (fs.existsSync(path.join(elementorCssDir, pageCss))) {
        styles.push(`/assets/wp-content/uploads/elementor/css/${pageCss}`);
      }
    }
    for (const file of fs.readdirSync(elementorCssDir).sort()) {
      if (!file.endsWith(".css")) continue;
      if (postId && file === `post-${postId}.css`) continue;
      // Shared kit/widget chrome only — other pages' post-*.css conflicts.
      // Kit typography lives in local-*-frontend-*.css (Improved CSS Loading).
      if (/^(custom-|base-|global|local-)/.test(file)) {
        styles.push(`/assets/wp-content/uploads/elementor/css/${file}`);
      }
    }
  }

  return [...new Set(styles)];
}

/**
 * Pull Elementor `<style>` blocks into canvas stylesheets. GrapeJS drops nested
 * `<style>` tags (or dumps them as visible text), which collapses layout CSS.
 */
export function extractInlineElementorStyles(
  html: string,
  projectAssetsDir: string,
  opts?: { postId?: number; name?: string },
): { html: string; styleHrefs: string[] } {
  const chunks: string[] = [];
  const stripped = html.replace(/<style\b[^>]*>([\s\S]*?)<\/style>/gi, (_full, css: string) => {
    const trimmed = String(css).trim();
    if (trimmed) chunks.push(trimmed);
    return "";
  });

  if (!chunks.length) return { html, styleHrefs: [] };

  const fileName = opts?.name
    ? `${opts.name}.css`
    : opts?.postId
      ? `elementor-post-${opts.postId}-inline.css`
      : `elementor-inline-${createHash("sha1").update(chunks.join("\n")).digest("hex").slice(0, 10)}.css`;
  const relUnderAssets = path.posix.join("inline", "styles", fileName);
  const abs = path.join(projectAssetsDir, ...relUnderAssets.split("/"));
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const css = rewriteAssetUrls(`/* Extracted from rendered Elementor HTML */\n${chunks.join("\n\n")}\n`);
  fs.writeFileSync(abs, css, "utf8");

  return { html: stripped, styleHrefs: [`/assets/${relUnderAssets}`] };
}

/**
 * Download remote CDN images (ImageKit, etc.) into the project so the canvas
 * does not depend on third-party availability / lazy-load quirks.
 */
export function mirrorRemoteMediaUrls(
  html: string,
  projectAssetsDir: string,
): string {
  const mirrorDir = path.join(projectAssetsDir, "mirrored");
  fs.mkdirSync(mirrorDir, { recursive: true });
  const cache = new Map<string, string | null>();

  const mirrorOne = (url: string): string | null => {
    if (!/^https?:\/\//i.test(url)) return null;
    if (url.includes("/assets/")) return null;
    if (cache.has(url)) return cache.get(url) ?? null;
    try {
      const extMatch = url.match(/\.(png|jpe?g|webp|gif|svg|avif|mp4|webm)/i);
      const ext = (extMatch?.[1] ?? "bin").toLowerCase().replace("jpeg", "jpg");
      const hash = createHash("sha1").update(url.split("?")[0]!).digest("hex").slice(0, 16);
      const fileName = `${hash}.${ext}`;
      const abs = path.join(mirrorDir, fileName);
      if (!fs.existsSync(abs) || fs.statSync(abs).size === 0) {
        execFileSync("curl", ["-fsSL", "--max-time", "30", "-o", abs, url], {
          stdio: "ignore",
        });
      }
      if (fs.existsSync(abs) && fs.statSync(abs).size > 0) {
        const local = `/assets/mirrored/${fileName}`;
        cache.set(url, local);
        return local;
      }
    } catch {
      /* keep remote URL */
    }
    cache.set(url, null);
    return null;
  };

  let out = html.replace(
    /\b(src|data-src|data-lazy-src|href|poster)=["'](https?:\/\/[^"']+\.(?:png|jpe?g|webp|gif|svg|avif|mp4|webm)(?:\?[^"']*)?)["']/gi,
    (full, attr: string, url: string) => {
      const local = mirrorOne(url);
      return local ? `${attr}="${local}"` : full;
    },
  );

  // Catch CDN URLs embedded in inline JS / JSON (e.g. imageUrl: 'https://ik...')
  out = out.replace(
    /(https?:\/\/(?:ik\.imagekit\.io|cdn\.[^/"'\s]+)[^"'\s)]+\.(?:png|jpe?g|webp|gif|svg|avif|mp4|webm)(?:\?[^"'\s)]*)?)/gi,
    (url: string) => mirrorOne(url) ?? url,
  );

  out = out.replace(
    /\bsrcset=["']([^"']+)["']/gi,
    (full, srcset: string) => {
      const rewritten = srcset
        .split(",")
        .map((part) => {
          const trimmed = part.trim();
          const m = trimmed.match(/^(https?:\/\/\S+\.(?:png|jpe?g|webp|gif|svg|avif)(?:\?\S*)?)(\s+.*)?$/i);
          if (!m) return trimmed;
          const local = mirrorOne(m[1]!);
          return local ? `${local}${m[2] ?? ""}` : trimmed;
        })
        .join(", ");
      return `srcset="${rewritten}"`;
    },
  );

  out = out.replace(
    /url\(\s*['"]?(https?:\/\/[^'")\s]+\.(?:png|jpe?g|webp|gif|svg|avif)(?:\?[^'")\s]*)?)['"]?\s*\)/gi,
    (full, url: string) => {
      const local = mirrorOne(url);
      return local ? `url("${local}")` : full;
    },
  );

  return out;
}

/**
 * Rewrite asset URLs inside CSS, resolving ../fonts relative to the file's folder
 * (eicons, google-fonts, font-awesome each keep their own fonts directory).
 */
export function patchCssAssetUrls(css: string, cssFileRelUnderWpContent: string): string {
  const cssDir = path.posix.dirname(cssFileRelUnderWpContent.replace(/\\/g, "/"));
  const siblingFonts = path.posix.join(path.posix.dirname(cssDir), "fonts");

  return css
    .replace(
      /url\(\s*["']?https?:\/\/[^)"']*\/wp-content\/([^)"']+)["']?\s*\)/gi,
      'url("/assets/wp-content/$1")',
    )
    .replace(
      /url\(\s*(['"]?)\.\.\/fonts\/([^'")\s?]+)(?:\?[^'")\s]*)?\1\s*\)/g,
      `url("/assets/wp-content/${siblingFonts}/$2")`,
    );
}

/** Rewrite wp-content / font URLs inside all copied CSS under public/assets. */
export function patchElementorCssUrls(assetsRoot: string): void {
  const wpRoot = path.join(assetsRoot, "wp-content");
  if (!fs.existsSync(wpRoot)) return;

  const walk = (dir: string): void => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const abs = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.name.endsWith(".css")) patchCssFile(abs, wpRoot);
    }
  };

  walk(wpRoot);
}

function patchCssFile(abs: string, wpContentRoot: string): void {
  const rel = path.relative(wpContentRoot, abs).replace(/\\/g, "/");
  const css = fs.readFileSync(abs, "utf8");
  const patched = patchCssAssetUrls(css, rel);
  if (patched !== css) fs.writeFileSync(abs, patched, "utf8");
}
