import type { ElementorNode, GrapeBlock } from "./types";
import {
  applyTypography,
  blockShell,
  elementorSettingsToStyle,
  resolveColorToken,
  rewriteMediaUrl,
  sizeValue,
} from "./styles";
import { elementorHideClasses } from "./responsive-css";

type Dim = { unit?: string; top?: string; right?: string; bottom?: string; left?: string };

export type ConvertOptions = {
  /** Resolve Elementor template widgets by post/template ID. */
  resolveTemplate?: (templateId: string) => ElementorNode[] | null | undefined;
  /** Resolve WP menu items by menu slug (for ekit-nav-menu / nav-menu). */
  resolveMenu?: (menuSlug: string) => Array<{ title: string; url: string; parentId?: number }> | null | undefined;
};

type ConvertCtx = {
  resolveTemplate?: ConvertOptions["resolveTemplate"];
  resolveMenu?: ConvertOptions["resolveMenu"];
  /** Avoid infinite loops when templates nest. */
  visitingTemplates: Set<string>;
};

function withHideClasses(node: ElementorNode, block: GrapeBlock): GrapeBlock {
  const hide = elementorHideClasses(node.settings ?? {});
  if (hide.length === 0) return block;
  const classes = [...new Set([...(block.classes ?? []), ...hide])];
  return { ...block, classes };
}

function dim4(key: string, box: Dim | undefined, style: Record<string, string>): void {
  if (!box || box.top === undefined) return;
  const u = box.unit ?? "px";
  style[`${key}-top`] = `${box.top}${u}`;
  style[`${key}-right`] = `${box.right ?? box.top}${u}`;
  style[`${key}-bottom`] = `${box.bottom ?? box.top}${u}`;
  style[`${key}-left`] = `${box.left ?? box.top}${u}`;
}

function buttonBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const style = elementorSettingsToStyle(s);
  const bg = s.background_color as string | undefined;
  if (bg) style["background-color"] = bg;
  if (s.border_border === "solid") {
    style["border-style"] = "solid";
    const bw = s.border_width as Dim | undefined;
    if (bw?.top) style["border-width"] = `${bw.top}px`;
    if (s.border_color) style["border-color"] = String(s.border_color);
  }
  const radius = s.border_radius as Dim | undefined;
  if (radius?.top) style["border-radius"] = `${radius.top}px`;
  dim4("padding", s.text_padding as Dim | undefined, style);
  style.display = "inline-block";
  style["text-decoration"] = "none";
  style.cursor = "pointer";
  if (s.button_text_color) style.color = String(s.button_text_color);

  const link = s.link as { url?: string } | undefined;
  const href = link?.url || "#";
  const text = String(s.text ?? "Button");

  return {
    tagName: "a",
    attributes: { href, role: "button", "data-el-id": node.id, "data-widget": "button" },
    style,
    content: text,
  };
}

function headingBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const tag = (s.header_size as string) || "h2";
  const style = elementorSettingsToStyle(s);
  dim4("margin", s._margin as Dim | undefined, style);
  const title = String(s.title ?? "");
  return {
    tagName: tag,
    attributes: { "data-el-id": node.id, "data-widget": "heading" },
    style,
    content: title,
  };
}

function textEditorBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const style = elementorSettingsToStyle(s);
  dim4("margin", s._margin as Dim | undefined, style);
  const html = String(s.editor ?? "");
  return {
    tagName: "div",
    attributes: { "data-el-id": node.id, "data-widget": "text-editor" },
    style,
    components: html,
  };
}

function dividerBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const color = (s.color as string) ?? "#ddd";
  return {
    tagName: "hr",
    attributes: { "data-el-id": node.id, "data-widget": "divider" },
    style: {
      border: "none",
      "border-top": `1px solid ${color}`,
      margin: "15px 0",
      width: "100%",
    },
  };
}

function imageBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const img = s.image as { url?: string; alt?: string } | undefined;
  const src = img?.url ? rewriteMediaUrl(img.url) : "";
  const style: Record<string, string> = { ...elementorSettingsToStyle(s) };
  const w = sizeValue(s.width as { unit?: string; size?: number });
  if (w) style.width = w;
  dim4("margin", s._margin as Dim | undefined, style);
  if (s.align) style["text-align"] = String(s.align);

  return {
    tagName: "img",
    attributes: {
      src,
      alt: img?.alt ?? "",
      "data-el-id": node.id,
      "data-widget": "image",
    },
    style,
  };
}

function iconListBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const items = (s.icon_list as Array<{ text?: string }>) ?? [];
  const style = elementorSettingsToStyle(s);
  const listStyle: Record<string, string> = {
    display: "flex",
    "flex-wrap": "wrap",
    "justify-content": "center",
    gap: "20px",
    "list-style": "none",
    padding: "0",
    margin: "0",
    ...style,
  };

  return {
    tagName: "ul",
    attributes: { "data-el-id": node.id, "data-widget": "icon-list" },
    style: listStyle,
    components: items.map((item, i) => ({
      tagName: "li",
      style: { display: "flex", "align-items": "center", gap: "8px" },
      components: [
        { tagName: "span", content: "✓", style: { color: "#FDCC4B" } },
        { tagName: "span", content: item.text ?? "" },
      ],
    })),
  };
}

function iconBoxBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const style = elementorSettingsToStyle(s);
  dim4("margin", s._margin as Dim | undefined, style);
  const primary = (s.primary_color as string) ?? "#FDCC4B";

  return {
    tagName: "div",
    attributes: { "data-el-id": node.id, "data-widget": "icon-box" },
    style: { display: "flex", gap: "20px", "align-items": "flex-start", ...style },
    components: [
      {
        tagName: "span",
        content: "✓",
        style: { color: primary, "font-size": "16px", "flex-shrink": "0" },
      },
      {
        tagName: "div",
        components: [
          {
            tagName: "h3",
            content: String(s.title_text ?? ""),
            style: {
              margin: "0 0 4px",
              "font-family": '"Manrope", sans-serif',
              "font-size": "16px",
            },
          },
          ...(s.description_text
            ? [{ tagName: "p", content: String(s.description_text), style: { margin: "0" } }]
            : []),
        ],
      },
    ],
  };
}

function formBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const fields = (s.form_fields as Array<{ custom_id?: string; field_type?: string; field_label?: string; placeholder?: string }>) ?? [];
  const emailField = fields.find((f) => f.field_type === "email") ?? fields[0];
  const btnText = String(s.button_text ?? s.submit_button_text ?? "Submit");

  return {
    tagName: "form",
    attributes: { "data-el-id": node.id, "data-widget": "form" },
    style: { display: "flex", "flex-direction": "column", gap: "10px" },
    components: [
      {
        tagName: "input",
        attributes: {
          type: "email",
          name: emailField?.custom_id ?? "email",
          placeholder: emailField?.placeholder ?? "Enter your email",
          required: "required",
        },
        style: {
          padding: "10px",
          "border-radius": "10px",
          border: "1px solid #ccc",
        },
      },
      {
        tagName: "button",
        attributes: { type: "submit" },
        content: btnText,
        style: {
          padding: "10px 20px",
          "border-radius": "10px",
          "background-color": "#FDCC4B",
          border: "none",
          cursor: "pointer",
        },
      },
    ],
  };
}

function iconBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const selected = s.selected_icon as { value?: string | { url?: string }; library?: string } | undefined;
  const primary = String(s.primary_color ?? "#5F6368");
  const size = sizeValue(s.size as { unit?: string; size?: number }) ?? "20px";
  const style: Record<string, string> = {
    display: "inline-flex",
    "align-items": "center",
    "justify-content": "center",
    color: primary,
    "font-size": size,
    ...elementorSettingsToStyle(s),
  };

  if (typeof selected?.value === "object" && selected.value?.url) {
    return {
      tagName: "img",
      attributes: {
        src: rewriteMediaUrl(selected.value.url),
        alt: "",
        "data-el-id": node.id,
        "data-widget": "icon",
      },
      style: { width: size, height: size, ...style },
    };
  }

  const faClass = typeof selected?.value === "string" ? selected.value : "fas fa-circle";
  return {
    tagName: "i",
    attributes: {
      class: faClass,
      "data-el-id": node.id,
      "data-widget": "icon",
    },
    style,
  };
}

function htmlWidgetBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const html = String(s.html ?? s.content ?? "");
  return {
    tagName: "div",
    attributes: { "data-el-id": node.id, "data-widget": "html" },
    style: { width: "100%", ...elementorSettingsToStyle(s) },
    components: html,
  };
}

function elementsKitButtonBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const style = elementorSettingsToStyle(s);
  applyTypography(s, style, ["ekit_btn_typography", "typography"]);
  const text = String(s.ekit_btn_text ?? "Button");
  const url = s.ekit_btn_url as { url?: string; is_external?: string } | undefined;
  const href = url?.url || "#";
  const textColor = resolveColorToken(s, "ekit_btn_text_color");
  if (textColor) style.color = textColor;
  const bg = resolveColorToken(s, "ekit_btn_bg_color_color");
  if (bg) style["background-color"] = bg;
  dim4("padding", s.ekit_btn_text_padding as Dim | undefined, style);
  const radius = s.ekit_btn_border_radius as Dim | undefined;
  if (radius?.top) style["border-radius"] = `${radius.top}${radius.unit ?? "px"}`;
  style.display = "inline-flex";
  style["align-items"] = "center";
  style["justify-content"] = "center";
  style.gap = "8px";
  style["text-decoration"] = "none";
  style.cursor = "pointer";
  if (s.ekit_btn_align === "center") style["align-self"] = "center";
  if (s.ekit_btn_align === "right") style["align-self"] = "flex-end";
  if (s.ekit_btn_align === "left") style["align-self"] = "flex-start";

  const icons = s.ekit_btn_icons as { value?: { url?: string } | string } | undefined;
  const iconUrl =
    typeof icons?.value === "object" && icons.value?.url
      ? rewriteMediaUrl(icons.value.url)
      : "";
  const iconSize =
    sizeValue(s.ekit_btn_normal_icon_font_size as { unit?: string; size?: number }) ?? "20px";
  const iconAlign = String(s.ekit_btn_icon_align ?? "right");

  const textNode: GrapeBlock = { tagName: "span", content: text };
  const iconNode: GrapeBlock | null = iconUrl
    ? {
        tagName: "img",
        attributes: { src: iconUrl, alt: "" },
        style: {
          width: "var(--ekit-icon-size)",
          height: "var(--ekit-icon-size)",
          display: "inline-block",
        },
      }
    : null;

  const children: GrapeBlock[] =
    iconNode && iconAlign === "left" ? [iconNode, textNode] : iconNode ? [textNode, iconNode] : [textNode];

  const classes = String(s.ekit_btn_class ?? "")
    .split(/\s+/)
    .filter(Boolean);

  return {
    tagName: "a",
    attributes: {
      href,
      role: "button",
      ...(url?.is_external === "on" ? { target: "_blank", rel: "noopener noreferrer" } : {}),
      "data-el-id": node.id,
      "data-widget": "elementskit-button",
    },
    classes: classes.length ? classes : undefined,
    style: {
      ...style,
      "--ekit-icon-size": iconSize,
    },
    components: children,
  };
}

function elementsKitFunfactBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const number = s.ekit_funfact_number != null ? String(s.ekit_funfact_number) : "";
  const suffix = String(s.ekit_funfact_number_suffix ?? "");
  const superText = String(s.ekit_funfact_super_text ?? "");
  const title = String(s.ekit_funfact_title_text ?? "");
  const titleColor =
    resolveColorToken(s, "ekit_funfact_title_color") ?? String(s.ekit_funfact_title_color ?? "#5F6368");
  const descColor =
    resolveColorToken(s, "ekit_funfact_description_color") ??
    String(s.ekit_funfact_description_color ?? "#202124");
  const icon = s.ekit_funfact_icons as { value?: { url?: string } } | undefined;
  const iconUrl = icon?.value?.url ? rewriteMediaUrl(icon.value.url) : "";
  const iconSize = sizeValue(s.ekit_funfact_icon_size as { unit?: string; size?: number }) ?? "35px";

  const numberStyle: Record<string, string> = {
    "font-size": "36px",
    "font-weight": "600",
    color: descColor,
    "line-height": "1.1",
  };
  applyTypography(s, numberStyle, ["ekit_funfact_number_typography"]);

  const titleStyle: Record<string, string> = {
    "margin-top": "8px",
    color: titleColor,
    "font-size":
      sizeValue(s.ekit_funfact_title_typography_font_size as { unit?: string; size?: number }) ?? "16px",
    "font-weight": String(s.ekit_funfact_title_typography_font_weight ?? "400"),
  };
  applyTypography(s, titleStyle, ["ekit_funfact_title_typography"]);

  const children: GrapeBlock[] = [];
  if (iconUrl) {
    children.push({
      tagName: "img",
      attributes: { src: iconUrl, alt: "" },
      style: {
        width: "var(--ekit-funfact-icon-size)",
        height: "var(--ekit-funfact-icon-size)",
        "margin-bottom": "12px",
      },
    });
  }
  children.push({
    tagName: "div",
    style: numberStyle,
    components: [
      ...(superText ? [{ tagName: "sup", content: superText, style: { "font-size": "0.55em" } }] : []),
      { tagName: "span", content: `${number}${suffix}` },
    ],
  });
  if (title) {
    children.push({
      tagName: "div",
      content: title,
      style: titleStyle,
    });
  }

  return {
    tagName: "div",
    attributes: { "data-el-id": node.id, "data-widget": "elementskit-funfact" },
    style: {
      display: "flex",
      "flex-direction": "column",
      "align-items": "flex-start",
      ...elementorSettingsToStyle(s),
      "--ekit-funfact-icon-size": iconSize,
    },
    components: children,
  };
}

