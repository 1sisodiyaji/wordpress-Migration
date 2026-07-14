import fs from "node:fs";
import path from "node:path";
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

/** Canvas stylesheet that reveals Elementor widgets before front-end JS runs animations. */
export const ELEMENTOR_PREVIEW_STYLE_HREF = "/assets/inline/styles/elementor-preview.css";
/** Makes Elementor kit CSS variables resolve inside the GrapeJS iframe (no WP body class). */
export const ELEMENTOR_KIT_VARS_STYLE_HREF = "/assets/inline/styles/elementor-kit-vars.css";

const ELEMENTOR_PREVIEW_STYLE_CONTENT = `/* Elementor marks animated widgets invisible until JS runs — show them in GrapeJS preview */
.elementor-invisible {
  visibility: visible !important;
}
`;

/** Strip Elementor animation gating classes so static preview is not blank. */
export function prepareGrapeHtmlForCanvas(html: string): string {
  return rewriteAssetUrls(html)
    .replace(/\s*elementor-invisible\b/g, "")
    .replace(/\s*elementor-animation-\S+/g, "");
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
export function writeElementorKitVarsStyle(projectAssetsDir: string): string[] {
  const cssDir = path.join(projectAssetsDir, "wp-content", "uploads", "elementor", "css");
  const kitClasses: string[] = [];
  const varBlocks: string[] = [];

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

      for (const match of css.matchAll(/\.elementor-kit-(\d+)\s*\{([^}]*)\}/g)) {
        const id = match[1];
        const body = match[2]?.trim() ?? "";
        const cls = `elementor-kit-${id}`;
        if (!kitClasses.includes(cls)) kitClasses.push(cls);
        if (body && /--e-global-/.test(body)) {
          varBlocks.push(`/* from ${file} */\n:root, body, .${cls} { ${body} }`);
        }
      }
      // After :root, body patch, also match the expanded selector
      for (const match of css.matchAll(
        /:root,\s*body,\s*\.elementor-kit-(\d+)\s*\{([^}]*)\}/g,
      )) {
        const id = match[1];
        const body = match[2]?.trim() ?? "";
        const cls = `elementor-kit-${id}`;
        if (!kitClasses.includes(cls)) kitClasses.push(cls);
        if (body && /--e-global-/.test(body) && !varBlocks.some((b) => b.includes(`.${cls}`))) {
          varBlocks.push(`/* from ${file} */\n:root, body, .${cls} { ${body} }`);
        }
      }
    }
  }

  const out = path.join(projectAssetsDir, "inline", "styles", "elementor-kit-vars.css");
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const content =
    `/* Elementor kit globals for GrapeJS canvas (WP applies .elementor-kit-N on body) */\n` +
    (varBlocks.length
      ? `${varBlocks.join("\n")}\n`
      : `:root, body {\n  --e-global-color-primary: #000000;\n  --e-global-color-secondary: #54595F;\n  --e-global-color-text: #7A7A7A;\n  --e-global-color-accent: #FDCC4B;\n}\n`);
  fs.writeFileSync(out, content, "utf8");
  return kitClasses;
}

export function withElementorPreviewStyle(styles: string[]): string[] {
  const without = styles.filter(
    (s) => s !== ELEMENTOR_PREVIEW_STYLE_HREF && s !== ELEMENTOR_KIT_VARS_STYLE_HREF,
  );
  return [ELEMENTOR_KIT_VARS_STYLE_HREF, ELEMENTOR_PREVIEW_STYLE_HREF, ...without];
}

function pushIfExists(styles: string[], assetsRoot: string, rel: string): void {
  const abs = path.join(assetsRoot, "wp-content", rel);
  if (fs.existsSync(abs)) styles.push(`/assets/wp-content/${rel}`);
}

export function collectCanvasStyles(assetsRoot: string, postId?: number): string[] {
  const styles: string[] = [];
  const wpRoot = path.join(assetsRoot, "wp-content");
  if (!fs.existsSync(wpRoot)) return styles;

  const fixed = [
    "plugins/elementor/assets/css/frontend.min.css",
    "plugins/elementor/assets/lib/eicons/css/elementor-icons.min.css",
    "plugins/elementor/assets/lib/font-awesome/css/all.min.css",
    "uploads/elementor/google-fonts/css/manrope.css",
  ];
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
      if (file.startsWith("post-")) {
        styles.push(`/assets/wp-content/uploads/elementor/css/${file}`);
      }
    }
  }

  return [...new Set(styles)];
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
      /url\(\s*["']?\.\.\/fonts\/([^)]+)\)/g,
      `url("/assets/wp-content/${siblingFonts}/$1")`,
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
