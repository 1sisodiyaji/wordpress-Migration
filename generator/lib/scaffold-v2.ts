import fs from "node:fs";
import path from "node:path";
import {
  ensureCriticalCanvasCss,
  extractInlineElementorStyles,
  mirrorRemoteMediaUrls,
  patchElementorCssUrls,
  prepareGrapeHtmlForCanvas,
  rewriteAssetUrls,
  withElementorPreviewStyle,
  writeElementorCanvasFixStyle,
  writeElementorKitVarsStyle,
  writeElementorPreviewStyle,
} from "./grape-prep";
import { pageKeyToComponent } from "./names";
import { writeCanvasInlineScripts, readAssetManifest } from "./asset-manifest";
import { getMigratedDataDir } from "../../lib/wp/config";
import { pageCanvasAssets, readPluginSite, type PluginSite } from "./read-plugin-site";
import { convertElementorDocument, type ElementorNode, type GrapeBlock } from "./elementor-to-grape";
import { assertValidAppTsx, buildAppTsx } from "./app-shell-template";

const GRAPE_BLOCKS_CSS = "/assets/inline/styles/grape-blocks.css";

const PROJECTS_ROOT = path.join(process.cwd(), "projects");

export function getProjectDir(slug: string): string {
  return path.join(PROJECTS_ROOT, slug);
}

/**
 * Generate an organized React + GrapeJS project from a plugin-export site.
 *
 * Layout (header/footer/menus) is rendered as shared React components; each
 * page's content slot is editable in GrapeJS.
 */
export async function generateReactGrapeProjectV2(opts: {
  siteSlug: string;
  port?: number;
}): Promise<string> {
  const site = readPluginSite(opts.siteSlug);
  const projectDir = getProjectDir(opts.siteSlug);
  const port = opts.port ?? 3001;

  cleanProjectDir(projectDir);

  fs.mkdirSync(path.join(projectDir, "src", "components", "layout"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "src", "components", "grape"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "src", "pages"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "src", "data"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "public", "assets"), { recursive: true });

  const projectAssetsDir = path.join(projectDir, "public", "assets");
  copyAssets(site.assetsSourceDir, projectAssetsDir);
  const assetManifest = readAssetManifest(getMigratedDataDir(opts.siteSlug));
  if (assetManifest) {
    writeCanvasInlineScripts(assetManifest, site.assetsSourceDir, projectAssetsDir);
  }

  // Fill gaps when the WP export missed Elementor frontend / widget / theme CSS.
  const tryDataRoots = [
    path.join(process.cwd(), "try-data", "smartco-20260705T182508Z-3-001", "smartco"),
    path.join(process.cwd(), "try-data", "orbit-commercial-bank", "Orbit-Commercial-Bank"),
  ];
  ensureCriticalCanvasCss(projectAssetsDir, [site.assetsSourceDir, ...tryDataRoots]);

  writeElementorPreviewStyle(projectAssetsDir);
  writeElementorCanvasFixStyle(projectAssetsDir);
  writeGrapeBlocksStyle(projectAssetsDir);
  patchElementorCssUrls(projectAssetsDir);

  writeData(projectDir, site, []);
  const elementorKitClasses = writeElementorKitVarsStyle(projectAssetsDir, {
    wordpressUrl: site.wordpressUrl,
  });
  patchSiteKitClasses(projectDir, elementorKitClasses);

  writeLayoutComponents(projectDir);
  writeSiteAssets(projectDir);
  writeGrapeRegion(projectDir);
  writePageModules(projectDir, site);
  writeRootFiles(projectDir, site, port);

  return projectDir;
}

function cleanProjectDir(projectDir: string): void {
  if (!fs.existsSync(projectDir)) {
    fs.mkdirSync(projectDir, { recursive: true });
    return;
  }
  for (const entry of ["src", "public", "index.html", "vite.config.ts", "tsconfig.json", "package.json"]) {
    const full = path.join(projectDir, entry);
    if (fs.existsSync(full)) fs.rmSync(full, { recursive: true, force: true });
  }
}