/**
 * Miga slide widgets are config-only; logo rows live in sibling containers.
 * Hide the stub so the real image rows remain visible.
 */
function migaSlideBlock(node: ElementorNode): GrapeBlock {
  return {
    tagName: "div",
    attributes: {
      "data-el-id": node.id,
      "data-widget": "miga_slide_everything_title",
      "aria-hidden": "true",
    },
    style: { display: "none" },
  };
}

function menuNavBlock(
  node: ElementorNode,
  s: Record<string, unknown>,
  ctx: ConvertCtx,
  widgetName: string,
): GrapeBlock {
  const menuSlug = String(
    s.elementskit_nav_menu ?? s.menu ?? s.nav_menu ?? "",
  );
  let items = (menuSlug && ctx.resolveMenu?.(menuSlug)) || null;
  // Main menu is often top-level only; prefer richer phone menu when empty of children.
  if ((!items || items.length === 0) && ctx.resolveMenu) {
    items = ctx.resolveMenu("phone_view_main_menu") ?? ctx.resolveMenu("main-menu") ?? null;
  }
  const top = (items ?? []).filter((it) => !it.parentId || it.parentId === 0);
  const color = String(
    s.elementskit_menu_text_color ?? s.color ?? s.text_color ?? "#1E1E1E",
  );

  return {
    tagName: "nav",
    attributes: {
      "data-el-id": node.id,
      "data-widget": widgetName,
      "aria-label": "Site",
    },
    style: {
      display: "flex",
      "align-items": "center",
      "justify-content": "center",
      gap: "8px",
      "flex-wrap": "wrap",
      ...elementorSettingsToStyle(s),
    },
    components: top.map((item) => ({
      tagName: "a",
      attributes: { href: item.url || "#" },
      content: item.title,
      style: {
        color,
        "text-decoration": "none",
        padding: "8px 16px",
        "font-size": "15px",
        "font-weight": "500",
        "white-space": "nowrap",
      },
    })),
  };
}

function countWidgetTypes(node: ElementorNode, out: Record<string, number> = {}): Record<string, number> {
  if (node.widgetType) out[node.widgetType] = (out[node.widgetType] ?? 0) + 1;
  for (const child of node.elements ?? []) countWidgetTypes(child, out);
  return out;
}

function isLogoRowContainer(node: ElementorNode): boolean {
  const counts = countWidgetTypes(node);
  const images = counts.image ?? 0;
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return images >= 3 && total > 0 && images >= total * 0.6;
}

/** Horizontal auto-scroll for logo rows driven by sibling miga_slide widgets. */
function wrapLogoMarquee(block: GrapeBlock, reverse: boolean): GrapeBlock {
  const rowKids = Array.isArray(block.components) ? block.components : [];
  if (rowKids.length === 0) return block;
  // Duplicate track for seamless CSS loop.
  const track = [...rowKids, ...rowKids];
  return {
    tagName: "div",
    attributes: {
      class: "grape-marquee",
      "data-marquee": reverse ? "reverse" : "forward",
      ...(block.attributes?.["data-el-id"]
        ? { "data-el-id": block.attributes["data-el-id"] }
        : {}),
    },
    style: {
      overflow: "hidden",
      width: "100%",
      "max-width": "100%",
    },
    components: [
      {
        tagName: "div",
        attributes: {
          class: reverse ? "grape-marquee-track is-reverse" : "grape-marquee-track",
        },
        style: {
          display: "flex",
          "flex-direction": "row",
          "align-items": "center",
          gap: block.style?.gap ?? "28px",
          width: "max-content",
          "will-change": "transform",
        },
        components: track,
      },
    ],
  };
}

