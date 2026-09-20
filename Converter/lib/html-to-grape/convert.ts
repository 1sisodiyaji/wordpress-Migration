import type { GrapeBlock } from "../elementor-to-grape/types";
import { attrOf, classesOf, innerHtmlOf, tagNameOf } from "./parse";
import { extractSectionHtmlChunks, stripPageChrome } from "./strip-chrome";

export type GutenbergBlock = {
  name?: string | null;
  attrs?: Record<string, unknown>;
  html?: string;
  innerBlocks?: GutenbergBlock[];
};

const STRUCTURAL = new Set([
  "core/group",
  "core/columns",
  "core/column",
  "core/cover",
  "core/row",
  "core/stack",
  "core/grid",
  "core/media-text",
  "core/query",
  "core/post-template",
]);

const SKIP_BLOCKS = new Set([
  "core/template-part",
  "core/skip-link",
]);

function isChromeTemplatePart(block: GutenbergBlock): boolean {
  const name = (block.name ?? "").toLowerCase();
  if (name !== "core/template-part") return false;
  const area = String(block.attrs?.area ?? "").toLowerCase();
  const slug = String(block.attrs?.slug ?? "").toLowerCase();
  return (
    area === "header" ||
    area === "footer" ||
    slug.includes("header") ||
    slug.includes("footer")
  );
}

function blockTag(name: string, html: string): string {
  if (name === "core/columns") return "div";
  if (name === "core/column") return "div";
  if (name === "core/group" || name === "core/cover" || name === "core/row") {
    return "section";
  }
  if (html) {
    const open = html.match(/^<([a-zA-Z0-9:-]+)\b/);
    if (open) return open[1]!.toLowerCase();
  }
  return "div";
}

function attrsToStyle(attrs: Record<string, unknown> | undefined): Record<string, string> | undefined {
  if (!attrs) return undefined;
  const style: Record<string, string> = {};
  const styleAttr = attrs.style;
  if (styleAttr && typeof styleAttr === "object") {
    const s = styleAttr as Record<string, unknown>;
    const spacing = s.spacing as Record<string, unknown> | undefined;
    if (spacing?.padding && typeof spacing.padding === "object") {
      const p = spacing.padding as Record<string, string>;
      if (p.top) style["padding-top"] = String(p.top);
      if (p.right) style["padding-right"] = String(p.right);
      if (p.bottom) style["padding-bottom"] = String(p.bottom);
      if (p.left) style["padding-left"] = String(p.left);
    }
    if (spacing?.margin && typeof spacing.margin === "object") {
      const m = spacing.margin as Record<string, string>;
      if (m.top) style["margin-top"] = String(m.top);
      if (m.bottom) style["margin-bottom"] = String(m.bottom);
    }
  }
  if (attrs.align === "full") style.width = "100%";
  return Object.keys(style).length ? style : undefined;
}

function classListFromBlock(name: string, attrs: Record<string, unknown> | undefined, html: string): string[] {
  const classes = new Set<string>();
  const slug = name.replace("/", "-");
  classes.add(`wp-block-${slug.replace(/^core-/, "")}`);
  if (html) {
    for (const c of classesOf(html.match(/^<[^>]+>/)?.[0] ?? "")) classes.add(c);
  }
  const align = attrs?.align;
  if (typeof align === "string" && align) classes.add(`align${align}`);
  const extra = attrs?.className;
  if (typeof extra === "string") {
    for (const c of extra.split(/\s+/)) if (c) classes.add(c);
  }
  return [...classes];
}

/** Convert a Gutenberg raw.json `{ blocks: [...] }` tree into Grape sections. */
export function convertGutenbergDocument(raw: unknown): GrapeBlock[] {
  const blocks: GutenbergBlock[] = Array.isArray(raw)
    ? (raw as GutenbergBlock[])
    : Array.isArray((raw as { blocks?: GutenbergBlock[] })?.blocks)
      ? ((raw as { blocks: GutenbergBlock[] }).blocks)
      : [];

  const out: GrapeBlock[] = [];
  for (const block of blocks) {
    const converted = convertGutenbergBlock(block);
    if (!converted) continue;
    if (Array.isArray(converted)) out.push(...converted);
    else out.push(converted);
  }
  return out;
}

