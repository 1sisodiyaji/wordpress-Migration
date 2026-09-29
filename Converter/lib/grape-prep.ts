import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { extractPageShellBody } from "../shared/wp/page-shell";

/** Body HTML for GrapeJS, with wp-content URLs rewritten to /assets/wp-content/. */
export function prepareGrapeHtml(html: string): string {
  const withoutDoctype = html.trim().replace(/^<!DOCTYPE[^>]*>\s*/i, "");
  const body = extractPageShellBody(withoutDoctype);
  return rewriteAssetUrls(body);
}

export function rewriteAssetUrls(html: string): string {
  return html
    .replace(/https?:\/\/[^"'()\s]+?\/wp-content\//gi, "/assets/wp-content/")
    .replace(/(?<=["'(])\/?wp-content\//g, "/assets/wp-content/")
    .replace(/https?:\/\/[^"'()\s]+?\/wp-includes\//gi, "/assets/wp-includes/")
    .replace(/(?<=["'(])\/?wp-includes\//g, "/assets/wp-includes/")
    // Multisite / staging exports often keep /uploads/sites/{blog_id}/ while
    // the plugin copies media to /uploads/{yyyy}/{mm}/. Collapse the sites segment.
    .replace(/(\/assets\/wp-content\/uploads)\/sites\/\d+\//gi, "$1/");
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
/** Canvas font stack + local/remote font stylesheet imports (Elementor). */
export const SITE_FONTS_STYLE_HREF = "/assets/inline/styles/site-fonts.css";
/** Theme.json @font-face + orphan palette utilities (FSE / Gutenberg). */
export const THEME_FONTS_STYLE_HREF = "/assets/inline/styles/theme-fonts.css";

/** Duotone CSS vars (SVG filters live in /assets/inline/duotone-filters.html). */
export const THEME_DUOTONE_STYLE_HREF = "/assets/inline/styles/theme-duotone.css";
export const THEME_DUOTONE_SVG_HREF = "/assets/inline/duotone-filters.html";

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
      s !== THEME_FONTS_STYLE_HREF &&
      s !== THEME_DUOTONE_STYLE_HREF &&
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

/** WP 6.8+ design system tokens (handle: wp-theme). */
export const WP_DESIGN_TOKENS_HREF = "/assets/wp-includes/css/dist/theme/design-tokens.min.css";

/** Prefix canvas styles for the detected builder (skip Elementor chrome on Gutenberg/Neve). */
export function withBuilderCanvasStyles(
  styles: string[],
  pageBuilder?: string,
  assetsRoot?: string,
): string[] {
  if ((pageBuilder ?? "unknown") === "elementor") {
    return withElementorPreviewStyle(styles);
  }
  const remote = new Set(CANVAS_REMOTE_STYLES);
  const without = styles.filter(
    (s) =>
      s !== ELEMENTOR_PREVIEW_STYLE_HREF &&
      s !== ELEMENTOR_KIT_VARS_STYLE_HREF &&
      s !== ELEMENTOR_CANVAS_FIX_STYLE_HREF &&
      s !== SITE_FONTS_STYLE_HREF &&
      s !== THEME_FONTS_STYLE_HREF &&
      s !== THEME_DUOTONE_STYLE_HREF &&
      s !== WP_DESIGN_TOKENS_HREF &&
      !/\/css\/dist\/theme\/design-tokens/i.test(s) &&
      !remote.has(s) &&
      !/\/plugins\/elementor\//i.test(s) &&
      !/\/plugins\/elementskit/i.test(s) &&
      !/\/themes\/astra\//i.test(s) &&
      !/\/uploads\/elementor\//i.test(s),
  );

  const tokens: string[] = [];
  if (assetsRoot) {
    for (const rel of [
      "wp-includes/css/dist/theme/design-tokens.min.css",
      "wp-includes/css/dist/theme/design-tokens.css",
    ]) {
      const abs = path.join(assetsRoot, rel);
      if (fs.existsSync(abs) && fs.statSync(abs).size > 0) {
        tokens.push(`/assets/${rel}`);
        break;
      }
    }
  }

  const prefix = [THEME_FONTS_STYLE_HREF, THEME_DUOTONE_STYLE_HREF];

  // FSE/classic: theme fonts and duotone are always written under public/assets.
  return [...prefix, ...tokens, ...without];
}

/**
 * Emit @font-face from exported theme.json fontFace entries + palette utilities for
 * orphan color slugs (e.g. custom-hover) referenced in block markup but missing from
 * global-styles presets.
 */
export function writeThemeFontsStyle(
  projectAssetsDir: string,
  opts: { siteSlug: string; dataDir: string },
): string {
  const out = path.join(projectAssetsDir, "inline", "styles", "theme-fonts.css");
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const chunks: string[] = ["/* Theme fonts + orphan palette utilities (from WP theme export) */"];

  // Prefer exported wp-fonts-local dump when present.
  const exportedFonts = [
    path.join(opts.dataDir, "assets", "inline", "styles", "wp-fonts-local.css"),
    path.join(projectAssetsDir, "inline", "styles", "wp-fonts-local.css"),
  ];
  for (const f of exportedFonts) {
    if (fs.existsSync(f) && fs.statSync(f).size > 0) {
      let css = fs.readFileSync(f, "utf8");
      // Point font URLs at Vite-served theme copies when possible.
      css = css.replace(
        /url\(['"]?(?:https?:\/\/[^'")]+)?\/wp-content\/themes\/([^'")]+)['"]?\)/gi,
        (_m, rel: string) => `url("/assets/theme/${rel.replace(/^\/+/, "")}")`,
      );
      css = css.replace(
        /url\(['"]?(?:https?:\/\/[^'")]+)?\/wp-content\/themes\/([^/]+)\/([^'")]+)['"]?\)/gi,
        (_m, theme: string, rest: string) => `url("/assets/theme/${theme}/${rest}")`,
      );
      chunks.push(css);
      break;
    }
  }

  // Build @font-face from theme.json when wp-fonts-local was not exported.
  if (!chunks.some((c) => c.includes("@font-face"))) {
    const themeRoot = path.join(opts.dataDir, "theme");
    if (fs.existsSync(themeRoot)) {
      for (const slug of fs.readdirSync(themeRoot)) {
        const themeJsonPath = path.join(themeRoot, slug, "theme.json");
        if (!fs.existsSync(themeJsonPath)) continue;
        try {
          const themeJson = JSON.parse(fs.readFileSync(themeJsonPath, "utf8")) as {
            settings?: { typography?: { fontFamilies?: Array<{
              fontFamily?: string;
              fontFace?: Array<{
                fontFamily?: string;
                fontStyle?: string;
                fontWeight?: string;
                src?: string | string[];
              }>;
            }> } };
          };
          const families = themeJson.settings?.typography?.fontFamilies ?? [];
          for (const fam of families) {
            for (const face of fam.fontFace ?? []) {
              const srcs = Array.isArray(face.src) ? face.src : face.src ? [face.src] : [];
              const urls = srcs
                .map((src) => {
                  const cleaned = src.replace(/^file:(\.\/)?/, "");
                  if (!cleaned) return null;
                  return `url("/assets/theme/${slug}/${cleaned}") format("woff2")`;
                })
                .filter(Boolean);
              if (!urls.length) continue;
              const family = (face.fontFamily ?? fam.fontFamily ?? "sans-serif").replace(/^"|"$/g, "");
              chunks.push(`@font-face {
  font-family: ${family.includes(",") ? family : `"${family}"`};
  font-style: ${face.fontStyle ?? "normal"};
  font-weight: ${face.fontWeight ?? "400"};
  font-display: fallback;
  src: ${urls.join(", ")};
}`);
            }
          }
        } catch {
          /* skip corrupt theme.json */
        }
      }
    }
  }

  // Orphan palette: ColorValue attrs in theme HTML/patterns + used has-*-color classes.
  const palette = discoverOrphanThemeColors(opts.dataDir);
  if (Object.keys(palette).length) {
    chunks.push("/* Orphan theme color presets (referenced in blocks, missing from global-styles) */");
    chunks.push(":root {");
    for (const [slug, color] of Object.entries(palette)) {
      chunks.push(`  --wp--preset--color--${slug}: ${color};`);
    }
    chunks.push("}");
    for (const [slug, color] of Object.entries(palette)) {
      chunks.push(`.has-${slug}-color{color: var(--wp--preset--color--${slug}, ${color}) !important;}`);
      chunks.push(`.has-${slug}-background-color{background-color: var(--wp--preset--color--${slug}, ${color}) !important;}`);
      chunks.push(`.has-${slug}-border-color{border-color: var(--wp--preset--color--${slug}, ${color}) !important;}`);
    }
  }

  fs.writeFileSync(out, `${chunks.join("\n")}\n`, "utf8");

  // Duotone presets are often missing from exported global-styles; regenerate from theme.json.
  writeThemeDuotoneAssets(projectAssetsDir, opts.dataDir);

  return THEME_FONTS_STYLE_HREF;
}

type DuotonePreset = { slug?: string; colors?: string[]; name?: string };

/** Parse #rgb / #rrggbb / rgb() into 0–1 channel values (WP_Duotone compatible). */
function parseCssColorChannels(
  colorStr: string,
): { r: number; g: number; b: number; a: number } | null {
  const s = colorStr.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1];
    if (h.length === 3 || h.length === 4) {
      h = h
        .split("")
        .map((c) => c + c)
        .join("");
    }
    const r = parseInt(h.slice(0, 2), 16);
    const g = parseInt(h.slice(2, 4), 16);
    const b = parseInt(h.slice(4, 6), 16);
    const a = h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1;
    return { r: r / 255, g: g / 255, b: b / 255, a };
  }
  const rgb = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i,
  );
  if (rgb) {
    return {
      r: Math.min(255, Number(rgb[1])) / 255,
      g: Math.min(255, Number(rgb[2])) / 255,
      b: Math.min(255, Number(rgb[3])) / 255,
      a: rgb[4] !== undefined ? Number(rgb[4]) : 1,
    };
  }
  return null;
}

function buildDuotoneFilterSvg(filterId: string, colors: string[]): string | null {
  const values = { r: [] as number[], g: [] as number[], b: [] as number[], a: [] as number[] };
  for (const c of colors) {
    const ch = parseCssColorChannels(c);
    if (!ch) return null;
    values.r.push(ch.r);
    values.g.push(ch.g);
    values.b.push(ch.b);
    values.a.push(ch.a);
  }
  if (values.r.length < 2) return null;
  const join = (arr: number[]) => arr.map((n) => (Number.isInteger(n) ? String(n) : String(n))).join(" ");
  // Match WP_Duotone::get_filter_svg (whitespace-minified like SCRIPT_DEBUG off).
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 0 0" width="0" height="0" focusable="false" role="none" style="visibility: hidden; position: absolute; left: -9999px; overflow: hidden;">` +
    `<defs><filter id="${filterId}">` +
    `<feColorMatrix color-interpolation-filters="sRGB" type="matrix" values=".299 .587 .114 0 0 .299 .587 .114 0 0 .299 .587 .114 0 0 .299 .587 .114 0 0" />` +
    `<feComponentTransfer color-interpolation-filters="sRGB">` +
    `<feFuncR type="table" tableValues="${join(values.r)}" />` +
    `<feFuncG type="table" tableValues="${join(values.g)}" />` +
    `<feFuncB type="table" tableValues="${join(values.b)}" />` +
    `<feFuncA type="table" tableValues="${join(values.a)}" />` +
    `</feComponentTransfer>` +
    `<feComposite in2="SourceGraphic" operator="in" />` +
    `</filter></defs></svg>`
  );
}

function discoverThemeDuotonePresets(dataDir: string): DuotonePreset[] {
  const themeRoot = path.join(dataDir, "theme");
  const out: DuotonePreset[] = [];
  const seen = new Set<string>();

  const pushPresets = (list: DuotonePreset[] | undefined) => {
    for (const p of list ?? []) {
      const slug = (p.slug ?? "").trim();
      if (!slug || !Array.isArray(p.colors) || p.colors.length < 2 || seen.has(slug)) continue;
      seen.add(slug);
      out.push({ slug, colors: p.colors, name: p.name });
    }
  };

  // Prefer per-theme theme.json, then merged global-styles.json.
  if (fs.existsSync(themeRoot)) {
    for (const slug of fs.readdirSync(themeRoot)) {
      const themeJsonPath = path.join(themeRoot, slug, "theme.json");
      if (!fs.existsSync(themeJsonPath)) continue;
      try {
        const data = JSON.parse(fs.readFileSync(themeJsonPath, "utf8")) as {
          settings?: { color?: { duotone?: DuotonePreset[] } };
        };
        pushPresets(data.settings?.color?.duotone);
      } catch {
        /* skip */
      }
    }
  }

  for (const rel of ["theme/global-styles.json", "assets/theme/global-styles.json"]) {
    const p = path.join(dataDir, rel);
    if (!fs.existsSync(p)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(p, "utf8")) as {
        settings?: { color?: { duotone?: DuotonePreset[] } };
        styles?: unknown;
      };
      // Some exports nest under settings.color.duotone; others under theme JSON shape.
      pushPresets(data.settings?.color?.duotone);
    } catch {
      /* skip */
    }
  }

  return out;
}

/**
 * Emit WP-compatible duotone CSS custom properties + SVG filter defs.
 * global-styles export often omits --wp--preset--duotone--* and the SVG never
 * lands in the React DOM, so site logos keep their source colors instead of
 * the white/black duotone seen on WordPress.
 */
export function writeThemeDuotoneAssets(projectAssetsDir: string, dataDir: string): {
  cssHref: string;
  svgHref: string;
} {
  const cssOut = path.join(projectAssetsDir, "inline", "styles", "theme-duotone.css");
  const svgOut = path.join(projectAssetsDir, "inline", "duotone-filters.html");
  fs.mkdirSync(path.dirname(cssOut), { recursive: true });
  fs.mkdirSync(path.dirname(svgOut), { recursive: true });

  const presets = discoverThemeDuotonePresets(dataDir);
  const cssChunks: string[] = [
    "/* Theme duotone presets (from theme.json — often missing from exported global-styles) */",
    ":root {",
  ];
  const svgs: string[] = [];

  for (const preset of presets) {
    const slug = preset.slug!;
    const filterId = `wp-duotone-${slug}`;
    const svg = buildDuotoneFilterSvg(filterId, preset.colors!);
    if (!svg) continue;
    cssChunks.push(`  --wp--preset--duotone--${slug}: url('#${filterId}');`);
    svgs.push(svg);
  }
  cssChunks.push("}");

  const existing = fs.existsSync(cssOut) ? fs.readFileSync(cssOut, "utf8") : "";
  const keepExport =
    !svgs.length && existing.trim().length > 0 && !existing.includes("No duotone presets");
  if (!keepExport) {
    const css = svgs.length
      ? `${cssChunks.join("\n")}\n`
      : "/* No duotone presets on this theme. */\n:root {}\n";
    fs.writeFileSync(cssOut, css, "utf8");
  }
  if (svgs.length) {
    fs.writeFileSync(svgOut, `${svgs.join("\n")}\n`, "utf8");
  } else if (!fs.existsSync(svgOut)) {
    fs.writeFileSync(svgOut, "<!-- No duotone SVG filters on this theme. -->\n", "utf8");
  }

  return { cssHref: THEME_DUOTONE_STYLE_HREF, svgHref: THEME_DUOTONE_SVG_HREF };
}

/** Map slug → hex from theme markup ColorValue attrs and known aliases. */
function discoverOrphanThemeColors(dataDir: string): Record<string, string> {
  const found: Record<string, string> = {};
  const themeRoot = path.join(dataDir, "theme");
  if (!fs.existsSync(themeRoot)) return found;

  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      let st: fs.Stats;
      try {
        st = fs.statSync(full);
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (name === "node_modules" || name === ".git") continue;
        walk(full);
        continue;
      }
      if (!/\.(html|php|json)$/i.test(name)) continue;
      let text = "";
      try {
        text = fs.readFileSync(full, "utf8");
      } catch {
        continue;
      }
      // Prefer paired attrs: "fooColor":"slug","fooColorValue":"#hex"
      for (const m of text.matchAll(
        /"([a-zA-Z]+Color)"\s*:\s*"([a-z0-9-]+)"\s*,\s*"\1Value"\s*:\s*"(#[0-9a-fA-F]{3,8})"/g,
      )) {
        found[m[2]] = m[3];
      }
      // Reverse order: "fooColorValue":"#hex","fooColor":"slug"
      for (const m of text.matchAll(
        /"([a-zA-Z]+)ColorValue"\s*:\s*"(#[0-9a-fA-F]{3,8})"\s*,\s*"\1Color"\s*:\s*"([a-z0-9-]+)"/g,
      )) {
        found[m[3]] = m[2];
      }
    }
  };
  walk(themeRoot);

  // Resolve theme.json palette for alias fallbacks (custom-hover → gold accent).
  let palette: Array<{ slug?: string; color?: string }> = [];
  for (const slug of fs.existsSync(themeRoot) ? fs.readdirSync(themeRoot) : []) {
    const themeJson = path.join(themeRoot, slug, "theme.json");
    if (!fs.existsSync(themeJson)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(themeJson, "utf8")) as {
        settings?: { color?: { palette?: Array<{ slug?: string; color?: string }> } };
      };
      palette = data.settings?.color?.palette ?? palette;
      if (palette.length) break;
    } catch {
      /* ignore */
    }
  }
  const bySlug = Object.fromEntries(
    palette.filter((c) => c.slug && c.color).map((c) => [c.slug!, c.color!]),
  );

  // custom-hover is the barber gold accent; never leave it as white from iconColorValue noise.
  if (!found["custom-hover"] || /^#fff(fff)?$/i.test(found["custom-hover"])) {
    found["custom-hover"] =
      bySlug["custom-color-2"] || bySlug["custom-color-1"] || found["custom-hover"] || "#af804d";
  }
  // Muted description text — unpublished custom-color-6; soft gray on dark bg.
  if (!found["custom-color-6"]) {
    found["custom-color-6"] = "#b0b0b0";
  }

  return found;
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

/** Core WP design CSS/JS that must exist after convert (never leave these missing). */
export const CRITICAL_WP_INCLUDES_ASSETS: string[] = [
  "css/dist/theme/design-tokens.min.css",
  "css/dist/theme/design-tokens.css",
  "css/dist/block-library/style.min.css",
  "css/dist/block-library/style.css",
  "js/jquery/jquery.min.js",
  "js/jquery/jquery-migrate.min.js",
];

/**
 * Ensure WP design-token CSS + jQuery land under public/assets/wp-includes.
 * Recovers from export roots or an optional live WordPress URL.
 */
export async function ensureWpIncludesDesignAssets(
  projectAssetsDir: string,
  opts?: { fallbackRoots?: string[]; wordpressUrl?: string },
): Promise<string[]> {
  const copied: string[] = [];
  const vendorRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "vendor");
  const roots = [
    vendorRoot,
    ...(opts?.fallbackRoots ?? []),
  ];

  for (const rel of CRITICAL_WP_INCLUDES_ASSETS) {
    const dest = path.join(projectAssetsDir, "wp-includes", rel);
    if (fs.existsSync(dest) && fs.statSync(dest).size > 0) continue;

    let placed = false;
    for (const root of roots) {
      if (!root || !fs.existsSync(root)) continue;
      const candidates = [
        path.join(root, "wp-includes", rel),
        path.join(root, "assets", "wp-includes", rel),
        path.join(root, "public", "assets", "wp-includes", rel),
        path.join(root, "public", "wp-includes", rel),
      ];
      // Allow .css to satisfy a missing .min.css request (and vice versa).
      const alt =
        rel.endsWith(".min.css")
          ? rel.replace(/\.min\.css$/i, ".css")
          : rel.endsWith(".css")
            ? rel.replace(/\.css$/i, ".min.css")
            : null;
      if (alt) {
        candidates.push(
          path.join(root, "wp-includes", alt),
          path.join(root, "assets", "wp-includes", alt),
        );
      }
      const src = candidates.find((p) => fs.existsSync(p) && fs.statSync(p).size > 0);
      if (!src) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.copyFileSync(src, dest);
      copied.push(rel);
      placed = true;
      break;
    }

    if (placed || (fs.existsSync(dest) && fs.statSync(dest).size > 0)) continue;

    if (opts?.wordpressUrl) {
      try {
        const base = opts.wordpressUrl.replace(/\/$/, "");
        const url = `${base}/wp-includes/${rel}`;
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length >= 16) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, buf);
            copied.push(rel);
            continue;
          }
        }
      } catch {
        /* live WP may be offline */
      }
    }

    // Public mirror for design-tokens (WP core) so convert never ships without them.
    if (/design-tokens/i.test(rel)) {
      try {
        const mirror = `https://raw.githubusercontent.com/WordPress/WordPress/master/wp-includes/${rel}`;
        const res = await fetch(mirror, { signal: AbortSignal.timeout(12000) });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length >= 16) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, buf);
            copied.push(rel);
            continue;
          }
        }
      } catch {
        /* offline */
      }
    }

    // jQuery from public CDN when WP export omitted the file.
    if (/js\/jquery\/jquery\.min\.js$/i.test(rel)) {
      try {
        const res = await fetch("https://code.jquery.com/jquery-3.7.1.min.js", {
          signal: AbortSignal.timeout(12000),
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length >= 16) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, buf);
            copied.push(rel);
          }
        }
      } catch {
        /* offline */
      }
    }
    if (/js\/jquery\/jquery-migrate\.min\.js$/i.test(rel)) {
      try {
        const res = await fetch("https://code.jquery.com/jquery-migrate-3.4.1.min.js", {
          signal: AbortSignal.timeout(12000),
        });
        if (res.ok) {
          const buf = Buffer.from(await res.arrayBuffer());
          if (buf.length >= 16) {
            fs.mkdirSync(path.dirname(dest), { recursive: true });
            fs.writeFileSync(dest, buf);
            copied.push(rel);
            continue;
          }
        }
      } catch {
        /* offline */
      }
      // Prefer a present stub over a missing design-adjacent script.
      if (!fs.existsSync(dest) || fs.statSync(dest).size === 0) {
        fs.mkdirSync(path.dirname(dest), { recursive: true });
        fs.writeFileSync(dest, "/* jquery-migrate stub — full file missing from export */\n");
        copied.push(rel);
      }
    }
  }

  return copied;
}

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