function applyMigaMarqueeToChildren(
  rawChildren: ElementorNode[],
  converted: GrapeBlock[],
): GrapeBlock[] {
  const hasMiga = rawChildren.some((c) => c.widgetType === "miga_slide_everything_title");
  if (!hasMiga) return converted;

  let logoRowIndex = 0;
  return converted.map((child, i) => {
    const raw = rawChildren[i];
    if (!raw || raw.elType === "widget") return child;
    if (!isLogoRowContainer(raw)) return child;
    const reverse = logoRowIndex % 2 === 1;
    logoRowIndex += 1;
    return wrapLogoMarquee(child, reverse);
  });
}

function templateBlock(node: ElementorNode, s: Record<string, unknown>, ctx: ConvertCtx): GrapeBlock {
  const templateId = String(s.template_id ?? s.templateID ?? "");
  if (!templateId || !ctx.resolveTemplate) {
    return {
      tagName: "div",
      attributes: { "data-el-id": node.id, "data-widget": "template", "data-template-id": templateId },
      style: { width: "100%" },
    };
  }
  if (ctx.visitingTemplates.has(templateId)) {
    return {
      tagName: "div",
      attributes: {
        "data-el-id": node.id,
        "data-widget": "template",
        "data-template-id": templateId,
        "data-template-cycle": "1",
      },
      style: { width: "100%" },
    };
  }

  ctx.visitingTemplates.add(templateId);
  try {
    const tree = ctx.resolveTemplate(templateId);
    const components = Array.isArray(tree) && tree.length > 0 ? tree.map((n) => convertElementorNode(n, ctx)) : [];
    return {
      tagName: "div",
      attributes: { "data-el-id": node.id, "data-widget": "template", "data-template-id": templateId },
      style: { width: "100%", ...elementorSettingsToStyle(s) },
      components,
    };
  } finally {
    ctx.visitingTemplates.delete(templateId);
  }
}

/** Never emit `[widget-type]` placeholders — render real content or an empty shell. */
function fallbackWidgetBlock(node: ElementorNode, s: Record<string, unknown>): GrapeBlock {
  const html = String(s.html ?? s.editor ?? s.content ?? "");
  if (html.trim()) {
    return {
      tagName: "div",
      attributes: { "data-el-id": node.id, "data-widget": node.widgetType ?? "unknown" },
      style: elementorSettingsToStyle(s),
      components: html,
    };
  }
  const text = String(s.title ?? s.text ?? s.ekit_btn_text ?? s.ekit_funfact_title_text ?? "").trim();
  if (text) {
    return {
      tagName: "div",
      attributes: { "data-el-id": node.id, "data-widget": node.widgetType ?? "unknown" },
      style: elementorSettingsToStyle(s),
      content: text,
    };
  }
  return {
    tagName: "div",
    attributes: { "data-el-id": node.id, "data-widget": node.widgetType ?? "unknown" },
    style: { display: "contents" },
  };
}

function widgetBlock(node: ElementorNode, ctx: ConvertCtx): GrapeBlock {
  const s = node.settings ?? {};
  let block: GrapeBlock;
  switch (node.widgetType) {
    case "button":
      block = buttonBlock(node, s);
      break;
    case "heading":
      block = headingBlock(node, s);
      break;
    case "text-editor":
      block = textEditorBlock(node, s);
      break;
    case "divider":
      block = dividerBlock(node, s);
      break;
    case "image":
      block = imageBlock(node, s);
      break;
    case "icon-list":
      block = iconListBlock(node, s);
      break;
    case "icon-box":
      block = iconBoxBlock(node, s);
      break;
    case "form":
      block = formBlock(node, s);
      break;
    case "icon":
      block = iconBlock(node, s);
      break;
    case "html":
      block = htmlWidgetBlock(node, s);
      break;
    case "elementskit-button":
      block = elementsKitButtonBlock(node, s);
      break;
    case "elementskit-funfact":
      block = elementsKitFunfactBlock(node, s);
      break;
    case "template":
    case "elementor-template":
      block = templateBlock(node, s, ctx);
      break;
    case "miga_slide_everything_title":
      block = migaSlideBlock(node);
      break;
    case "ekit-nav-menu":
    case "nav-menu":
      block = menuNavBlock(node, s, ctx, node.widgetType ?? "nav-menu");
      break;
    case "off-canvas":
      block = {
        tagName: "div",
        attributes: { "data-el-id": node.id, "data-widget": "off-canvas", "aria-hidden": "true" },
        style: { display: "none" },
      };
      break;
    default:
      block = fallbackWidgetBlock(node, s);
  }
  return withHideClasses(node, block);
}

