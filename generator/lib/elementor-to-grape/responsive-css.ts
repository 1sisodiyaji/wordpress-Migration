import type { ElementorNode } from "./types";
import { rewriteMediaUrl, sizeValue } from "./styles";

type Dim = { unit?: string; top?: string; right?: string; bottom?: string; left?: string; isLinked?: boolean };
type Size = { unit?: string; size?: number | string };

/** Elementor-aligned breakpoints (max-width). Order: wide → narrow so mobile wins. */
export const ELEMENTOR_BREAKPOINTS = [
  { key: "laptop", suffix: "_laptop", media: "(max-width: 1366px)", grapeWidth: "1366px" },
  { key: "tablet", suffix: "_tablet", media: "(max-width: 1024px)", grapeWidth: "768px" },
  { key: "mobile", suffix: "_mobile", media: "(max-width: 767px)", grapeWidth: "375px" },
] as const;

type Breakpoint = (typeof ELEMENTOR_BREAKPOINTS)[number];

function dimDecls(cssProp: string, box: Dim | undefined): string[] {
  if (!box || box.top === undefined) return [];
  const u = box.unit ?? "px";
  return [
    `${cssProp}-top: ${box.top}${u}`,
    `${cssProp}-right: ${box.right ?? box.top}${u}`,
    `${cssProp}-bottom: ${box.bottom ?? box.top}${u}`,
    `${cssProp}-left: ${box.left ?? box.top}${u}`,
  ];
}

function pick<T>(settings: Record<string, unknown>, base: string, suffix: string): T | undefined {
  return settings[`${base}${suffix}`] as T | undefined;
}

/** Build CSS declarations for one element at one breakpoint. */
export function responsiveDeclsForSettings(
  settings: Record<string, unknown>,
  suffix: string,
): string[] {
  const decls: string[] = [];

  const padding =
    pick<Dim>(settings, "padding", suffix) ?? pick<Dim>(settings, "_padding", suffix);
  decls.push(...dimDecls("padding", padding));

  const margin =
    pick<Dim>(settings, "_margin", suffix) ?? pick<Dim>(settings, "margin", suffix);
  decls.push(...dimDecls("margin", margin));

  const width =
    sizeValue(pick<Size>(settings, "width", suffix)) ??
    sizeValue(pick<Size>(settings, "_element_custom_width", suffix));
  if (width) decls.push(`width: ${width}`);

  const elWidth = pick<string>(settings, "_element_width", suffix);
  if (elWidth === "auto") decls.push("width: auto");
  if (elWidth === "inherit") decls.push("width: inherit");

  const minH = sizeValue(pick<Size>(settings, "min_height", suffix));
  if (minH) decls.push(`min-height: ${minH}`);

  const maxW =
    sizeValue(pick<Size>(settings, "boxed_width", suffix)) ??
    sizeValue(pick<Size>(settings, "max_width", suffix));
  if (maxW) decls.push(`max-width: ${maxW}`);

  const flexDir = pick<string>(settings, "flex_direction", suffix);
  if (flexDir) {
    decls.push("display: flex");
    decls.push(`flex-direction: ${flexDir}`);
  }

  const justify = pick<string>(settings, "flex_justify_content", suffix);
  if (justify) decls.push(`justify-content: ${justify}`);

  const alignItems = pick<string>(settings, "flex_align_items", suffix);
  if (alignItems) decls.push(`align-items: ${alignItems}`);

  const alignSelf = pick<string>(settings, "_flex_align_self", suffix);
  if (alignSelf) decls.push(`align-self: ${alignSelf}`);

  const wrap = pick<string>(settings, "flex_wrap", suffix);
  if (wrap) decls.push(`flex-wrap: ${wrap}`);

  const gap = pick<{ column?: string; row?: string; unit?: string }>(settings, "flex_gap", suffix);
  if (gap?.column !== undefined) {
    const u = gap.unit ?? "px";
    decls.push(`gap: ${gap.row ?? gap.column}${u} ${gap.column}${u}`);
  }

  const gridCols = pick<{ size?: number }>(settings, "grid_columns_grid", suffix);
  if (gridCols?.size) {
    decls.push("display: grid");
    decls.push(`grid-template-columns: repeat(${gridCols.size}, minmax(0, 1fr))`);
  }

  const fontSize =
    sizeValue(pick<Size>(settings, "typography_font_size", suffix)) ??
    sizeValue(pick<Size>(settings, "ekit_btn_typography_font_size", suffix)) ??
    sizeValue(pick<Size>(settings, "ekit_funfact_title_typography_font_size", suffix));
  if (fontSize) decls.push(`font-size: ${fontSize}`);

  const lineHeight = sizeValue(pick<Size>(settings, "typography_line_height", suffix));
  if (lineHeight) decls.push(`line-height: ${lineHeight}`);

  const letterSpacing = sizeValue(pick<Size>(settings, "typography_letter_spacing", suffix));
  if (letterSpacing) decls.push(`letter-spacing: ${letterSpacing}`);

  const textAlign =
    pick<string>(settings, "align", suffix) ??
    pick<string>(settings, "ekit_btn_align", suffix) ??
    pick<string>(settings, "ekit_funfact_text_align", suffix);
  if (textAlign) decls.push(`text-align: ${textAlign}`);

  const radius = pick<Dim>(settings, "border_radius", suffix);
  if (radius?.top !== undefined) {
    const u = radius.unit ?? "px";
    decls.push(
      `border-radius: ${radius.top}${u} ${radius.right ?? radius.top}${u} ${radius.bottom ?? radius.top}${u} ${radius.left ?? radius.top}${u}`,
    );
  }

  const btnPad = pick<Dim>(settings, "ekit_btn_text_padding", suffix);
  decls.push(...dimDecls("padding", btnPad));

  const iconSize = sizeValue(pick<Size>(settings, "ekit_btn_normal_icon_font_size", suffix));
  if (iconSize) decls.push(`--ekit-icon-size: ${iconSize}`);

  const funIcon = sizeValue(pick<Size>(settings, "ekit_funfact_icon_size", suffix));
  if (funIcon) decls.push(`--ekit-funfact-icon-size: ${funIcon}`);

  // Absolute offsets (common for floating icons)
  const ox = sizeValue(pick<Size>(settings, "_offset_x", suffix));
  const oy = sizeValue(pick<Size>(settings, "_offset_y", suffix));
  const oxEnd = sizeValue(pick<Size>(settings, "_offset_x_end", suffix));
  const oyEnd = sizeValue(pick<Size>(settings, "_offset_y_end", suffix));
  if (ox) decls.push(`left: ${ox}`);
  if (oy) decls.push(`top: ${oy}`);
  if (oxEnd) decls.push(`right: ${oxEnd}`);
  if (oyEnd) decls.push(`bottom: ${oyEnd}`);

  const z = pick<number | string>(settings, "_z_index", suffix);
  if (z !== undefined && z !== "") decls.push(`z-index: ${z}`);

  const hide = pick<string>(settings, "hide", suffix);
  if (hide && String(hide).includes("hidden")) {
    decls.push("display: none !important");
  }

  // Background image at breakpoint (rare but used)
  const bgImg = pick<{ url?: string }>(settings, "background_image", suffix);
  if (bgImg?.url) {
    decls.push(`background-image: url("${rewriteMediaUrl(bgImg.url)}")`);
  }

  return decls;
}

