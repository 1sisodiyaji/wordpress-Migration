import type { ElementorNode, GrapeBlock } from "./types";
import { blockShell, elementorSettingsToStyle, rewriteMediaUrl, sizeValue } from "./styles";

type Dim = { unit?: string; top?: string; right?: string; bottom?: string; left?: string };

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
  return {
    tagName: "div",
    attributes: { "data-el-id": node.id, "data-widget": "icon" },
    style: {
      display: "inline-flex",
      "align-items": "center",
      "justify-content": "center",
      width: "50px",
      height: "50px",
      "border-radius": "50%",
      "background-color": "#FDCC4B",
      color: "#fff",
      "font-size": "24px",
    },
    content: "💬",
  };
}

function widgetBlock(node: ElementorNode): GrapeBlock {
  const s = node.settings ?? {};
  switch (node.widgetType) {
    case "button":
      return buttonBlock(node, s);
    case "heading":
      return headingBlock(node, s);
    case "text-editor":
      return textEditorBlock(node, s);
    case "divider":
      return dividerBlock(node, s);
    case "image":
      return imageBlock(node, s);
    case "icon-list":
      return iconListBlock(node, s);
    case "icon-box":
      return iconBoxBlock(node, s);
    case "form":
      return formBlock(node, s);
    case "icon":
      return iconBlock(node, s);
    default:
      return {
        tagName: "div",
        attributes: {
          "data-el-id": node.id,
          "data-widget": node.widgetType ?? "unknown",
        },
        style: {
          padding: "12px",
          border: "1px dashed #ccc",
          color: "#666",
        },
        content: `[${node.widgetType ?? "widget"}]`,
      };
  }
}

export function convertElementorNode(node: ElementorNode): GrapeBlock {
  if (node.elType === "widget") return widgetBlock(node);

  const s = node.settings ?? {};
  const style = elementorSettingsToStyle(s);
  const children = (node.elements ?? []).map(convertElementorNode);

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
export function convertElementorDocument(tree: ElementorNode[]): GrapeBlock[] {
  return tree.map(convertElementorNode).map(rewriteBlockUrls);
}

function rewriteBlockUrls(block: GrapeBlock): GrapeBlock {
  const next: GrapeBlock = { ...block };
  if (next.attributes?.src) {
    next.attributes = { ...next.attributes, src: rewriteMediaUrl(next.attributes.src) };
  }
  if (next.style) {
    const style = { ...next.style };
    for (const [k, v] of Object.entries(style)) {
      if (typeof v === "string" && v.includes("wp-content")) {
        style[k] = v.replace(/https?:\/\/[^"'()\s]+?\/wp-content\//gi, "/assets/wp-content/");
      }
    }
    next.style = style;
  }
  if (typeof next.components === "string" && next.components.includes("wp-content")) {
    next.components = next.components.replace(
      /https?:\/\/[^"'()\s]+?\/wp-content\//gi,
      "/assets/wp-content/",
    );
  } else if (Array.isArray(next.components)) {
    next.components = next.components.map(rewriteBlockUrls);
  }
  return next;
}
