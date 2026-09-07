import type { ElementorNode } from "./types";
import { elementorHideClasses } from "./responsive-css";

type Dim = { unit?: string; top?: string; right?: string; bottom?: string; left?: string; isLinked?: boolean };
type Size = { unit?: string; size?: number | string; sizes?: unknown[] };

function dim4(key: string, box: Dim | undefined, style: Record<string, string>): void {
  if (!box || box.top === undefined) return;
  const u = box.unit ?? "px";
  style[`${key}-top`] = `${box.top}${u}`;
  style[`${key}-right`] = `${box.right ?? box.top}${u}`;
  style[`${key}-bottom`] = `${box.bottom ?? box.top}${u}`;
  style[`${key}-left`] = `${box.left ?? box.top}${u}`;
}

export function sizeValue(s: Size | undefined): string | undefined {
  if (!s || s.size === undefined || s.size === "") return undefined;
  return `${s.size}${s.unit ?? "px"}`;
}

export function rewriteMediaUrl(url: string): string {
  const trimmed = url.trim();
  if (!trimmed) return trimmed;

  // Keep absolute production / CDN URLs so images still render when the local
  // media mirror is incomplete. Only rewrite local/relative wp-content paths.
  if (/^https?:\/\//i.test(trimmed)) {
    if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i.test(trimmed)) {
      return trimmed.replace(/https?:\/\/[^"'()\s]+?\/wp-content\//gi, "/assets/wp-content/");
    }
    return trimmed;
  }

  return trimmed.replace(/^\/?(?:[^/]+\/)*wp-content\//, "/assets/wp-content/");
}

/** Resolve Elementor globals/colors?id=… → CSS variables used by the kit. */
export function resolveColorToken(
  settings: Record<string, unknown>,
  key: string,
): string | undefined {
  const globals = settings.__globals__ as Record<string, string> | undefined;
  const g = globals?.[key];
  if (typeof g === "string" && g.includes("globals/colors?id=")) {
    const id = g.split("id=")[1]?.trim();
    if (id) return `var(--e-global-color-${id})`;
  }
  const direct = settings[key];
  if (typeof direct === "string" && direct.trim()) return direct.trim();
  return undefined;
}

/** Google Sans isn't CDN-licensed; map it to Manrope (loaded on the canvas). */
export function canvasFontFamily(family: string | undefined): string | undefined {
  if (!family?.trim()) return undefined;
  const name = family.trim().replace(/^["']|["']$/g, "");
  if (/google\s*sans|product\s*sans/i.test(name)) {
    return '"Manrope", "Google Sans", system-ui, sans-serif';
  }
  return `"${name}", sans-serif`;
}

/**
 * Apply Elementor / ElementsKit typography keys onto a style bag.
 * prefixes e.g. "typography" → typography_font_size, or "ekit_btn_typography".
 */
export function applyTypography(
  settings: Record<string, unknown>,
  style: Record<string, string>,
  prefixes: string[] = ["typography"],
): void {
  for (const prefix of prefixes) {
    const family = canvasFontFamily(settings[`${prefix}_font_family`] as string | undefined);
    if (family) style["font-family"] = family;

    const fontSize = sizeValue(settings[`${prefix}_font_size`] as Size | undefined);
    if (fontSize) style["font-size"] = fontSize;

    const fontWeight = settings[`${prefix}_font_weight`];
    if (fontWeight !== undefined && fontWeight !== "") style["font-weight"] = String(fontWeight);

    const fontStyle = settings[`${prefix}_font_style`];
    if (fontStyle) style["font-style"] = String(fontStyle);

    const lineHeight = sizeValue(settings[`${prefix}_line_height`] as Size | undefined);
    if (lineHeight) style["line-height"] = lineHeight;

    const letterSpacing = sizeValue(settings[`${prefix}_letter_spacing`] as Size | undefined);
    if (letterSpacing) style["letter-spacing"] = letterSpacing;

    const textTransform = settings[`${prefix}_text_transform`];
    if (textTransform) style["text-transform"] = String(textTransform);

    const textDecoration = settings[`${prefix}_text_decoration`];
    if (textDecoration) style["text-decoration"] = String(textDecoration);
  }
}

/** Map Elementor container/widget settings to inline GrapeJS styles. */
export function elementorSettingsToStyle(settings: Record<string, unknown> = {}): Record<string, string> {
  const style: Record<string, string> = {};

  dim4("padding", settings.padding as Dim | undefined, style);
  dim4("margin", settings._margin as Dim | undefined, style);
  if (!style["margin-top"] && settings.margin) dim4("margin", settings.margin as Dim, style);

  const width = sizeValue(settings.width as Size | undefined);
  if (width) style.width = width;

  const minH = sizeValue(settings.min_height as Size | undefined);
  if (minH) style["min-height"] = minH;

  // Flex layout (Elementor containers)
  const flexDir = settings.flex_direction as string | undefined;
  if (flexDir) {
    style.display = "flex";
    style["flex-direction"] = flexDir;
  }

  const justify = settings.flex_justify_content as string | undefined;
  if (justify) style["justify-content"] = justify;

  const flexAlign = settings.flex_align_items as string | undefined;
  if (flexAlign) style["align-items"] = flexAlign;

  const wrap = settings.flex_wrap as string | undefined;
  if (wrap) style["flex-wrap"] = wrap;

  const gap = settings.flex_gap as { column?: string; row?: string; unit?: string } | undefined;
  if (gap?.column !== undefined) {
    const u = gap.unit ?? "px";
    style.gap = `${gap.row ?? gap.column}${u} ${gap.column}${u}`;
  }

  // Grid
  const gridCols = settings.grid_columns_grid as { size?: number } | undefined;
  if (gridCols?.size) {
    style.display = "grid";
    style["grid-template-columns"] = `repeat(${gridCols.size}, 1fr)`;
  }
  const eGridCols = settings.e_con_grid_template_columns as string | undefined;
  if (eGridCols) {
    style.display = "grid";
    style["grid-template-columns"] = eGridCols.replace(/repeat\((\d+),\s*1fr\)/, "repeat($1, minmax(0, 1fr))");
  }

  // Background
  if (settings.background_background === "classic") {
    const bgColor = resolveColorToken(settings, "background_color");
    if (bgColor) style["background-color"] = bgColor;
    const bgImg = settings.background_image as { url?: string } | undefined;
    if (bgImg?.url) {
      style["background-image"] = `url("${rewriteMediaUrl(bgImg.url)}")`;
      style["background-size"] = (settings.background_size as string) ?? "cover";
      style["background-position"] = (settings.background_position as string) ?? "center center";
    }
  }

  // Border radius
  const radius = settings.border_radius as Dim | undefined;
  if (radius?.top) {
    const u = radius.unit ?? "px";
    style["border-radius"] = `${radius.top}${u} ${radius.right ?? radius.top}${u} ${radius.bottom ?? radius.top}${u} ${radius.left ?? radius.top}${u}`;
  }

  // Border
  if (settings.border_border === "solid" && settings.border_width) {
    const bw = settings.border_width as Dim;
    const u = bw.unit ?? "px";
    style["border-style"] = "solid";
    style["border-width"] = `${bw.top ?? 0}${u}`;
    const borderColor = resolveColorToken(settings, "border_color");
    if (borderColor) style["border-color"] = borderColor;
  }

  // Typography (standard Elementor widgets)
  applyTypography(settings, style, ["typography"]);

  const align = settings.align as string | undefined;
  if (align) style["text-align"] = align;

  const textColor =
    resolveColorToken(settings, "title_color") ??
    resolveColorToken(settings, "text_color") ??
    resolveColorToken(settings, "color");
  if (textColor) style.color = textColor;

  const overflow = settings.overflow as string | undefined;
  if (overflow && overflow !== "default") style.overflow = overflow;

  return style;
}

export function blockShell(
  node: ElementorNode,
  tagName: string,
  style: Record<string, string>,
  children: import("./types").GrapeBlock[] = [],
): import("./types").GrapeBlock {
  const hideClasses = elementorHideClasses(node.settings ?? {});
  return {
    tagName,
    attributes: {
      "data-el-id": node.id,
      "data-el-type": node.elType,
      ...(node.widgetType ? { "data-widget": node.widgetType } : {}),
    },
    classes: hideClasses.length ? hideClasses : undefined,
    style,
    components: children,
    customData: { elementorId: node.id },
  };
}