function convertGutenbergBlock(block: GutenbergBlock): GrapeBlock | GrapeBlock[] | null {
  const name = (block.name ?? "core/freeform").toLowerCase();
  if (SKIP_BLOCKS.has(name) || isChromeTemplatePart(block)) return null;

  const html = (block.html ?? "").trim();
  const kids = (block.innerBlocks ?? [])
    .map((c) => convertGutenbergBlock(c))
    .flatMap((c) => (c == null ? [] : Array.isArray(c) ? c : [c]));

  // Structural: always a named section/column container
  if (STRUCTURAL.has(name) || kids.length > 0) {
    const tag = blockTag(name, html);
    const open = html.match(/^<[^>]+>/)?.[0] ?? "";
    const classes = classListFromBlock(name, block.attrs, open || html);
    const style = attrsToStyle(block.attrs);
    const blockName = name.replace(/^core\//, "");

    // Prefer nested converted children; if none, fall back to rendered inner HTML
    let components: GrapeBlock[] | string = kids;
    if (kids.length === 0 && html) {
      const inner = innerHtmlOf(html.startsWith("<") ? html : `<div>${html}</div>`);
      components = inner || html;
    }

    return {
      tagName: tag === "section" || name === "core/group" || name === "core/cover" ? "section" : tag,
      type: "default",
      name: blockName,
      classes,
      attributes: {
        "data-wp-block": name,
      },
      ...(style ? { style } : {}),
      components,
    };
  }

  // Leaf: keep rendered HTML as a section-ish wrapper so Layers stays navigable
  if (!html && kids.length === 0) return null;

  if (html.startsWith("<")) {
    const open = html.match(/^<[^>]+>/)?.[0] ?? "";
    const tag = tagNameOf(open) || "div";
    const classes = classesOf(open);
    const id = attrOf(open, "id");
    return {
      tagName: tag === "p" || tag === "h1" || tag === "h2" || tag === "h3" || tag === "span" ? "div" : tag,
      type: "default",
      name: name.replace(/^core\//, ""),
      classes: classes.length ? classes : classListFromBlock(name, block.attrs, html),
      attributes: {
        "data-wp-block": name,
        ...(id ? { id } : {}),
      },
      components: html,
    };
  }

  return {
    tagName: "div",
    type: "text",
    name: name.replace(/^core\//, ""),
    attributes: { "data-wp-block": name },
    content: html,
  };
}

/**
 * Convert rendered page HTML into top-level Grape section components.
 * Used when Gutenberg raw.json is empty/missing (typical FSE homepage).
 */
export function htmlToGrapeSections(html: string): GrapeBlock[] {
  const chunks = extractSectionHtmlChunks(html);
  if (chunks.length === 0) {
    const stripped = stripPageChrome(html);
    if (!stripped) return [];
    return [
      {
        tagName: "section",
        type: "default",
        name: "section",
        classes: ["wp-grape-section"],
        components: stripped,
      },
    ];
  }

  return chunks.map((chunk, i) => {
    const open = chunk.match(/^<[^>]+>/)?.[0] ?? "";
    const tag = tagNameOf(open) || "section";
    const classes = classesOf(open);
    const id = attrOf(open, "id");
    const style = attrOf(open, "style");
    const useSection = tag === "div" || tag === "section" || tag === "article";
    const inner = innerHtmlOf(chunk);

    return {
      tagName: useSection ? "section" : tag,
      type: "default",
      name: classes.find((c) => c.startsWith("wp-block-")) ?? `section-${i + 1}`,
      classes: classes.length ? classes : ["wp-grape-section"],
      attributes: {
        "data-grape-section": String(i + 1),
        ...(id ? { id } : {}),
        ...(style ? { style } : {}),
      },
      // Inner markup only — avoid double-wrapping the same block element.
      components: inner || chunk,
    };
  });
}
