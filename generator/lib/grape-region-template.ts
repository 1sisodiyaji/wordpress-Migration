/**
 * Generates src/components/grape/GrapeRegion.tsx — full-page GrapeJS editor shell
 * with responsive device toolbar, layers, styles, and traits panels.
 */

export function buildGrapeRegionTsx(): string {
  return `import { useEffect, useRef } from "react";
import grapesjs from "grapesjs";
import type { Editor } from "grapesjs";
import siteData from "../../data/site.json";
import { getHeaderHtml, getHeaderBlocks } from "../layout/SiteHeader";
import { getFooterHtml, getFooterBlocks } from "../layout/SiteFooter";

interface Props {
  pageKey: string;
  initialHtml: string;
}

/** Elementor-aligned breakpoints (max-width media queries). */
const DEVICES = [
  { id: "desktop", name: "Desktop", width: "", widthMedia: "" },
  { id: "laptop", name: "Laptop", width: "1366px", widthMedia: "1366px" },
  { id: "tablet", name: "Tablet", width: "768px", widthMedia: "1024px" },
  { id: "mobilePortrait", name: "Mobile", width: "375px", widthMedia: "767px" },
] as const;

function grapeStorageKey(pageKey: string): string {
  const fp = siteData.exportFingerprint ?? siteData.slug;
  const page = siteData.pages.find((p) => p.key === pageKey);
  const mode = page?.contentMode ?? "html";
  return \`grape-\${fp}-\${mode}-layout-v17-\${pageKey}\`;
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
  return \`<svg class="grape-block-icon" viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">\${paths}</svg>\`;
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
    '<span style="font-size:32px;line-height:1;color:#0d9488;">★</span>',
    blockIcon('<path d="M12 3l2.4 4.9 5.4.8-3.9 3.8.9 5.4L12 15.9 7.2 18l.9-5.4L4.2 8.7l5.4-.8L12 3z"/>'),
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
  badge.textContent = meta?.name ?? String(device);
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
  const deviceBadgeRef = useRef<HTMLSpanElement>(null);
  const editorRef = useRef<Editor | null>(null);
  const pageMeta = siteData.pages.find((p) => p.key === pageKey);
  const contentMode = pageMeta?.contentMode ?? "html";
  const blocksKey = JSON.stringify(pageMeta?.grapeBlocks ?? null);
  const stylesKey = JSON.stringify(pageMeta?.canvasStyles ?? siteData.canvasStyles ?? []);
  const scriptsKey = JSON.stringify(pageMeta?.canvasScripts ?? siteData.canvasScripts ?? []);

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
      bodyHtml || "<div class=\\"empty-page\\">Empty page</div>",
    );
    const autoload = hasStoredProject(pageKey);
    let ready = false;

    const deviceButtons = DEVICES.map((d, i) => ({
      id: \`device-\${d.id}\`,
      label: d.name,
      command: \`set-device-\${d.id}\`,
      active: i === 0,
      togglable: false,
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
      deviceManager: { devices: [...DEVICES] },
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
            id: "panel-actions",
            el: ".grape-toolbar-actions",
            buttons: [
              {
                id: "undo",
                className: "grape-btn-icon",
                label: '<span class="grape-tb-ico" title="Undo">↶</span>',
                command: "core:undo",
                attributes: { title: "Undo" },
              },
              {
                id: "redo",
                className: "grape-btn-icon",
                label: '<span class="grape-tb-ico" title="Redo">↷</span>',
                command: "core:redo",
                attributes: { title: "Redo" },
              },
              {
                id: "visibility",
                className: "grape-btn-icon",
                label: '<span class="grape-tb-ico" title="Show outlines">▦</span>',
                command: "sw-visibility",
                active: true,
                attributes: { title: "Show outlines" },
              },
              {
                id: "preview",
                className: "grape-btn-icon",
                label: '<span class="grape-tb-ico" title="Preview">⛶</span>',
                command: "preview",
                attributes: { title: "Preview" },
              },
            ],
          },
          {
            id: "panel-devices",
            el: ".grape-toolbar-devices",
            buttons: deviceButtons,
          },
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
    editor.runCommand("show-blocks");

    editor.on("change:device", () => updateDeviceBadge(editor, deviceBadgeRef.current));

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
      updateDeviceBadge(editor, deviceBadgeRef.current);
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
      shell.classList.remove("grape-ready");
    };
  }, [pageKey, initialHtml, contentMode, blocksKey, stylesKey, scriptsKey]);

  return (
    <div className="grape-region">
      <div ref={shellRef} className="grape-editor-shell">
        <header className="grape-toolbar">
          <div className="grape-toolbar-group">
            <span className="grape-toolbar-label">Edit</span>
            <div className="grape-toolbar-actions" />
          </div>
          <div className="grape-toolbar-group grape-toolbar-group--devices">
            <span className="grape-toolbar-label">Viewport</span>
            <div className="grape-toolbar-devices" />
          </div>
          <div className="grape-toolbar-meta">
            <span ref={deviceBadgeRef} className="grape-device-badge">
              Desktop
            </span>
            <span className="grape-mode-badge" title="Header + page body + footer inside canvas">
              {contentMode === "blocks" ? "Blocks" : "HTML"}
            </span>
          </div>
        </header>

        <div className="grape-editor-row">
          <div className="grape-canvas-wrap">
            <div className="grape-canvas-hint">Drag elements onto the page · click to style</div>
            <div ref={hostRef} className="grape-host" />
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

/* ── Top toolbar ──────────────────────────────────────────────────── */
.grape-toolbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.45rem 0.85rem;
  background: linear-gradient(180deg, #141b24 0%, var(--ge-surface) 100%);
  border-bottom: 1px solid var(--ge-border);
  flex-shrink: 0;
  min-height: 48px;
  z-index: 30;
}

.grape-toolbar-group {
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.grape-toolbar-group--devices {
  padding-left: 0.85rem;
  border-left: 1px solid var(--ge-border-soft);
}

.grape-toolbar-label {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--ge-muted);
  user-select: none;
}

.grape-toolbar-actions,
.grape-toolbar-devices {
  display: flex;
  align-items: center;
  gap: 3px;
}

.grape-toolbar-devices {
  padding: 3px;
  border-radius: 999px;
  background: var(--ge-bg);
  border: 1px solid var(--ge-border-soft);
}

.grape-toolbar-meta {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 0.45rem;
}

.grape-device-badge {
  font-size: 0.75rem;
  font-weight: 600;
  padding: 0.28rem 0.7rem;
  border-radius: 999px;
  background: var(--ge-accent-dim);
  color: #5eead4;
  border: 1px solid rgba(20, 184, 166, 0.35);
}

.grape-mode-badge {
  font-size: 0.625rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  padding: 0.28rem 0.55rem;
  border-radius: 6px;
  background: var(--ge-surface-2);
  color: var(--ge-muted);
  border: 1px solid var(--ge-border);
  flex-shrink: 0;
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
  background:
    radial-gradient(ellipse 80% 50% at 50% 0%, rgba(20, 184, 166, 0.06), transparent 55%),
    linear-gradient(180deg, #151d28 0%, var(--ge-canvas) 40%);
}

.grape-canvas-hint {
  position: absolute;
  top: 10px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 5;
  pointer-events: none;
  font-size: 0.6875rem;
  color: var(--ge-muted);
  background: rgba(12, 17, 24, 0.72);
  border: 1px solid var(--ge-border-soft);
  padding: 0.28rem 0.75rem;
  border-radius: 999px;
  backdrop-filter: blur(6px);
  opacity: 0.85;
  white-space: nowrap;
}

.grape-host {
  flex: 1;
  min-height: 0;
  height: 100%;
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

.grape-block-icon {
  color: #5eead4;
  opacity: 0.92;
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
  min-width: 2.1rem;
  height: 2.1rem;
  line-height: 2.1rem;
  padding: 0 0.55rem;
  border-radius: 8px;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--ge-muted);
  background: transparent;
  border: 1px solid transparent;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}

.grape-editor-shell .grape-toolbar-devices .gjs-pn-btn {
  border-radius: 999px;
  min-width: auto;
  padding: 0 0.7rem;
  font-size: 0.6875rem;
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
  background: transparent;
  width: 100% !important;
  height: 100% !important;
  top: 0 !important;
}

.grape-editor-shell .gjs-frame-wrapper {
  background: #fff;
  margin: 28px auto 18px;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.04),
    0 12px 40px rgba(0, 0, 0, 0.45);
  border-radius: 6px;
}

.grape-editor-shell .gjs-cv-canvas__frames,
.grape-editor-shell .gjs-frame-wrapper {
  overflow: auto !important;
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
  .grape-toolbar-label {
    display: none;
  }
  .grape-canvas-hint {
    display: none;
  }
  .grape-toolbar-devices .gjs-pn-btn {
    padding: 0 0.4rem !important;
    font-size: 0.625rem !important;
  }
}
`;
