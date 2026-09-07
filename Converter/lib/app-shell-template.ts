/**
 * Generates src/App.tsx for plugin-export GrapeJS projects.
 *
 * Uses react-router URL routes (/, /about, …) instead of in-memory page switching.
 */

export interface AppShellTemplateInput {
  siteName: string;
  imports: string;
  pageElementEntries: string;
  defaultPageKey: string;
}

/** Dynamic classNames — plain strings, not nested template literals. */
const CN_PAGES_FAB = 'className={"pages-fab" + (pagesOpen ? " is-open" : "")}';
const CN_PAGES_OVERLAY = 'className={"pages-overlay" + (pagesOpen ? " is-open" : "")}';
const CN_PAGES_SIDEBAR = 'className={"pages-sidebar" + (pagesOpen ? " is-open" : "")}';

export function buildAppTsx(input: AppShellTemplateInput): string {
  const { imports, pageElementEntries, defaultPageKey } = input;

  const lines = [
    'import { useEffect, useMemo, useState, type ReactNode } from "react";',
    'import { BrowserRouter, Navigate, NavLink, Route, Routes, useLocation } from "react-router-dom";',
    'import { SiteLayout } from "./components/layout/SiteLayout";',
    imports,
    'import siteData from "./data/site.json";',
    "",
    "const pageElements: Record<string, ReactNode> = {",
    pageElementEntries,
    "};",
    "",
    "type PageRoute = {",
    "  key: string;",
    "  title: string;",
    "  path: string;",
    "};",
    "",
    "function toPath(route: string | undefined): string {",
    '  if (!route || route === "/") return "/";',
    '  const withSlash = route.startsWith("/") ? route : "/" + route;',
    '  return withSlash.replace(/\\/$/, "") || "/";',
    "}",
    "",
    "const pageRoutes: PageRoute[] = siteData.pages.map((p) => ({",
    "  key: p.key,",
    "  title: p.title,",
    "  path: toPath(p.route),",
    "}));",
    "",
    `const defaultPath = pageRoutes.find((r) => r.key === ${JSON.stringify(defaultPageKey)})?.path ?? "/";`,
    "",
    "function PagesChrome({ children }: { children: ReactNode }) {",
    "  const [pagesOpen, setPagesOpen] = useState(false);",
    "  const [pageQuery, setPageQuery] = useState(\"\");",
    "  const location = useLocation();",
    "",
    "  const activeKey = useMemo(() => {",
    "    const match = pageRoutes.find((r) => r.path === location.pathname);",
    "    return match?.key ?? pageRoutes[0]?.key;",
    "  }, [location.pathname]);",
    "",
    "  const filtered = pageQuery.trim()",
    "    ? pageRoutes.filter(",
    "        (r) =>",
    "          r.title.toLowerCase().includes(pageQuery.toLowerCase()) ||",
    "          r.key.toLowerCase().includes(pageQuery.toLowerCase()) ||",
    "          r.path.toLowerCase().includes(pageQuery.toLowerCase()),",
    "      )",
    "    : pageRoutes;",
    "",
    "  useEffect(() => {",
    "    if (!pagesOpen) return;",
    "    const onKey = (e: KeyboardEvent) => {",
    '      if (e.key === "Escape") setPagesOpen(false);',
    "    };",
    '    window.addEventListener("keydown", onKey);',
    '    return () => window.removeEventListener("keydown", onKey);',
    "  }, [pagesOpen]);",
    "",
    "  return (",
    "    <>",
    "      {children}",
    "",
    "      <button",
    '        type="button"',
    `        ${CN_PAGES_FAB}`,
    "        aria-expanded={pagesOpen}",
    '        aria-controls="pages-sidebar"',
    "        onClick={() => setPagesOpen((v) => !v)}",
    '        title="Pages"',
    "      >",
    '        <span className="pages-fab-label">Pages</span>',
    '        <span className="pages-fab-count">{pageRoutes.length}</span>',
    "      </button>",
    "",
    "      <div",
    `        ${CN_PAGES_OVERLAY}`,
    "        onClick={() => setPagesOpen(false)}",
    "        aria-hidden={!pagesOpen}",
    "      />",
    "",
    "      <aside",
    '        id="pages-sidebar"',
    `        ${CN_PAGES_SIDEBAR}`,
    "        aria-hidden={!pagesOpen}",
    "      >",
    '        <div className="pages-sidebar-head">',
    "          <h2>Pages</h2>",
    '          <button type="button" className="pages-close" onClick={() => setPagesOpen(false)} aria-label="Close">',
    "            ×",
    "          </button>",
    "        </div>",
    '        <div className="pages-search">',
    "          <input",
    '            type="search"',
    "            value={pageQuery}",
    "            onChange={(e) => setPageQuery(e.target.value)}",
    '            placeholder="Search pages…"',
    "          />",
    "        </div>",
    '        <nav className="pages-nav">',
    "          {filtered.map((r) => (",
    "            <NavLink",
    "              key={r.key}",
    "              to={r.path}",
    "              end={r.path === \"/\"}",
    '              className={({ isActive }) => (isActive || activeKey === r.key ? "active" : undefined)}',
    "              onClick={() => {",
    "                setPagesOpen(false);",
    '                setPageQuery("");',
    "              }}",
    "            >",
    '              <span className="pages-nav-title">{r.title}</span>',
    '              <span className="pages-nav-path">{r.path}</span>',
    "            </NavLink>",
    "          ))}",
    '          {filtered.length === 0 && <p className="pages-empty">No pages match</p>}',
    "        </nav>",
    "      </aside>",
    "    </>",
    "  );",
    "}",
    "",
    "export default function App() {",
    "  return (",
    "    <BrowserRouter>",
    '      <div className="app-shell">',
    '        <div className="app-main">',
    "          <PagesChrome>",
    "            <Routes>",
    "              {pageRoutes.map((r) => (",
    "                <Route",
    "                  key={r.key}",
    "                  path={r.path}",
    "                  element={<SiteLayout>{pageElements[r.key]}</SiteLayout>}",
    "                />",
    "              ))}",
    '              <Route path="*" element={<Navigate to={defaultPath} replace />} />',
    "            </Routes>",
    "          </PagesChrome>",
    "        </div>",
    "      </div>",
    "    </BrowserRouter>",
    "  );",
    "}",
    "",
  ];

  return lines.join("\n");
}

/** Fail fast if generated App.tsx contains the old broken escape pattern. */
export function assertValidAppTsx(source: string): void {
  if (/className=\{\\`/.test(source) || /\\`pages-fab/.test(source)) {
    throw new Error(
      "App.tsx generator produced invalid escaped backticks (className={\\`…\\`}). Regenerate after updating generator/lib/app-shell-template.ts",
    );
  }
  if (!source.includes(CN_PAGES_FAB)) {
    throw new Error("App.tsx generator missing pages-fab className concat");
  }
  if (!source.includes("BrowserRouter") || !source.includes("Routes")) {
    throw new Error("App.tsx generator missing react-router Routes");
  }
}
