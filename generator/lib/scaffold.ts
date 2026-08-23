import fs from "node:fs";
import path from "node:path";
import { collectCanvasStyles, patchElementorCssUrls, prepareGrapeHtml } from "./grape-prep";
import { cleanGeneratedProject } from "./fs-clean";
import { pageKeyToComponent } from "./names";
import type { ScrapedSite } from "./read-scraped";

const PROJECTS_ROOT = path.join(process.cwd(), "projects");

export interface GenerateOptions {
  siteSlug: string;
  port?: number;
}

export function getProjectDir(slug: string): string {
  return path.join(PROJECTS_ROOT, slug);
}

export async function generateReactGrapeProject(opts: GenerateOptions): Promise<string> {
  // Plugin-export sites (wp-grape-export v2) use the organized generator.
  const { isPluginSite } = await import("./read-plugin-site");
  if (isPluginSite(opts.siteSlug)) {
    const { generateReactGrapeProjectV2 } = await import("./scaffold-v2");
    return generateReactGrapeProjectV2(opts);
  }

  const { readScrapedSite } = await import("./read-scraped");
  const site = readScrapedSite(opts.siteSlug);
  const projectDir = getProjectDir(opts.siteSlug);
  const port = opts.port ?? 3001;

  cleanGeneratedProject(projectDir);

  fs.mkdirSync(path.join(projectDir, "src", "components"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "src", "pages"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "src", "data"), { recursive: true });
  fs.mkdirSync(path.join(projectDir, "public", "assets"), { recursive: true });

  copyAssets(site.assetsSourceDir, path.join(projectDir, "public", "assets"));
  patchElementorCssUrls(path.join(projectDir, "public", "assets"));
  writeSiteData(projectDir, site);
  writePageModules(projectDir, site);
  writeRootFiles(projectDir, site, port);

  return projectDir;
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

function writeSiteData(projectDir: string, site: ScrapedSite): void {
  const assetsRoot = path.join(projectDir, "public", "assets");
  const styleSet = new Set<string>();
  for (const page of site.pages) {
    for (const href of collectCanvasStyles(assetsRoot, page.postId)) {
      styleSet.add(href);
    }
  }
  const data = {
    slug: site.slug,
    canvasStyles: [...styleSet],
    pages: site.pages.map((p) => ({
      key: p.key,
      route: p.route,
      title: p.title,
      postId: p.postId,
      initialHtml: prepareGrapeHtml(p.html),
      canvasStyles: collectCanvasStyles(assetsRoot, p.postId),
    })),
  };
  fs.writeFileSync(
    path.join(projectDir, "src", "data", "site.json"),
    JSON.stringify(data, null, 2),
    "utf8",
  );
}

function writePageModules(projectDir: string, site: ScrapedSite): void {
  for (const page of site.pages) {
    const componentName = pageKeyToComponent(page.key);
    const content = `import { GrapePageEditor } from "../components/GrapePageEditor";
import siteData from "../data/site.json";

const page = siteData.pages.find((p) => p.key === ${JSON.stringify(page.key)})!;

export default function ${componentName}() {
  return <GrapePageEditor pageKey={page.key} title={page.title} initialHtml={page.initialHtml} />;
}
`;
    fs.writeFileSync(path.join(projectDir, "src", "pages", `${componentName}.tsx`), content, "utf8");
  }
}

function writeRootFiles(projectDir: string, site: ScrapedSite, port: number): void {
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
        dependencies: {
          grapesjs: "^0.22.8",
          react: "^19.2.0",
          "react-dom": "^19.2.0",
        },
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
  optimizeDeps: {
    include: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime"],
  },
  server: {
    port: ${port},
    allowedHosts: ["monitor.craftfosslabs.com"],
    watch: {
      ignored: ["**/public/assets/**"],
    },
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
    <link rel="stylesheet" href="https://unpkg.com/grapesjs/dist/css/grapes.min.css" />
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
    `import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import "./App.css";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
`,
    "utf8",
  );

  const imports = site.pages
    .map((p) => {
      const name = pageKeyToComponent(p.key);
      return `import ${name} from "./pages/${name}";`;
    })
    .join("\n");

  const routes = site.pages
    .map((p) => {
      const name = pageKeyToComponent(p.key);
      const route = p.route === "/" ? "/" : p.route;
      return `  { path: ${JSON.stringify(route)}, element: <${name} /> },`;
    })
    .join("\n");

  fs.writeFileSync(
    path.join(projectDir, "src", "App.tsx"),
    `import { useState } from "react";
import siteData from "./data/site.json";
${imports}

const routes = [
${routes}
];

export default function App() {
  const [activeKey, setActiveKey] = useState(${JSON.stringify(defaultPage)});
  const active = routes.find((r) => {
    const page = siteData.pages.find((p) => p.key === activeKey);
    return page && r.path === page.route;
  });

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1>{siteData.slug}</h1>
        <nav>
          {siteData.pages.map((p) => (
            <button
              key={p.key}
              type="button"
              className={p.key === activeKey ? "active" : ""}
              onClick={() => setActiveKey(p.key)}
            >
              {p.title}
            </button>
          ))}
        </nav>
      </header>
      <main className="app-main">{active?.element}</main>
    </div>
  );
}
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "src", "App.css"),
    `* { box-sizing: border-box; }
body { margin: 0; font-family: system-ui, sans-serif; }
.app-shell { display: flex; flex-direction: column; height: 100vh; }
.app-header { display: flex; align-items: center; gap: 1rem; padding: 0.5rem 1rem; border-bottom: 1px solid #ddd; background: #fafafa; }
.app-header h1 { margin: 0; font-size: 1rem; }
.app-header nav { display: flex; gap: 0.5rem; flex-wrap: wrap; }
.app-header button { padding: 0.35rem 0.75rem; border: 1px solid #ccc; border-radius: 4px; background: #fff; cursor: pointer; }
.app-header button.active { background: #2563eb; color: #fff; border-color: #2563eb; }
.app-main { flex: 1; min-height: 0; }
.grape-page { display: flex; flex-direction: column; height: 100%; }
.grape-toolbar { flex-shrink: 0; padding: 0.35rem 0.75rem; font-size: 0.875rem; background: #f3f4f6; border-bottom: 1px solid #e5e7eb; }
.grape-host { flex: 1; min-height: 0; }
html, body, #root { height: 100%; }
`,
    "utf8",
  );

  fs.writeFileSync(
    path.join(projectDir, "src", "components", "GrapePageEditor.tsx"),
    `import { useEffect, useRef } from "react";
import grapesjs from "grapesjs";
import siteData from "../data/site.json";

interface Props {
  pageKey: string;
  title: string;
  initialHtml: string;
}

function hasStoredProject(pageKey: string): boolean {
  try {
    const prefix = \`grape-\${pageKey}\`;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.includes(prefix)) return true;
    }
  } catch {
    /* private browsing */
  }
  return false;
}

export function GrapePageEditor({ pageKey, title, initialHtml }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const editorRef = useRef<ReturnType<typeof grapesjs.init> | null>(null);
  const pageMeta = siteData.pages.find((p) => p.key === pageKey);
  const canvasStyles = pageMeta?.canvasStyles ?? siteData.canvasStyles ?? [];

  useEffect(() => {
    if (!hostRef.current) return;

    const bodyHtml = initialHtml?.trim() || "<div>Empty page</div>";
    const autoload = hasStoredProject(pageKey);

    const editor = grapesjs.init({
      container: hostRef.current,
      height: "100%",
      width: "auto",
      fromElement: false,
      storageManager: {
        type: "local",
        autosave: true,
        autoload,
        options: { local: { key: \`grape-\${pageKey}\` } },
      },
      canvas: {
        styles: canvasStyles,
      },
    });

    editor.on("load", () => {
      const wrapper = editor.getWrapper();
      if (!wrapper || wrapper.components().length === 0) {
        editor.setComponents(bodyHtml);
      }
    });

    if (!autoload) {
      editor.setComponents(bodyHtml);
    }

    editorRef.current = editor;

    return () => {
      editor.destroy();
      editorRef.current = null;
    };
  }, [pageKey, initialHtml]);

  return (
    <div className="grape-page" data-page={pageKey}>
      <div className="grape-toolbar">Editing: {title}</div>
      <div ref={hostRef} className="grape-host" />
    </div>
  );
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