export function convertElementorNode(node: ElementorNode, ctx?: ConvertCtx): GrapeBlock {
  const context: ConvertCtx = ctx ?? { visitingTemplates: new Set() };
  if (node.elType === "widget") return widgetBlock(node, context);

  const s = node.settings ?? {};
  const style = elementorSettingsToStyle(s);
  const rawChildren = node.elements ?? [];
  let children = rawChildren.map((child) => convertElementorNode(child, context));
  children = applyMigaMarqueeToChildren(rawChildren, children);

  // Boxed inner wrapper when content_width is boxed
  if (s.content_width === "boxed" && children.length > 0) {
    const innerStyle: Record<string, string> = {
      display: style.display ?? "flex",
      "flex-direction": style["flex-direction"] ?? "column",
      "max-width": sizeValue(s.boxed_width as { unit?: string; size?: number }) ?? "1200px",
      margin: "0 auto",
      width: "100%",
    };
    if (style.gap) innerStyle.gap = style.gap;
    if (style["justify-content"]) innerStyle["justify-content"] = style["justify-content"];
    if (style["align-items"]) innerStyle["align-items"] = style["align-items"];

    return blockShell(node, "section", { ...style }, [
      blockShell({ ...node, id: `${node.id}-inner` }, "div", innerStyle, children),
    ]);
  }

  const tag = node.isInner ? "div" : "section";
  const containerStyle = { ...style };
  if (s.content_width === "boxed") {
    delete containerStyle.display;
    delete containerStyle["flex-direction"];
  }
  return blockShell(node, tag, containerStyle, children);
}

/** Convert an Elementor _elementor_data document into GrapeJS component blocks. */
export function convertElementorDocument(tree: ElementorNode[], opts: ConvertOptions = {}): GrapeBlock[] {
  const ctx: ConvertCtx = {
    resolveTemplate: opts.resolveTemplate,
    resolveMenu: opts.resolveMenu,
    visitingTemplates: new Set(),
  };
  return tree.map((node) => convertElementorNode(node, ctx)).map(rewriteBlockUrls);
}

function rewriteBlockUrls(block: GrapeBlock): GrapeBlock {
  const next: GrapeBlock = { ...block };
  if (next.attributes?.src) {
    next.attributes = { ...next.attributes, src: rewriteMediaUrl(next.attributes.src) };
  }
  if (next.style) {
    const style = { ...next.style };
    for (const [k, v] of Object.entries(style)) {
      if (typeof v !== "string" || !v.includes("wp-content")) continue;
      style[k] = v.replace(/url\(\s*['"]?(https?:\/\/[^"')\s]+|\/?[^"')\s]*wp-content\/[^"')\s]+)['"]?\s*\)/gi, (_full, url: string) => {
        return `url("${rewriteMediaUrl(url)}")`;
      });
      // bare paths in style values (rare)
      if (!style[k].includes("url(") && /wp-content\//i.test(style[k])) {
        style[k] = rewriteMediaUrl(style[k]);
      }
    }
    next.style = style;
  }
  if (typeof next.components === "string" && next.components.includes("wp-content")) {
    next.components = next.components.replace(
      /(https?:\/\/[^"'()\s]+?\/wp-content\/[^"'()\s]+|\/(?:[^/"'\s]+\/)*wp-content\/[^"'()\s]+)/gi,
      (url: string) => rewriteMediaUrl(url),
    );
  } else if (Array.isArray(next.components)) {
    next.components = next.components.map(rewriteBlockUrls);
  }
  return next;
}
