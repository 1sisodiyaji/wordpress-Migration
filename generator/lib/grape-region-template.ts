/**
 * Generates src/components/grape/GrapeRegion.tsx — full-page GrapeJS editor shell
 * with responsive device toolbar, layers, styles, and traits panels.
 */

export function buildGrapeRegionTsx(): string {
  return `import { useCallback, useEffect, useRef, useState } from "react";
import grapesjs from "grapesjs";
import type { Editor } from "grapesjs";
import {
  Code2,
  ExternalLink,
  Eye,
  Laptop,
  Monitor,
  Redo2,
  Smartphone,
  Tablet,
  Undo2,
  X,
} from "lucide-react";
import siteData from "../../data/site.json";
import { getHeaderHtml, getHeaderBlocks } from "../layout/SiteHeader";
import { getFooterHtml, getFooterBlocks } from "../layout/SiteFooter";

interface Props {
  pageKey: string;
  initialHtml: string;
}

/** Elementor-aligned breakpoints (max-width media queries). */
const DEVICES = [
  { id: "desktop", name: "Desktop", short: "Desk", width: "", widthMedia: "", Icon: Monitor },
  { id: "laptop", name: "Laptop", short: "Lap", width: "1366px", widthMedia: "1366px", Icon: Laptop },
  { id: "tablet", name: "Tablet", short: "Tab", width: "768px", widthMedia: "1024px", Icon: Tablet },
  { id: "mobilePortrait", name: "Mobile", short: "Phone", width: "375px", widthMedia: "767px", Icon: Smartphone },
] as const;

type DeviceId = (typeof DEVICES)[number]["id"];

function grapeStorageKey(pageKey: string): string {
  const fp = siteData.exportFingerprint ?? siteData.slug;
  const page = siteData.pages.find((p) => p.key === pageKey);
  const mode = page?.contentMode ?? "html";
  return \`grape-\${fp}-\${mode}-layout-v22-\${pageKey}\`;
}

function hasStoredProject(pageKey: string): boolean {
  try {
    const key = grapeStorageKey(pageKey);
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.includes(key)) return true;
    }
  } catch {
    /* private browsing */
  }
  return false;
}

function canvasDocument(editor: Editor): Document | null {
  return editor.Canvas.getFrameEl()?.contentDocument ?? null;
}

function revealElementorWidgets(editor: Editor): void {
  const doc = canvasDocument(editor);
  doc?.querySelectorAll(".elementor-invisible").forEach((el) => {
    el.classList.remove("elementor-invisible");
  });
}

function forceEagerImages(editor: Editor): void {
  const doc = canvasDocument(editor);
  if (!doc) return;
  doc.querySelectorAll("img").forEach((img) => {
    img.setAttribute("loading", "eager");
    img.removeAttribute("decoding");
    const dataSrc = img.getAttribute("data-src") || img.getAttribute("data-lazy-src");
    if (dataSrc && (!img.getAttribute("src") || img.getAttribute("src")?.startsWith("data:"))) {
      img.setAttribute("src", dataSrc);
    }
  });
}

function applyElementorKitClasses(editor: Editor): void {
  const doc = canvasDocument(editor);
  const body = doc?.body;
  if (!body) return;
  body.classList.add("elementor");
  const kits =
    (siteData as { elementorKitClasses?: string[] }).elementorKitClasses ?? [];
  for (const cls of kits) {
    if (cls) body.classList.add(cls);
  }
}

function scrollCanvasToHash(editor: Editor, hash: string): void {
  const id = hash.replace(/^#/, "");
  if (!id) return;
  const doc = canvasDocument(editor);
  const target = doc?.getElementById(id);
  target?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function registerLayoutComponents(editor: Editor): void {
  editor.DomComponents.addType("site-header", {
    model: {
      defaults: {
        tagName: "header",
        name: "Site Header",
        attributes: { class: "site-header", "data-layout": "header" },
        droppable: false,
        removable: false,
        copyable: false,
        draggable: false,
        highlightable: true,
        stylable: false,
      },
    },
  });

  editor.DomComponents.addType("site-footer", {
    model: {
      defaults: {
        tagName: "footer",
        name: "Site Footer",
        attributes: { class: "site-footer", "data-layout": "footer" },
        droppable: false,
        removable: false,
        copyable: false,
        draggable: false,
        highlightable: true,
        stylable: false,
      },
    },
  });

  editor.DomComponents.addType("page-body", {
    model: {
      defaults: {
        tagName: "main",
        name: "Page Content",
        attributes: { class: "page-body", "data-layout": "body" },
        droppable: true,
        removable: false,
        copyable: false,
        draggable: false,
      },
    },
  });
}

function blockIcon(paths: string): string {
  // Outline-only icons — filled glyphs disappear on the dark Elements panel.
  return \`<svg class="grape-block-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">\${paths}</svg>\`;
}

function registerBasicBlocks(editor: Editor): void {
  const basic = "Basic";
  const layout = "Layout";
  const mediaCat = "Media";

  const add = (
    id: string,
    label: string,
    category: string,
    content: string,
    icon: string,
  ) => {
    editor.BlockManager.add(id, {
      label,
      category,
      content,
      media: icon,
      select: true,
    });
  };

  add(
    "section",
    "Section",
    basic,
    '<section style="padding:40px 20px;min-height:80px;"><div style="max-width:1200px;margin:0 auto;min-height:40px;"></div></section>',
    blockIcon('<rect x="3" y="4" width="18" height="16" rx="2"/><path d="M3 9h18"/>'),
  );
  add(
    "div-block",
    "Div",
    basic,
    '<div style="padding:10px;min-height:40px;"></div>',
    blockIcon('<rect x="4" y="4" width="16" height="16" rx="2"/>'),
  );
  add(
    "text",
    "Text",
    basic,
    '<div data-gjs-type="text">Insert your text here</div>',
    blockIcon('<path d="M4 7V5h16v2"/><path d="M12 5v14"/><path d="M8 19h8"/>'),
  );
  add(
    "link",
    "Link",
    basic,
    '<a href="#" style="color:#0d9488;">Link text</a>',
    blockIcon('<path d="M10 13a5 5 0 0 0 7.54.54l1.92-1.92a5 5 0 0 0-7.07-7.07L10.5 6.5"/><path d="M14 11a5 5 0 0 0-7.54-.54L4.54 12.4a5 5 0 0 0 7.07 7.07L13.5 17.5"/>'),
  );
  add(
    "heading",
    "Heading",
    basic,
    "<h2>Heading</h2>",
    blockIcon('<path d="M6 4v16"/><path d="M18 4v16"/><path d="M6 12h12"/>'),
  );
  add(
    "paragraph",
    "Paragraph",
    basic,
    "<p>Lorem ipsum dolor sit amet.</p>",
    blockIcon('<path d="M4 6h16"/><path d="M4 10h16"/><path d="M4 14h12"/><path d="M4 18h10"/>'),
  );
  add(
    "button",
    "Button",
    basic,
    '<a href="#" style="display:inline-block;padding:12px 24px;background:#0d9488;color:#fff;text-decoration:none;border-radius:8px;font-weight:600;">Button</a>',
    blockIcon('<rect x="3" y="8" width="18" height="8" rx="4"/>'),
  );
  add(
    "list",
    "List",
    basic,
    "<ul><li>Item one</li><li>Item two</li><li>Item three</li></ul>",
    blockIcon('<path d="M8 6h13"/><path d="M8 12h13"/><path d="M8 18h13"/><path d="M3 6h.01"/><path d="M3 12h.01"/><path d="M3 18h.01"/>'),
  );
  add(
    "quote",
    "Quote",
    basic,
    '<blockquote style="border-left:4px solid #0d9488;padding-left:16px;margin:0;">Quote text</blockquote>',
    blockIcon('<path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21"/><path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3"/>'),
  );

  add(
    "2-columns",
    "2 Columns",
    layout,
    '<div style="display:flex;gap:20px;padding:10px;min-height:60px;"><div style="flex:1;min-height:40px;padding:10px;border:1px dashed #94a3b8;"></div><div style="flex:1;min-height:40px;padding:10px;border:1px dashed #94a3b8;"></div></div>',
    blockIcon('<rect x="3" y="4" width="8" height="16" rx="1"/><rect x="13" y="4" width="8" height="16" rx="1"/>'),
  );
  add(
    "3-columns",
    "3 Columns",
    layout,
    '<div style="display:flex;gap:16px;padding:10px;min-height:60px;"><div style="flex:1;min-height:40px;padding:10px;border:1px dashed #94a3b8;"></div><div style="flex:1;min-height:40px;padding:10px;border:1px dashed #94a3b8;"></div><div style="flex:1;min-height:40px;padding:10px;border:1px dashed #94a3b8;"></div></div>',
    blockIcon('<rect x="2" y="4" width="5" height="16" rx="1"/><rect x="9.5" y="4" width="5" height="16" rx="1"/><rect x="17" y="4" width="5" height="16" rx="1"/>'),
  );
  add(
    "container",
    "Container",
    layout,
    '<div style="max-width:1200px;margin:0 auto;padding:0 20px;min-height:40px;"></div>',
    blockIcon('<rect x="2" y="6" width="20" height="12" rx="2"/><path d="M6 10h12"/><path d="M6 14h8"/>'),
  );
  add(
    "spacer",
    "Spacer",
    layout,
    '<div style="height:40px;"></div>',
    blockIcon('<path d="M12 4v16"/><path d="M8 8l4-4 4 4"/><path d="M8 16l4 4 4-4"/>'),
  );
  add(
    "divider",
    "Divider",
    layout,
    '<hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />',
    blockIcon('<path d="M4 12h16"/>'),
  );

  add(
    "image",
    "Image",
    mediaCat,
    '<img src="https://placehold.co/400x250/e2e8f0/64748b?text=Image" alt="Image" style="max-width:100%;height:auto;display:block;" />',
    blockIcon('<rect x="3" y="5" width="18" height="14" rx="2"/><circle cx="8.5" cy="10" r="1.5"/><path d="M21 15l-5-5L5 21"/>'),
  );
  add(
    "video",
    "Video",
    mediaCat,
    '<div style="position:relative;padding-bottom:56.25%;height:0;overflow:hidden;background:#0f172a;border-radius:8px;"><iframe src="https://www.youtube.com/embed/dQw4w9WgXcQ" title="Video" style="position:absolute;top:0;left:0;width:100%;height:100%;border:0;" allowfullscreen></iframe></div>',
    blockIcon('<rect x="2" y="6" width="14" height="12" rx="2"/><path d="M16 10l6-3v10l-6-3z"/>'),
  );
  add(
    "icon",
    "Icon",
    mediaCat,
    '<span style="font-size:32px;line-height:1;color:#0d9488;">☆</span>',
    blockIcon('<polygon points="12 3 14.5 9.5 21.5 10 16.2 14.5 18 21 12 17.5 6 21 7.8 14.5 2.5 10 9.5 9.5 12 3"/>'),
  );
}

function stripDefaultPanels(editor: Editor): void {
  for (const id of ["views", "views-container", "options"]) {
    const panel = editor.Panels.getPanel(id);
    if (panel) editor.Panels.removePanel(id);
  }
  editor.Panels.getPanels().forEach((panel) => {
    const id = panel.get("id") ?? "";
    if (/views/i.test(String(id))) editor.Panels.removePanel(id);
  });
  editor.getContainer()?.querySelectorAll(".gjs-pn-views-container, .gjs-pn-views").forEach((el) => {
    el.remove();
  });
}

function registerSidebarCommands(editor: Editor): void {
  const shell = (ed: Editor) => ed.getContainer().closest(".grape-editor-shell") as HTMLElement | null;

  const tabForPanel = {
    blocks: "tab-blocks",
    layers: "tab-layers",
    styles: "tab-styles",
    traits: "tab-traits",
  } as const;

  const showPanel = (panel: "blocks" | "layers" | "styles" | "traits") => {
    const root = shell(editor);
    if (!root) return;
    root.querySelectorAll(".grape-sidebar-panel").forEach((el) => {
      el.classList.toggle("is-active", el.getAttribute("data-panel") === panel);
    });
    const activeTab = tabForPanel[panel];
    root.querySelectorAll(".grape-sidebar-tabs .gjs-pn-btn").forEach((btn) => {
      btn.classList.toggle("gjs-pn-active", btn.id === activeTab);
    });
  };

  editor.Commands.add("show-blocks", { run: () => showPanel("blocks") });
  editor.Commands.add("show-layers", { run: () => showPanel("layers") });
  editor.Commands.add("show-styles", { run: () => showPanel("styles") });
  editor.Commands.add("show-traits", { run: () => showPanel("traits") });

  stripDefaultPanels(editor);
}

function updateDeviceBadge(editor: Editor, badge: HTMLElement | null): void {
  if (!badge) return;
  const device = editor.getDevice();
  const meta = DEVICES.find((d) => d.id === device || d.name === device);
  const width = meta?.width ? meta.width : "fluid";
  badge.textContent = meta ? \`\${meta.name} · \${width === "fluid" ? "full" : width}\` : String(device);
  badge.setAttribute("title", \`Viewport: \${meta?.name ?? device} (\${width})\`);
}

function applyDeviceFrame(editor: Editor): void {
  const device = editor.getDevice();
  const meta = DEVICES.find((d) => d.id === device || d.name === device);
  const width = meta?.width?.trim() || "";
  const frameWrap = editor
    .getContainer()
    ?.querySelector(".gjs-frame-wrapper") as HTMLElement | null;
  if (frameWrap) {
    frameWrap.style.width = width || "100%";
    frameWrap.style.maxWidth = width || "100%";
    frameWrap.style.marginLeft = "auto";
    frameWrap.style.marginRight = "auto";
    frameWrap.style.transition = "width 0.2s ease, max-width 0.2s ease";
  }
  // GrapesJS applies device width to the canvas iframe; force a layout pass.
  try {
    editor.refresh();
  } catch {
    /* editor not fully ready */
  }
}

function registerDeviceCommands(editor: Editor): void {
  for (const d of DEVICES) {
    const cmd = \`set-device-\${d.id}\`;
    if (!editor.Commands.get(cmd)) {
      editor.Commands.add(cmd, {
        run: (ed: Editor) => {
          ed.setDevice(d.id);
        },
      });
    }
    // Also alias by display name (some Grapes builds expect this).
    const byName = \`set-device-\${d.name}\`;
    if (!editor.Commands.get(byName)) {
      editor.Commands.add(byName, {
        run: (ed: Editor) => {
          ed.setDevice(d.id);
        },
      });
    }
  }
}

function isBlankCanvasHtml(html: string | undefined | null): boolean {
  if (!html?.trim()) return true;
  const stripped = html
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<(html|head|body|meta|title)[^>]*>/gi, "")
    .replace(new RegExp("<\\\\/(html|head|body|title)>", "gi"), "")
    .replace(/<!--[\\s\\S]*?-->/g, "")
    .replace(/\\s+/g, "")
    .trim();
  return stripped.length < 8;
}

function usableBodyHtml(html: string | undefined | null): string {
  if (isBlankCanvasHtml(html)) return "";
  return html!.trim();
}

function buildPageHtml(bodyHtml: string): string {
  const headerHtml = getHeaderHtml();
  const footerHtml = getFooterHtml();
  const parts: string[] = [];
  if (headerHtml) {
    parts.push(\`<header class="site-header" data-layout="header">\${headerHtml}</header>\`);
  }
  parts.push(\`<main class="page-body" data-layout="body">\${bodyHtml}</main>\`);
  if (footerHtml) {
    parts.push(\`<footer class="site-footer" data-layout="footer">\${footerHtml}</footer>\`);
  }
  return parts.join("\\n");
}

function buildPageComponents(
  useBlocks: boolean,
  grapeBlocks: unknown[] | null,
  bodyHtml: string,
): unknown {
  const headerBlocks = getHeaderBlocks();
  const footerBlocks = getFooterBlocks();
  const headerHtml = getHeaderHtml();
  const footerHtml = getFooterHtml();

  if (!useBlocks && !headerBlocks && !footerBlocks) return buildPageHtml(bodyHtml);

  const tree: unknown[] = [];
  if (headerBlocks) {
    tree.push({ type: "site-header", components: headerBlocks });
  } else if (headerHtml) {
    tree.push({ type: "site-header", components: headerHtml });
  }

  if (useBlocks) {
    tree.push({ type: "page-body", components: grapeBlocks ?? bodyHtml });
  } else {
    tree.push({ type: "page-body", components: bodyHtml });
  }

  if (footerBlocks) {
    tree.push({ type: "site-footer", components: footerBlocks });
  } else if (footerHtml) {
    tree.push({ type: "site-footer", components: footerHtml });
  }
  return tree;
}

const STYLE_SECTORS = [
  {
    name: "Layout",
    open: true,
    buildProps: [
      "display",
      "flex-direction",
      "flex-wrap",
      "justify-content",
      "align-items",
      "gap",
      "position",
      "top",
      "right",
      "bottom",
      "left",
      "z-index",
    ],
  },
  {
    name: "Size & spacing",
    open: true,
    buildProps: [
      "width",
      "min-width",
      "max-width",
      "height",
      "min-height",
      "max-height",
      "margin",
      "padding",
    ],
  },
  {
    name: "Typography",
    open: false,
    buildProps: [
      "font-family",
      "font-size",
      "font-weight",
      "letter-spacing",
      "color",
      "line-height",
      "text-align",
      "text-decoration",
      "text-shadow",
    ],
  },
  {
    name: "Background",
    open: false,
    buildProps: ["background-color", "background-image", "background-repeat", "background-position", "background-size"],
  },
  {
    name: "Border",
    open: false,
    buildProps: ["border-radius", "border", "box-shadow", "opacity"],
  },
];

export function GrapeRegion({ pageKey, initialHtml }: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const [deviceId, setDeviceId] = useState<DeviceId>("desktop");
  const [outlinesOn, setOutlinesOn] = useState(true);
  const [isPreview, setIsPreview] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [codeText, setCodeText] = useState("");
  const pageMeta = siteData.pages.find((p) => p.key === pageKey);
  const contentMode = pageMeta?.contentMode ?? "html";
  const blocksKey = JSON.stringify(pageMeta?.grapeBlocks ?? null);
  const stylesKey = JSON.stringify(pageMeta?.canvasStyles ?? siteData.canvasStyles ?? []);
  const scriptsKey = JSON.stringify(pageMeta?.canvasScripts ?? siteData.canvasScripts ?? []);

  const deviceMeta = DEVICES.find((d) => d.id === deviceId) ?? DEVICES[0];
  const deviceLabel = deviceMeta.width
    ? \`\${deviceMeta.name} · \${deviceMeta.width}\`
    : \`\${deviceMeta.name} · full\`;

  useEffect(() => {
    const onHashChange = () => {
      const editor = editorRef.current;
      if (editor) scrollCanvasToHash(editor, window.location.hash);
    };
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [pageKey]);

  useEffect(() => {
    const shell = shellRef.current;
    const host = hostRef.current;
    if (!shell || !host) return;

    const canvasStyles = JSON.parse(stylesKey) as string[];
    const canvasScripts = JSON.parse(scriptsKey) as string[];
    const grapeBlocks = JSON.parse(blocksKey) as unknown[] | null;
    const bodyHtml = usableBodyHtml(initialHtml);
    const hasBlocks = Array.isArray(grapeBlocks) && grapeBlocks.length > 0;
    const useBlocks =
      hasBlocks && (contentMode === "blocks" || !bodyHtml);
    const initialContent = buildPageComponents(
      useBlocks,
      grapeBlocks,
      bodyHtml || '<div class="empty-page">Empty page</div>',
    );
    const autoload = hasStoredProject(pageKey);
    let ready = false;

    const grapeDevices = DEVICES.map(({ id, name, width, widthMedia }) => ({
      id,
      name,
      width,
      widthMedia,
    }));

    const editor = grapesjs.init({
      container: host,
      height: "100%",
      width: "auto",
      fromElement: false,
      showOffsets: true,
      noticeOnUnload: false,
      storageManager: {
        type: "local",
        autosave: true,
        autoload,
        options: { local: { key: grapeStorageKey(pageKey) } },
      },
      deviceManager: { devices: grapeDevices },
      blockManager: { appendTo: ".grape-blocks-panel", blocks: [] },
      selectorManager: { appendTo: ".grape-styles-panel" },
      styleManager: {
        appendTo: ".grape-styles-panel",
        sectors: STYLE_SECTORS,
      },
      layerManager: { appendTo: ".grape-layers-panel" },
      traitManager: { appendTo: ".grape-traits-panel" },
      panels: {
        defaults: [
          {
            id: "panel-sidebar-tabs",
            el: ".grape-sidebar-tabs",
            buttons: [
              {
                id: "tab-blocks",
                className: "grape-sidebar-tab",
                label: '<span class="grape-tab-label"><span class="grape-tab-ico">＋</span>Elements</span>',
                command: "show-blocks",
                active: true,
                togglable: false,
              },
              {
                id: "tab-layers",
                className: "grape-sidebar-tab",
                label: '<span class="grape-tab-label"><span class="grape-tab-ico">☰</span>Layers</span>',
                command: "show-layers",
                togglable: false,
              },
              {
                id: "tab-styles",
                className: "grape-sidebar-tab",
                label: '<span class="grape-tab-label"><span class="grape-tab-ico">◈</span>Styles</span>',
                command: "show-styles",
                togglable: false,
              },
              {
                id: "tab-traits",
                className: "grape-sidebar-tab",
                label: '<span class="grape-tab-label"><span class="grape-tab-ico">⚙</span>Props</span>',
                command: "show-traits",
                togglable: false,
              },
            ],
          },
        ],
      },
      canvas: { styles: canvasStyles, scripts: canvasScripts },
    });

    registerLayoutComponents(editor);
    registerBasicBlocks(editor);
    registerSidebarCommands(editor);
    registerDeviceCommands(editor);
    editor.runCommand("show-blocks");
    editor.setDevice("desktop");
    editor.runCommand("sw-visibility");

    editor.on("change:device", () => {
      const next = String(editor.getDevice() || "desktop") as DeviceId;
      if (DEVICES.some((d) => d.id === next)) {
        setDeviceId(next);
      }
      applyDeviceFrame(editor);
    });

    editor.on("run:preview", () => {
      setIsPreview(true);
      setShowCode(false);
      shell.classList.add("is-preview");
    });
    editor.on("stop:preview", () => {
      setIsPreview(false);
      shell.classList.remove("is-preview");
    });

    editor.on("component:selected", (component) => {
      if (shell.classList.contains("is-preview")) return;
      const traits = component?.get?.("traits");
      const traitCount =
        typeof traits?.length === "number"
          ? traits.length
          : typeof traits?.models?.length === "number"
            ? traits.models.length
            : 0;
      editor.runCommand(traitCount > 0 ? "show-traits" : "show-styles");
    });

    const finishLoad = () => {
      if (ready) return;
      ready = true;
      const wrapper = editor.getWrapper();
      if (!wrapper || wrapper.components().length === 0) {
        editor.setComponents(initialContent as Parameters<Editor["setComponents"]>[0]);
      }
      revealElementorWidgets(editor);
      forceEagerImages(editor);
      applyElementorKitClasses(editor);
      scrollCanvasToHash(editor, window.location.hash);
      applyDeviceFrame(editor);
      stripDefaultPanels(editor);
      shell.classList.add("grape-ready");
    };

    editor.on("load", finishLoad);
    if (!autoload) {
      editor.setComponents(initialContent as Parameters<Editor["setComponents"]>[0]);
    }
    const fallbackTimer = window.setTimeout(finishLoad, 2500);

    editorRef.current = editor;
    return () => {
      window.clearTimeout(fallbackTimer);
      editor.destroy();
      editorRef.current = null;
      shell.classList.remove("grape-ready", "is-preview");
      setIsPreview(false);
    };
  }, [pageKey, initialHtml, contentMode, blocksKey, stylesKey, scriptsKey]);

  const selectDevice = useCallback((id: DeviceId) => {
    setDeviceId(id);
    const editor = editorRef.current;
    if (!editor) return;
    editor.setDevice(id);
    applyDeviceFrame(editor);
  }, []);

  const runEditorCommand = useCallback((cmd: string) => {
    editorRef.current?.runCommand(cmd);
  }, []);

  const toggleOutlines = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || isPreview) return;
    if (outlinesOn) {
      editor.stopCommand("sw-visibility");
      setOutlinesOn(false);
    } else {
      editor.runCommand("sw-visibility");
      setOutlinesOn(true);
    }
  }, [outlinesOn, isPreview]);

  const togglePreview = useCallback(() => {
    const editor = editorRef.current;
    const shell = shellRef.current;
    if (!editor || !shell) return;

    const next = !isPreview;
    if (next) {
      setShowCode(false);
      try {
        editor.stopCommand("sw-visibility");
      } catch {
        /* outlines may already be off */
      }
      try {
        editor.runCommand("preview");
      } catch {
        /* custom layout still applies */
      }
      shell.classList.add("is-preview");
      setIsPreview(true);
    } else {
      try {
        editor.stopCommand("preview");
      } catch {
        /* ignore */
      }
      shell.classList.remove("is-preview");
      setIsPreview(false);
      if (outlinesOn) {
        try {
          editor.runCommand("sw-visibility");
        } catch {
          /* ignore */
        }
      }
    }
    window.requestAnimationFrame(() => {
      try {
        editor.refresh();
      } catch {
        /* ignore */
      }
    });
  }, [isPreview, outlinesOn]);

  const openCodeView = useCallback(() => {
    const editor = editorRef.current;
    if (!editor || isPreview) return;
    const html = editor.getHtml() || "";
    const css = editor.getCss() || "";
    setCodeText(css ? \`\${html}\\n\\n/* —— CSS —— */\\n\${css}\` : html);
    setShowCode(true);
  }, [isPreview]);

  return (
    <div className="grape-region">
      <div ref={shellRef} className={\`grape-editor-shell\${isPreview ? " is-preview" : ""}\`}>
        <div className="grape-editor-row">
          <div className="grape-canvas-wrap">
            <header className="grape-toolbar grape-toolbar--float">
              <div className="grape-toolbar-group">
                <div className="grape-toolbar-actions">
                  <button
                    type="button"
                    className="grape-btn-icon"
                    title="Undo"
                    aria-label="Undo"
                    disabled={isPreview}
                    onClick={() => runEditorCommand("core:undo")}
                  >
                    <Undo2 size={15} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className="grape-btn-icon"
                    title="Redo"
                    aria-label="Redo"
                    disabled={isPreview}
                    onClick={() => runEditorCommand("core:redo")}
                  >
                    <Redo2 size={15} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className={\`grape-btn-icon\${outlinesOn && !isPreview ? " is-active" : ""}\`}
                    title="Show outlines"
                    aria-label="Show outlines"
                    aria-pressed={outlinesOn && !isPreview}
                    disabled={isPreview}
                    onClick={toggleOutlines}
                  >
                    <Eye size={15} strokeWidth={2} />
                  </button>
                  <button
                    type="button"
                    className={\`grape-btn-icon\${isPreview ? " is-active" : ""}\`}
                    title={isPreview ? "Exit preview" : "Preview"}
                    aria-label={isPreview ? "Exit preview" : "Preview"}
                    aria-pressed={isPreview}
                    onClick={togglePreview}
                  >
                    <ExternalLink size={15} strokeWidth={2} />
                  </button>
                </div>
              </div>
              <div className="grape-toolbar-divider" aria-hidden="true" />
              <div className="grape-toolbar-group grape-toolbar-group--devices">
                <div className="grape-toolbar-devices" role="toolbar" aria-label="Viewport size">
                  {DEVICES.map((d) => {
                    const Icon = d.Icon;
                    const active = d.id === deviceId;
                    return (
                      <button
                        key={d.id}
                        type="button"
                        className={\`grape-device-btn\${active ? " is-active" : ""}\`}
                        title={\`\${d.name}\${d.width ? \` (\${d.width})\` : " (full width)"}\`}
                        aria-label={d.name}
                        aria-pressed={active}
                        onClick={() => selectDevice(d.id)}
                      >
                        <span className="grape-device-label">
                          <Icon size={15} strokeWidth={active ? 2.25 : 1.75} />
                          <span className="grape-device-text">{d.short}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="grape-toolbar-divider" aria-hidden="true" />
              <div className="grape-toolbar-meta">
                <span className="grape-device-badge" title="Current viewport">
                  {deviceLabel}
                </span>
                <button
                  type="button"
                  className={\`grape-mode-btn\${showCode ? " is-active" : ""}\`}
                  title="View page HTML / CSS in canvas"
                  aria-label="View page source"
                  aria-pressed={showCode}
                  onClick={openCodeView}
                >
                  <Code2 size={12} strokeWidth={2.25} />
                  <span>{contentMode === "blocks" ? "Blocks" : "HTML"}</span>
                </button>
              </div>
            </header>
            <div ref={hostRef} className="grape-host" />
            {showCode ? (
              <div className="grape-code-overlay" role="dialog" aria-label="Page source">
                <div className="grape-code-overlay__bar">
                  <strong>Page source</strong>
                  <span className="grape-code-overlay__hint">Canvas HTML + CSS</span>
                  <button
                    type="button"
                    className="grape-btn-icon grape-code-overlay__close"
                    title="Close"
                    aria-label="Close code view"
                    onClick={() => setShowCode(false)}
                  >
                    <X size={15} strokeWidth={2} />
                  </button>
                </div>
                <pre className="grape-code-overlay__pre">{codeText}</pre>
              </div>
            ) : null}
          </div>

          <aside className="grape-sidebar">
            <div className="grape-sidebar-head">
              <strong>Inspector</strong>
              <span className="grape-sidebar-hint">Build & style</span>
            </div>
            <div className="grape-sidebar-tabs" />
            <div className="grape-sidebar-body">
              <div className="grape-sidebar-panel is-active" data-panel="blocks">
                <div className="grape-blocks-panel" />
              </div>
              <div className="grape-sidebar-panel" data-panel="layers">
                <div className="grape-layers-panel" />
              </div>
              <div className="grape-sidebar-panel" data-panel="styles">
                <div className="grape-styles-panel" />
              </div>
              <div className="grape-sidebar-panel" data-panel="traits">
                <div className="grape-traits-panel" />
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
`;
}

