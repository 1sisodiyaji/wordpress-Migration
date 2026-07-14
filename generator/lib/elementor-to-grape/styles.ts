import type { ElementorNode } from "./types";

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
  return url
    // http://localhost/smartco/wp-content/... and http://host/wp-content/...
    .replace(/https?:\/\/[^"'()\s]+?\/wp-content\//gi, "/assets/wp-content/")
    .replace(/^\/?(?:[^/]+\/)*wp-content\//, "/assets/wp-content/");
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
    const bgColor = settings.background_color as string | undefined;
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
    if (settings.border_color) style["border-color"] = String(settings.border_color);
  }

  // Typography (widgets)
  const fontFamily = settings.typography_font_family as string | undefined;
  if (fontFamily) style["font-family"] = `"${fontFamily}", sans-serif`;

  const fontSize = sizeValue(settings.typography_font_size as Size | undefined);
  if (fontSize) style["font-size"] = fontSize;

  const fontWeight = settings.typography_font_weight as string | undefined;
  if (fontWeight) style["font-weight"] = fontWeight;

  const align = settings.align as string | undefined;
  if (align) style["text-align"] = align;

  const textColor = settings.text_color as string | undefined;
  if (textColor) style.color = textColor;

  return style;
}

export function blockShell(
  node: ElementorNode,
  tagName: string,
  style: Record<string, string>,
  children: import("./types").GrapeBlock[] = [],
): import("./types").GrapeBlock {
  return {
    tagName,
    attributes: {
      "data-el-id": node.id,
      "data-el-type": node.elType,
      ...(node.widgetType ? { "data-widget": node.widgetType } : {}),
    },
    style,
    components: children,
    customData: { elementorId: node.id },
  };
}