function copyAssets(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      fs.mkdirSync(to, { recursive: true });
      copyAssets(from, to);
    } else {
      fs.copyFileSync(from, to);
    }
  }
}

function writeGrapeBlocksStyle(projectAssetsDir: string): void {
  const file = path.join(projectAssetsDir, "inline", "styles", "grape-blocks.css");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(
    file,
    `/* Base styles for Elementor → GrapeJS block conversion (Stage 3) */
*, *::before, *::after { box-sizing: border-box; }
body { margin: 0; font-family: "Manrope", system-ui, sans-serif; color: #282C31; line-height: 1.5; }
section, div { min-width: 0; }
img { max-width: 100%; height: auto; }
a { color: inherit; }
h1, h2, h3, h4, h5, h6 { margin: 0 0 0.5em; line-height: 1.2; }
p { margin: 0 0 1em; }
ul { margin: 0; padding: 0; }
.gradient-text { background: linear-gradient(90deg, #FDCC4B, #282C31); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
`,
    "utf8",
  );
}

function loadGrapeBlocksForPage(siteSlug: string, pageKey: string): GrapeBlock[] | undefined {
  const dataDir = getMigratedDataDir(siteSlug);
  const rawPath = path.join(dataDir, "pages", pageKey, "raw.json");
  const metaPath = path.join(dataDir, "pages", pageKey, "meta.json");
  if (!fs.existsSync(rawPath)) return undefined;
  const meta = fs.existsSync(metaPath)
    ? (JSON.parse(fs.readFileSync(metaPath, "utf8")) as { pageBuilder?: string })
    : {};
  if (meta.pageBuilder !== "elementor") return undefined;
  const tree = JSON.parse(fs.readFileSync(rawPath, "utf8")) as ElementorNode[];
  if (!Array.isArray(tree) || tree.length === 0) return undefined;
  return convertElementorDocument(tree);
}

/** Blocks mode still needs Elementor/theme CSS so layout, buttons, and images match the site. */
function blockModeCanvasStyles(fullStyles: string[]): string[] {
  return [GRAPE_BLOCKS_CSS, ...fullStyles.filter((s) => s !== GRAPE_BLOCKS_CSS)];
}