export const GRAPE_EDITOR_CSS = `
/* ── Editor design tokens ─────────────────────────────────────────── */
.grape-editor-shell {
  --ge-bg: #0c1118;
  --ge-surface: #121820;
  --ge-surface-2: #18212b;
  --ge-border: #273241;
  --ge-border-soft: #1e2936;
  --ge-text: #e8eef4;
  --ge-muted: #8b9aab;
  --ge-accent: #14b8a6;
  --ge-accent-dim: rgba(20, 184, 166, 0.16);
  --ge-canvas: #1a2330;
  --ge-danger: #f87171;
  --ge-radius: 10px;
  --ge-font: "Segoe UI", "IBM Plex Sans", system-ui, sans-serif;

  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--ge-bg);
  color: var(--ge-text);
  font-family: var(--ge-font);
}

/* ── Floating pill toolbar ─────────────────────────────────────────── */
.grape-toolbar--float {
  position: absolute;
  top: 14px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 40;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.32rem 0.45rem 0.32rem 0.5rem;
  background: rgba(14, 20, 28, 0.82);
  backdrop-filter: blur(14px) saturate(1.25);
  -webkit-backdrop-filter: blur(14px) saturate(1.25);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  box-shadow:
    0 8px 32px rgba(0, 0, 0, 0.42),
    0 2px 8px rgba(0, 0, 0, 0.25),
    inset 0 1px 0 rgba(255, 255, 255, 0.07);
  flex-shrink: 0;
  width: max-content;
  max-width: min(48rem, calc(100% - 2rem)); /* Tailwind max-w-3xl */
  pointer-events: auto;
  transition: box-shadow 0.2s ease, transform 0.2s ease;
}

.grape-toolbar--float:hover {
  box-shadow:
    0 10px 40px rgba(0, 0, 0, 0.48),
    0 2px 10px rgba(0, 0, 0, 0.28),
    inset 0 1px 0 rgba(255, 255, 255, 0.09);
}

.grape-toolbar-group {
  display: flex;
  align-items: center;
  gap: 0.2rem;
}

.grape-toolbar-divider {
  width: 1px;
  height: 1.35rem;
  background: rgba(255, 255, 255, 0.1);
  flex-shrink: 0;
  margin: 0 0.15rem;
}

.grape-toolbar-actions,
.grape-toolbar-devices {
  display: flex;
  align-items: center;
  gap: 2px;
}

.grape-toolbar-devices {
  padding: 3px;
  border-radius: 999px;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.06);
  gap: 1px;
}

.grape-tb-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 0;
  pointer-events: none;
  color: inherit;
}

.grape-tb-icon svg {
  display: block;
  fill: none !important;
  stroke: currentColor !important;
}

.grape-device-label {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 2px;
  line-height: 1;
  pointer-events: none;
}

.grape-device-text {
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  text-transform: uppercase;
  color: inherit;
  opacity: 0.92;
}

.grape-toolbar-meta {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding-right: 0.15rem;
}

.grape-device-badge {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.02em;
  color: #e2e8f0;
  background: rgba(0, 0, 0, 0.28);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 0.3rem 0.55rem;
  white-space: nowrap;
  max-width: 9.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

.grape-mode-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.28rem;
  font-size: 0.5625rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 0.28rem 0.55rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  color: var(--ge-muted);
  border: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
  cursor: pointer;
  font-family: inherit;
  line-height: 1;
  transition: background 0.12s, color 0.12s, border-color 0.12s, box-shadow 0.12s;
}

.grape-mode-btn:hover {
  color: var(--ge-text);
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.14);
}

.grape-mode-btn.is-active {
  background: var(--ge-accent-dim);
  color: #99f6e4;
  border-color: rgba(20, 184, 166, 0.45);
  box-shadow: 0 0 0 1px rgba(20, 184, 166, 0.2);
}

.grape-code-overlay {
  position: absolute;
  inset: 56px 12px 12px;
  z-index: 50;
  display: flex;
  flex-direction: column;
  border-radius: 10px;
  overflow: hidden;
  background: rgba(8, 12, 18, 0.96);
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: 0 16px 48px rgba(0, 0, 0, 0.55);
}

.grape-code-overlay__bar {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.55rem 0.75rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  flex-shrink: 0;
}

.grape-code-overlay__bar strong {
  font-size: 0.75rem;
  font-weight: 700;
}

.grape-code-overlay__hint {
  font-size: 0.625rem;
  color: var(--ge-muted);
  margin-right: auto;
}

.grape-code-overlay__pre {
  margin: 0;
  padding: 0.85rem 1rem 1.25rem;
  overflow: auto;
  flex: 1;
  min-height: 0;
  font-family: ui-monospace, "Cascadia Code", "SF Mono", Consolas, monospace;
  font-size: 0.72rem;
  line-height: 1.45;
  color: #d7e2ec;
  white-space: pre-wrap;
  word-break: break-word;
}

/* ── Workspace ────────────────────────────────────────────────────── */
.grape-editor-row {
  flex: 1;
  min-height: 0;
  display: flex;
  overflow: hidden;
}

.grape-canvas-wrap {
  flex: 1;
  min-width: 0;
  min-height: 0;
  display: flex;
  flex-direction: column;
  position: relative;
  background: #e8eef4;
}

.grape-host {
  flex: 1;
  min-height: 0;
  height: 100%;
  padding-top: 0;
}

.grape-editor-shell.is-preview .grape-sidebar {
  display: none !important;
  width: 0 !important;
  min-width: 0 !important;
  max-width: 0 !important;
  flex: 0 0 0 !important;
  padding: 0 !important;
  margin: 0 !important;
  border: none !important;
  overflow: hidden !important;
  visibility: hidden !important;
  pointer-events: none !important;
}

.grape-editor-shell.is-preview .grape-editor-row {
  display: flex;
  width: 100%;
}

.grape-editor-shell.is-preview .grape-canvas-wrap {
  flex: 1 1 100% !important;
  width: 100% !important;
  max-width: none !important;
  min-width: 0 !important;
}

.grape-editor-shell.is-preview .grape-host,
.grape-editor-shell.is-preview .gjs-editor,
.grape-editor-shell.is-preview .gjs-cv-canvas,
.grape-editor-shell.is-preview .gjs-cv-canvas__frames {
  width: 100% !important;
  max-width: none !important;
}

.grape-editor-shell.is-preview .grape-toolbar--float {
  opacity: 0.92;
}

.grape-editor-shell .grape-btn-icon:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}

/* ── Right inspector ──────────────────────────────────────────────── */
.grape-sidebar {
  flex: 0 0 300px;
  width: 300px;
  max-width: 40vw;
  display: flex;
  flex-direction: column;
  background: var(--ge-surface);
  border-left: 1px solid var(--ge-border);
  min-height: 0;
}

.grape-sidebar-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.7rem 0.9rem 0.55rem;
  border-bottom: 1px solid var(--ge-border-soft);
  flex-shrink: 0;
}

.grape-sidebar-head strong {
  font-size: 0.8125rem;
  font-weight: 700;
  letter-spacing: 0.01em;
}

.grape-sidebar-hint {
  font-size: 0.6875rem;
  color: var(--ge-muted);
}

.grape-sidebar-tabs {
  display: flex;
  flex-shrink: 0;
  padding: 0.4rem 0.45rem 0;
  background: var(--ge-surface);
  border-bottom: 1px solid var(--ge-border-soft);
}

.grape-sidebar-tabs .gjs-pn-buttons {
  display: flex;
  width: 100%;
  gap: 2px;
}

.grape-sidebar-tabs .gjs-pn-btn {
  flex: 1;
  height: auto !important;
  min-height: 2.35rem;
  line-height: 1.2 !important;
  border-radius: 8px 8px 0 0 !important;
  border: 1px solid transparent !important;
  border-bottom: none !important;
  min-width: 0 !important;
  padding: 0.4rem 0.2rem !important;
  font-size: 0.6875rem !important;
  color: var(--ge-muted) !important;
  background: transparent !important;
}

.grape-sidebar-tabs .gjs-pn-btn:hover {
  color: var(--ge-text) !important;
  background: var(--ge-surface-2) !important;
}

.grape-sidebar-tabs .gjs-pn-btn.gjs-pn-active {
  color: #5eead4 !important;
  background: var(--ge-bg) !important;
  border-color: var(--ge-border-soft) !important;
  box-shadow: inset 0 -2px 0 var(--ge-accent);
}

.grape-tab-label {
  display: inline-flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  line-height: 1.15;
}

.grape-tab-ico {
  font-size: 0.8rem;
  opacity: 0.9;
}

.grape-sidebar-body {
  flex: 1;
  min-height: 0;
  position: relative;
  overflow: hidden;
  background: var(--ge-bg);
}

.grape-sidebar-panel {
  display: none;
  position: absolute;
  inset: 0;
  overflow: auto;
  padding: 0.65rem;
  scrollbar-width: thin;
  scrollbar-color: var(--ge-border) transparent;
}

.grape-sidebar-panel.is-active {
  display: block;
}

.grape-layers-panel,
.grape-styles-panel,
.grape-traits-panel,
.grape-blocks-panel {
  min-height: 100%;
}

/* ── Elements tiles ───────────────────────────────────────────────── */
.grape-blocks-panel .gjs-blocks-c {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  padding: 2px;
}

.grape-blocks-panel .gjs-block {
  width: 100%;
  min-height: 78px;
  margin: 0;
  padding: 12px 8px 10px;
  border-radius: var(--ge-radius);
  border: 1px solid var(--ge-border);
  background: var(--ge-surface-2);
  color: var(--ge-text);
  box-shadow: none;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  cursor: grab;
  transition: border-color 0.15s ease, background 0.15s ease, transform 0.12s ease;
}

.grape-blocks-panel .gjs-block:hover {
  border-color: rgba(20, 184, 166, 0.55);
  background: #1a2734;
  transform: translateY(-1px);
}

.grape-blocks-panel .gjs-block:active {
  cursor: grabbing;
  transform: translateY(0);
}

.grape-blocks-panel .gjs-block__media {
  margin-bottom: 0;
  line-height: 0;
}

.grape-blocks-panel .gjs-block__media svg,
.grape-block-icon {
  color: #99f6e4;
  opacity: 1;
  fill: none !important;
  stroke: currentColor !important;
}

.grape-blocks-panel .gjs-block__media svg *,
.grape-block-icon * {
  fill: none !important;
  stroke: currentColor !important;
  stroke-width: 1.6;
}

.grape-blocks-panel .gjs-block-label {
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  text-align: center;
  color: #c5d0db;
}

.grape-blocks-panel .gjs-block-category .gjs-title {
  background: transparent;
  border: none;
  border-bottom: 1px solid var(--ge-border-soft);
  color: var(--ge-muted);
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 6px 4px 8px;
  margin-bottom: 8px;
}

.grape-blocks-panel .gjs-block-category:not(:first-child) {
  margin-top: 14px;
}

/* ── GrapeJS chrome ───────────────────────────────────────────────── */
.grape-editor-shell.grape-ready .gjs-editor {
  height: 100% !important;
  background: transparent;
}

.grape-editor-shell .gjs-pn-panel {
  position: static;
  box-shadow: none;
  background: transparent;
}

.grape-editor-shell .gjs-pn-buttons {
  display: flex;
  gap: 2px;
}

.grape-editor-shell .gjs-pn-btn {
  min-width: 1.85rem;
  height: 1.85rem;
  line-height: 1.85rem;
  padding: 0 0.45rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ge-muted);
  background: transparent;
  border: 1px solid transparent;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.grape-editor-shell .grape-btn-icon {
  min-width: 1.85rem;
  width: 1.85rem;
  height: 1.85rem;
  padding: 0;
  border-radius: 999px;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ge-muted);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  font-family: inherit;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.grape-editor-shell .grape-btn-icon:hover {
  background: var(--ge-surface-2);
  color: var(--ge-text);
  border-color: var(--ge-border);
}

.grape-editor-shell .grape-btn-icon.is-active {
  background: var(--ge-accent) !important;
  color: #042f2e !important;
  border-color: transparent !important;
}

.grape-editor-shell .grape-device-btn {
  appearance: none;
  border-radius: 10px;
  min-width: 2.75rem;
  width: auto;
  height: 2.4rem;
  padding: 0.22rem 0.42rem;
  border: 1px solid transparent;
  background: transparent;
  color: var(--ge-muted);
  font-family: inherit;
  line-height: 1;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s, box-shadow 0.12s;
}

.grape-editor-shell .grape-device-btn:hover {
  background: rgba(255, 255, 255, 0.06);
  color: var(--ge-text);
}

.grape-editor-shell .grape-device-btn.is-active {
  background: var(--ge-accent) !important;
  color: #042f2e !important;
  box-shadow: 0 0 0 1px rgba(20, 184, 166, 0.4);
}

.grape-editor-shell .grape-device-btn.is-active .grape-device-text {
  color: #042f2e;
  opacity: 1;
}

.grape-editor-shell .gjs-pn-btn:hover {
  background: var(--ge-surface-2);
  color: var(--ge-text);
  border-color: var(--ge-border);
}

.grape-editor-shell .gjs-pn-btn.gjs-pn-active,
.grape-editor-shell .gjs-pn-btn.gjs-four-color-h:hover {
  background: var(--ge-accent) !important;
  color: #042f2e !important;
  border-color: transparent !important;
  font-weight: 700;
}

.grape-editor-shell .gjs-pn-views-container,
.grape-editor-shell .gjs-pn-views,
.grape-host .gjs-pn-views-container,
.grape-host .gjs-pn-views,
.grape-region .gjs-pn-views-container {
  display: none !important;
  width: 0 !important;
  height: 0 !important;
  overflow: hidden !important;
  pointer-events: none !important;
}

.grape-editor-shell .gjs-cv-canvas {
  background: #e8eef4 !important;
  width: 100% !important;
  height: 100% !important;
  top: 0 !important;
}

.grape-editor-shell .gjs-cv-canvas__frames,
.grape-editor-shell .gjs-cv-canvas__frames[data-frames] {
  background: #e8eef4 !important;
  top: 0 !important;
  margin: 0 !important;
  padding: 0 !important;
  transform: none !important;
}

.grape-editor-shell .gjs-frame-wrapper {
  background: #fff;
  margin: 0 auto !important;
  box-shadow: none;
  border-radius: 0;
  width: 100%;
  max-width: 100%;
  min-height: 100%;
  transition: width 0.2s ease, max-width 0.2s ease;
}

.grape-editor-shell .gjs-cv-canvas__frames,
.grape-editor-shell .gjs-frame-wrapper {
  overflow: auto !important;
}

.grape-editor-shell.is-preview .gjs-frame-wrapper {
  margin: 0 auto !important;
  box-shadow: none;
  border-radius: 0;
}

/* Style manager */
.grape-editor-shell .gjs-sm-sector {
  border: 1px solid var(--ge-border-soft);
  border-radius: 8px;
  overflow: hidden;
  margin-bottom: 8px;
  background: var(--ge-surface);
}

.grape-editor-shell .gjs-sm-sector .gjs-sm-title {
  background: var(--ge-surface-2);
  border: none;
  color: var(--ge-text);
  font-weight: 600;
  font-size: 0.75rem;
  letter-spacing: 0.02em;
  padding: 0.55rem 0.65rem;
}

.grape-editor-shell .gjs-sm-properties {
  background: var(--ge-surface);
  padding: 0.45rem 0.5rem 0.65rem;
}

.grape-editor-shell .gjs-sm-label,
.grape-editor-shell .gjs-field,
.grape-editor-shell .gjs-clm-tags,
.grape-editor-shell .gjs-clm-tag {
  color: #c5d0db;
}

.grape-editor-shell .gjs-field {
  background: var(--ge-bg);
  border: 1px solid var(--ge-border);
  border-radius: 6px;
}

.grape-editor-shell .gjs-field input,
.grape-editor-shell .gjs-field select {
  color: var(--ge-text);
  background: transparent;
}

.grape-editor-shell .gjs-clm-tags {
  background: var(--ge-surface);
  border: 1px solid var(--ge-border-soft);
  border-radius: 8px;
  padding: 0.45rem;
  margin-bottom: 0.55rem;
}

/* Layers */
.grape-editor-shell .gjs-layers {
  background: transparent;
}

.grape-editor-shell .gjs-layer {
  background: var(--ge-surface);
  color: var(--ge-text);
  border: 1px solid transparent;
  border-radius: 6px;
  margin-bottom: 2px;
}

.grape-editor-shell .gjs-layer:hover {
  background: var(--ge-surface-2);
  border-color: var(--ge-border-soft);
}

.grape-editor-shell .gjs-layer.gjs-selected {
  background: var(--ge-accent-dim);
  border-color: rgba(20, 184, 166, 0.4);
}

.grape-editor-shell .gjs-layer-title {
  color: inherit;
}

.grape-editor-shell .gjs-trt-trait {
  color: #c5d0db;
  margin-bottom: 0.45rem;
}

.grape-editor-shell .gjs-trt-traits {
  padding: 0.15rem;
}

.grape-editor-shell .gjs-sm-placeholder,
.grape-editor-shell .gjs-clm-placeholder {
  color: var(--ge-muted);
  font-size: 0.8125rem;
  padding: 1.25rem 0.75rem;
  text-align: center;
  line-height: 1.45;
  border: 1px dashed var(--ge-border);
  border-radius: var(--ge-radius);
  background: var(--ge-surface);
}

@media (max-width: 960px) {
  .grape-sidebar {
    flex: 0 0 240px;
    width: 240px;
  }
  .grape-toolbar--float {
    top: 10px;
    max-width: min(48rem, calc(100% - 1rem));
    padding: 0.28rem 0.4rem;
    gap: 0.2rem;
  }
  .grape-mode-btn {
    display: none;
  }
}
`;
