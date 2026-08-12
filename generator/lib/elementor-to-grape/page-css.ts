import fs from "node:fs";
import path from "node:path";
import type { ElementorNode } from "./types";

/**
 * Rewrite Elementor Post CSS selectors so they match GrapeJS block markup
 * (`[data-el-id]` instead of `.elementor-element-{id}`).
 */
export function rewriteElementorCssForBlocks(css: string): string {
  let out = css
    // Combined Elementor wrapper + id
    .replace(/\.elementor-element\.elementor-element-([a-zA-Z0-9_-]+)/g, '[data-el-id="$1"]')
    // Bare id class
    .replace(/\.elementor-element-([a-zA-Z0-9_-]+)/g, '[data-el-id="$1"]')
    // data-id attributes sometimes appear in generated CSS
    .replace(/\.elementor-element\[data-id=["']([a-zA-Z0-9_-]+)["']\]/g, '[data-el-id="$1"]');

  // ElementsKit icon font-size → also size imgs in our block markup
  out = out.replace(
    /(\[data-el-id="[^"]+"\][^{]*?(?:elementskit-funfact-icon|funfact-icon|ekit-btn[^{]*icon)[^{]*)\{([^}]*)\}/gi,
    (full, sel: string, body: string) => {
      const m = body.match(/font-size\s*:\s*([^;}]+)/i);
      if (!m) return full;
      const size = m[1].trim();
      const elSel = String(sel).match(/\[data-el-id="[^"]+"\]/)?.[0];
      if (!elSel) return full;
      return `${full}\n${elSel} img{width:${size};height:${size};max-width:none;}`;
    },
  );

  return out;
}

/**
 * Emit Elementor Advanced → Custom CSS. `selector` becomes `[data-el-id="…"]`.
 */
export function buildElementorCustomCss(tree: ElementorNode[]): string {
  const parts: string[] = ["/* Elementor custom_css from settings (selector → data-el-id) */"];

  const visit = (node: ElementorNode) => {
    if (!node.id) return;
    const raw = String(node.settings?.custom_css ?? "").trim();
    if (!raw) return;
    const rewritten = raw
      .replace(/\bselector\b/g, `[data-el-id="${node.id}"]`)
      .replace(/\.elementor-element\.elementor-element-([a-zA-Z0-9_-]+)/g, '[data-el-id="$1"]')
      .replace(/\.elementor-element-([a-zA-Z0-9_-]+)/g, '[data-el-id="$1"]');
    parts.push(rewritten);
  };

  const walk = (n: ElementorNode) => {
    visit(n);
    for (const child of n.elements ?? []) walk(child);
  };
  for (const root of tree) walk(root);

  return parts.length > 1 ? `${parts.join("\n\n")}\n` : "";
}

/**
 * Read Elementor `post-{id}.css` from assets, rewrite for blocks mode, write companion file.
 * Returns the public href or null if missing.
 */
export function writeRewrittenPostCss(
  assetsRoot: string,
  postId: number | undefined,
  mode: "blocks" | "html",
): string | null {
  if (!postId) return null;
  const src = path.join(assetsRoot, "wp-content", "uploads", "elementor", "css", `post-${postId}.css`);
  if (!fs.existsSync(src) || fs.statSync(src).size === 0) return null;

  if (mode === "html") {
    return `/assets/wp-content/uploads/elementor/css/post-${postId}.css`;
  }

  const original = fs.readFileSync(src, "utf8");
  const rewritten = rewriteElementorCssForBlocks(original);
  const rel = `inline/styles/post-${postId}-blocks.css`;
  const dest = path.join(assetsRoot, rel);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(
    dest,
    `/* Rewritten from post-${postId}.css for GrapeJS blocks (data-el-id) */\n${rewritten}\n`,
    "utf8",
  );
  return `/assets/${rel}`;
}

/** Rewrite an already-written /assets/… CSS file for blocks selectors; returns new href. */
export function rewriteLinkedCssForBlocks(assetsRoot: string, href: string): string {
  const rel = href.replace(/^\/assets\//, "");
  const abs = path.join(assetsRoot, rel);
  if (!fs.existsSync(abs)) return href;
  const css = fs.readFileSync(abs, "utf8");
  if (!/\.elementor-element/i.test(css)) return href;
  const outRel = rel.replace(/\.css$/i, "-blocks.css");
  const outAbs = path.join(assetsRoot, outRel);
  fs.mkdirSync(path.dirname(outAbs), { recursive: true });
  fs.writeFileSync(
    outAbs,
    `/* Rewritten for GrapeJS blocks (data-el-id) */\n${rewriteElementorCssForBlocks(css)}\n`,
    "utf8",
  );
  return `/assets/${outRel.replace(/\\/g, "/")}`;
}

/** Write custom_css sheet; returns href or null. */
export function writeCustomCssFile(
  assetsRoot: string,
  name: string,
  css: string,
): string | null {
  const trimmed = css.trim();
  const withoutComments = trimmed.replace(/\/\*[\s\S]*?\*\//g, "").trim();
  if (!withoutComments) return null;
  const rel = `inline/styles/${name}.css`;
  const abs = path.join(assetsRoot, rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, `${trimmed}\n`, "utf8");
  return `/assets/${rel}`;
}