function writeData(projectDir: string, site: PluginSite, elementorKitClasses: string[] = []): void {
  const assetsRoot = path.join(projectDir, "public", "assets");

  const headerExtracted = extractInlineElementorStyles(
    mirrorRemoteMediaUrls(rewriteAssetUrls(site.headerHtml), assetsRoot),
    assetsRoot,
    { name: "layout-header-inline" },
  );
  const footerExtracted = extractInlineElementorStyles(
    mirrorRemoteMediaUrls(rewriteAssetUrls(site.footerHtml), assetsRoot),
    assetsRoot,
    { name: "layout-footer-inline" },
  );
  const layoutStyleHrefs = [...headerExtracted.styleHrefs, ...footerExtracted.styleHrefs];

  const pages = site.pages.map((p) => {
    const canvas = pageCanvasAssets(site, p, assetsRoot);
    // Prefer rendered HTML — Elementor→blocks conversion drops widgets/templates/CSS hooks.
    const contentMode = "html" as const;
    const grapeBlocks = loadGrapeBlocksForPage(site.slug, p.key);
    const mirrored = mirrorRemoteMediaUrls(rewriteAssetUrls(p.contentHtml), assetsRoot);
    const extracted = extractInlineElementorStyles(mirrored, assetsRoot, { postId: p.postId });
    const canvasStyles = withElementorPreviewStyle([
      ...canvas.styles,
      ...layoutStyleHrefs,
      ...extracted.styleHrefs,
    ]);

    return {
      key: p.key,
      route: p.route,
      title: p.title,
      postId: p.postId,
      contentMode,
      grapeBlocks: grapeBlocks ?? undefined,
      contentHtml: prepareGrapeHtmlForCanvas(extracted.html),
      canvasStyles,
      canvasScripts: canvas.scripts,
    };
  });

  const globalScripts = new Set<string>(site.globalScripts);
  for (const p of pages) {
    for (const s of p.canvasScripts) globalScripts.add(s);
  }

  fs.writeFileSync(
    path.join(projectDir, "src", "data", "site.json"),
    JSON.stringify(
      {
        slug: site.slug,
        name: site.name,
        exportFingerprint: site.exportFingerprint,
        elementorKitClasses,
        // Parent document must NOT load Elementor CSS (breaks GrapeJS icons).
        canvasStyles: [],
        canvasScripts: [...globalScripts],
        pages,
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "src", "data", "layout.json"),
    JSON.stringify(
      {
        headerHtml: prepareGrapeHtmlForCanvas(headerExtracted.html),
        footerHtml: prepareGrapeHtmlForCanvas(footerExtracted.html),
        menus: site.menus,
      },
      null,
      2,
    ),
    "utf8",
  );
}

function patchSiteKitClasses(projectDir: string, elementorKitClasses: string[]): void {
  const sitePath = path.join(projectDir, "src", "data", "site.json");
  if (!fs.existsSync(sitePath)) return;
  const site = JSON.parse(fs.readFileSync(sitePath, "utf8")) as { elementorKitClasses?: string[] };
  site.elementorKitClasses = elementorKitClasses;
  fs.writeFileSync(sitePath, JSON.stringify(site, null, 2), "utf8");
}

function writeLayoutComponents(projectDir: string): void {
  const layoutDir = path.join(projectDir, "src", "components", "layout");

  fs.writeFileSync(
    path.join(layoutDir, "SiteNav.tsx"),
    `import layout from "../../data/layout.json";

interface MenuItem {
  id: number;
  title: string;
  url: string;
  parentId?: number;
}

function buildTree(items: MenuItem[]): Array<MenuItem & { children: MenuItem[] }> {
  const byId = new Map<number, MenuItem & { children: MenuItem[] }>();
  items.forEach((it) => byId.set(it.id, { ...it, children: [] }));
  const roots: Array<MenuItem & { children: MenuItem[] }> = [];
  byId.forEach((node) => {
    if (node.parentId && byId.has(node.parentId)) byId.get(node.parentId)!.children.push(node);
    else roots.push(node);
  });
  return roots;
}

/** Structured nav rendered from exported WordPress menus (fallback when no header HTML). */
export function SiteNav() {
  const menu = layout.menus?.[0];
  if (!menu) return null;
  const tree = buildTree(menu.items as MenuItem[]);

  return (
    <nav className="site-nav">
      <ul>
        {tree.map((item) => (
          <li key={item.id}>
            <a
              href={item.url}
              onClick={(e) => {
                if (item.url.startsWith("#")) {
                  e.preventDefault();
                  window.location.hash = item.url;
                }
              }}
            >
              {item.title}
            </a>
            {item.children.length > 0 && (
              <ul>
                {item.children.map((child) => (
                  <li key={child.id}>
                    <a
                      href={child.url}
                      onClick={(e) => {
                        if (child.url.startsWith("#")) {
                          e.preventDefault();
                          window.location.hash = child.url;
                        }
                      }}
                    >
                      {child.title}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </li>
        ))}
      </ul>
    </nav>
  );
}
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(layoutDir, "SiteHeader.tsx"),
    `import layout from "../../data/layout.json";

/** Header HTML source from the WP export. Injected into each page canvas via GrapeRegion (\`site-header\`). */
export function SiteHeader() {
  if (!layout.headerHtml?.trim()) return null;
  return <div className="site-header" dangerouslySetInnerHTML={{ __html: layout.headerHtml }} />;
}

export function getHeaderHtml(): string {
  return layout.headerHtml?.trim() ?? "";
}
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(layoutDir, "SiteFooter.tsx"),
    `import layout from "../../data/layout.json";

/** Footer HTML source from the WP export. Injected into each page canvas via GrapeRegion (\`site-footer\`). */
export function SiteFooter() {
  if (!layout.footerHtml?.trim()) return null;
  return <div className="site-footer" dangerouslySetInnerHTML={{ __html: layout.footerHtml }} />;
}

export function getFooterHtml(): string {
  return layout.footerHtml?.trim() ?? "";
}
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(layoutDir, "SiteLayout.tsx"),
    `import type { ReactNode } from "react";
import { SiteAssets } from "./SiteAssets";

/**
 * Editor shell only. Header/footer are GrapeJS components injected into each
 * page canvas (see GrapeRegion) so styles match the WordPress export.
 */
export function SiteLayout({ children }: { children: ReactNode }) {
  return (
    <div className="site-layout">
      <SiteAssets />
      <main className="site-content">{children}</main>
    </div>
  );
}
`,
    "utf8",
  );
}

function writeSiteAssets(projectDir: string): void {
  fs.writeFileSync(
    path.join(projectDir, "src", "components", "layout", "SiteAssets.tsx"),
    `/** Canvas CSS must load only inside the GrapeJS iframe (canvas.styles). */
export function SiteAssets() {
  return null;
}
`,
    "utf8",
  );
}

function writeGrapeRegion(projectDir: string): void {
  fs.writeFileSync(
    path.join(projectDir, "src", "components", "grape", "GrapeRegion.tsx"),
    `import { useEffect, useRef } from "react";
import grapesjs from "grapesjs";
import type { Editor } from "grapesjs";
import siteData from "../../data/site.json";
import { getHeaderHtml } from "../layout/SiteHeader";
import { getFooterHtml } from "../layout/SiteFooter";

interface Props {
  pageKey: string;
  initialHtml: string;
}

function grapeStorageKey(pageKey: string): string {
  const fp = siteData.exportFingerprint ?? siteData.slug;
  const page = siteData.pages.find((p) => p.key === pageKey);
  const mode = page?.contentMode ?? "html";
  // v6 = eager/mirrored images; inline Elementor CSS extracted; kit on canvas body
  return \`grape-\${fp}-\${mode}-layout-v6-\${pageKey}\`;
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

/** GrapeJS iframes often never fire IntersectionObserver — force eager img loads. */
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

/** WP puts Elementor kit class on <body>; GrapeJS canvas must too for global colors. */
function applyElementorKitClasses(editor: Editor): void {
  const doc = canvasDocument(editor);
  const body = doc?.body;
  if (!body) return;
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

/** Shared layout regions used on every page inside the GrapeJS canvas. */
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

/**
 * HTML mode: one HTML string (header + main + footer) so GrapeJS parses Elementor
 * markup once. Nested component types re-parse and often drop attributes/structure.
 */
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
  if (!useBlocks) return buildPageHtml(bodyHtml);
  const headerHtml = getHeaderHtml();
  const footerHtml = getFooterHtml();
  const tree: unknown[] = [];
  if (headerHtml) tree.push({ type: "site-header", components: headerHtml });
  tree.push({ type: "page-body", components: grapeBlocks ?? bodyHtml });
  if (footerHtml) tree.push({ type: "site-footer", components: footerHtml });
  return tree;
}

/** Full-page GrapeJS editor: shared header/footer + editable page body. */
export function GrapeRegion({ pageKey, initialHtml }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
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
    const host = hostRef.current;
    if (!host) return;

    const canvasStyles = JSON.parse(stylesKey) as string[];
    const canvasScripts = JSON.parse(scriptsKey) as string[];
    const bodyHtml = initialHtml?.trim() || "<div>Empty page</div>";
    const grapeBlocks = JSON.parse(blocksKey) as unknown[] | null;
    const useBlocks =
      contentMode === "blocks" && Array.isArray(grapeBlocks) && grapeBlocks.length > 0;
    const initialContent = buildPageComponents(useBlocks, grapeBlocks, bodyHtml);
    const autoload = hasStoredProject(pageKey);
    let ready = false;

    const editor = grapesjs.init({
      container: host,
      height: "100%",
      width: "auto",
      fromElement: false,
      storageManager: {
        type: "local",
        autosave: true,
        autoload,
        options: { local: { key: grapeStorageKey(pageKey) } },
      },
      canvas: { styles: canvasStyles, scripts: canvasScripts },
    });

    registerLayoutComponents(editor);

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
      host.classList.add("grape-ready");
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
      host.classList.remove("grape-ready");
    };
  }, [pageKey, initialHtml, contentMode, blocksKey, stylesKey, scriptsKey]);

  return (
    <div className="grape-region">
      <div className="grape-mode-badge" title="Header + page body + footer inside canvas">
        {contentMode === "blocks" ? "Blocks" : "HTML"}
      </div>
      <div ref={hostRef} className="grape-host" />
    </div>
  );
}
`,
    "utf8",
  );
}

function writePageModules(projectDir: string, site: PluginSite): void {
  for (const page of site.pages) {
    const componentName = pageKeyToComponent(page.key);
    fs.writeFileSync(
      path.join(projectDir, "src", "pages", `${componentName}.tsx`),
      `import { GrapeRegion } from "../components/grape/GrapeRegion";
import siteData from "../data/site.json";

const page = siteData.pages.find((p) => p.key === ${JSON.stringify(page.key)})!;

export default function ${componentName}() {
  return <GrapeRegion pageKey={page.key} initialHtml={page.contentHtml} />;
}
`,
      "utf8",
    );
  }
}

function writeRootFiles(projectDir: string, site: PluginSite, port: number): void {
  const defaultPage = site.pages[0]?.key ?? "home";

  fs.writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify(
      {
        name: `grape-${site.slug}`,
        private: true,
        type: "module",
        scripts: {
          dev: `vite --port ${port}`,
          build: "tsc -b && vite build",
          preview: `vite preview --port ${port}`,
        },
        dependencies: { grapesjs: "^0.22.8", react: "^19.2.0", "react-dom": "^19.2.0" },
        devDependencies: {
          "@types/react": "^19",
          "@types/react-dom": "^19",
          "@vitejs/plugin-react": "^4.7.0",
          typescript: "^5.9.0",
          vite: "^6.4.0",
        },
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "vite.config.ts"),
    `import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: path.resolve(root, "node_modules/react"),
      "react-dom": path.resolve(root, "node_modules/react-dom"),
    },
  },
  optimizeDeps: { include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"] },
  server: {
    port: ${port},
    allowedHosts: ["monitor.craftfosslabs.com"],
    watch: { ignored: ["**/public/assets/**"] },
  },
});
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          lib: ["ES2022", "DOM", "DOM.Iterable"],
          module: "ESNext",
          skipLibCheck: true,
          moduleResolution: "bundler",
          jsx: "react-jsx",
          strict: true,
          noEmit: true,
          resolveJsonModule: true,
        },
        include: ["src"],
      },
      null,
      2,
    ),
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "index.html"),
    `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${site.slug} — GrapeJS Editor</title>
    <link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg'/>" />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "src", "main.tsx"),
    `import { createRoot } from "react-dom/client";
import "grapesjs/dist/css/grapes.min.css";
import App from "./App";
import "./App.css";

createRoot(document.getElementById("root")!).render(<App />);
`,
    "utf8",
  );

  const imports = site.pages
    .map((p) => `import ${pageKeyToComponent(p.key)} from "./pages/${pageKeyToComponent(p.key)}";`)
    .join("\n");

  const pageElementEntries = site.pages
    .map((p) => `  ${JSON.stringify(p.key)}: <${pageKeyToComponent(p.key)} />,`)
    .join("\n");

  const appTsx = buildAppTsx({
    siteName: site.name,
    imports,
    pageElementEntries,
    defaultPageKey: defaultPage,
  });
  assertValidAppTsx(appTsx);
  fs.writeFileSync(path.join(projectDir, "src", "App.tsx"), appTsx, "utf8");

  fs.writeFileSync(
    path.join(projectDir, "src", "App.css"),
    `* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; }
html, body, #root { height: 100%; }

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  overflow: hidden;
  position: relative;
}

.editor-bar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #ddd;
  background: #111827;
  color: #fff;
  flex-shrink: 0;
  z-index: 40;
}
.editor-bar-page {
  flex: 1;
  min-width: 0;
  font-size: 0.875rem;
  color: #9ca3af;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.app-main { flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.site-layout { display: flex; flex-direction: column; flex: 1; min-height: 0; min-width: 0; }
.site-content { flex: 1; min-height: 0; display: flex; flex-direction: column; }

.grape-region {
  flex: 1;
  min-height: 0;
  height: 100%;
  display: flex;
  flex-direction: column;
  position: relative;
}
.grape-mode-badge {
  position: absolute;
  top: 8px;
  right: 8px;
  z-index: 20;
  font-size: 11px;
  padding: 2px 8px;
  border-radius: 4px;
  background: #2563eb;
  color: #fff;
  pointer-events: none;
}
.grape-host {
  flex: 1;
  min-height: 0;
  height: 100%;
}
.grape-host .gjs-editor { height: 100% !important; }
.grape-host .gjs-cv-canvas,
.grape-host .gjs-cv-canvas__frames,
.grape-host .gjs-frame-wrapper {
  overflow: auto !important;
}

/* Floating Pages button (bottom-right) */
.pages-fab {
  position: fixed;
  right: 20px;
  bottom: 24px;
  z-index: 70;
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.7rem 1rem;
  border: none;
  border-radius: 999px;
  background: #2563eb;
  color: #fff;
  font-size: 0.9375rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(37, 99, 235, 0.45);
}
.pages-fab:hover,
.pages-fab.is-open {
  background: #1d4ed8;
}
.pages-fab-count {
  min-width: 1.5rem;
  padding: 0.1rem 0.4rem;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
  font-size: 0.75rem;
  text-align: center;
}

.pages-overlay {
  position: fixed;
  inset: 0;
  background: rgba(15, 23, 42, 0.45);
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.2s ease;
  z-index: 80;
}
.pages-overlay.is-open {
  opacity: 1;
  pointer-events: auto;
}

.pages-sidebar {
  position: fixed;
  top: 0;
  right: 0;
  height: 100vh;
  width: min(340px, 92vw);
  background: #0f172a;
  color: #e5e7eb;
  box-shadow: -8px 0 32px rgba(0, 0, 0, 0.35);
  transform: translateX(100%);
  transition: transform 0.25s ease;
  z-index: 90;
  display: flex;
  flex-direction: column;
}
.pages-sidebar.is-open {
  transform: translateX(0);
}

.pages-sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.1rem;
  border-bottom: 1px solid #1f2937;
}
.pages-sidebar-head h2 {
  margin: 0;
  font-size: 1rem;
  font-weight: 600;
}
.pages-close {
  border: none;
  background: transparent;
  color: #9ca3af;
  font-size: 1.5rem;
  line-height: 1;
  cursor: pointer;
  padding: 0.15rem 0.4rem;
}
.pages-close:hover { color: #fff; }

.pages-search {
  padding: 0.75rem 1rem 0.25rem;
}
.pages-search input {
  width: 100%;
  padding: 0.55rem 0.75rem;
  border: 1px solid #374151;
  border-radius: 6px;
  background: #111827;
  color: #e5e7eb;
  font-size: 0.875rem;
}
.pages-search input:focus {
  outline: none;
  border-color: #2563eb;
}

.pages-nav {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  padding: 0.75rem;
  overflow: auto;
  flex: 1;
}
.pages-nav button {
  width: 100%;
  text-align: left;
  padding: 0.65rem 0.85rem;
  border: 1px solid transparent;
  border-radius: 6px;
  background: transparent;
  color: #e5e7eb;
  cursor: pointer;
  font-size: 0.9rem;
}
.pages-nav button:hover { background: #1f2937; }
.pages-nav button.active {
  background: #2563eb;
  border-color: #2563eb;
  color: #fff;
}
.pages-empty {
  margin: 1rem;
  color: #9ca3af;
  font-size: 0.875rem;
}
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "src", "vite-env.d.ts"),
    `/// <reference types="vite/client" />
`,
    "utf8",
  );
}