/** Classes Elementor uses for responsive visibility (frontend.min.css). */
export function elementorHideClasses(settings: Record<string, unknown> = {}): string[] {
  const classes: string[] = [];
  if (String(settings.hide_desktop ?? "").includes("hidden")) classes.push("elementor-hidden-desktop");
  if (String(settings.hide_laptop ?? "").includes("hidden")) classes.push("elementor-hidden-laptop");
  if (String(settings.hide_tablet ?? "").includes("hidden")) classes.push("elementor-hidden-tablet");
  if (String(settings.hide_mobile ?? "").includes("hidden")) classes.push("elementor-hidden-mobile");
  return classes;
}

function walk(node: ElementorNode, visit: (n: ElementorNode) => void): void {
  visit(node);
  for (const child of node.elements ?? []) walk(child, visit);
}

/**
 * Emit page-level responsive CSS targeting [data-el-id="…"] so GrapeJS blocks
 * pick up Elementor tablet/mobile/laptop settings (and hide_* rules).
 */
export function buildElementorResponsiveCss(tree: ElementorNode[], label = "page"): string {
  const buckets = new Map<string, string[]>();
  for (const bp of ELEMENTOR_BREAKPOINTS) buckets.set(bp.key, []);

  const visit = (node: ElementorNode) => {
    if (!node.id) return;
    const settings = node.settings ?? {};
    const sel = `[data-el-id="${node.id}"]`;

    for (const bp of ELEMENTOR_BREAKPOINTS) {
      const decls = responsiveDeclsForSettings(settings, bp.suffix);
      if (decls.length === 0) continue;
      buckets.get(bp.key)!.push(`${sel} {\n  ${decls.join(";\n  ")};\n}`);
    }
  };

  for (const root of tree) walk(root, visit);

  const parts: string[] = [
    `/* Auto-generated Elementor responsive CSS (${label}) — targets data-el-id */`,
  ];

  for (const bp of ELEMENTOR_BREAKPOINTS) {
    const rules = buckets.get(bp.key) ?? [];
    if (rules.length === 0) continue;
    parts.push(`@media ${bp.media} {\n${rules.join("\n")}\n}`);
  }

  // Explicit hide_* helpers (covers settings that only set the Elementor class flag)
  const hideRules: string[] = [];
  for (const root of tree) {
    walk(root, (node) => {
      if (!node.id) return;
      const s = node.settings ?? {};
      const sel = `[data-el-id="${node.id}"]`;
      if (String(s.hide_mobile ?? "").includes("hidden")) {
        hideRules.push(`@media (max-width: 767px) { ${sel} { display: none !important; } }`);
      }
      if (String(s.hide_tablet ?? "").includes("hidden")) {
        hideRules.push(
          `@media (min-width: 768px) and (max-width: 1024px) { ${sel} { display: none !important; } }`,
        );
      }
      if (String(s.hide_laptop ?? "").includes("hidden")) {
        hideRules.push(
          `@media (min-width: 1025px) and (max-width: 1366px) { ${sel} { display: none !important; } }`,
        );
      }
      if (String(s.hide_desktop ?? "").includes("hidden")) {
        hideRules.push(`@media (min-width: 1025px) { ${sel} { display: none !important; } }`);
      }
    });
  }
  if (hideRules.length) parts.push(...hideRules);

  return `${parts.join("\n\n")}\n`;
}

/** True when the tree has any responsive / hide settings worth emitting. */
export function treeHasResponsiveSettings(tree: ElementorNode[]): boolean {
  let found = false;
  for (const root of tree) {
    walk(root, (node) => {
      if (found) return;
      const s = node.settings ?? {};
      for (const key of Object.keys(s)) {
        if (/_(mobile|tablet|laptop)$/.test(key) || /^hide_(mobile|tablet|laptop|desktop)$/.test(key)) {
          found = true;
          return;
        }
      }
    });
  }
  return found;
}
