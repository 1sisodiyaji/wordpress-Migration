/**
 * Generates src/App.tsx for plugin-export GrapeJS projects.
 *
 * Kept in a separate module so we never nest template-literal backticks inside
 * scaffold-v2's own template strings (that produced `className={\`...\`}` bugs).
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
    'import { useEffect, useState, type ReactNode } from "react";',
    'import { SiteLayout } from "./components/layout/SiteLayout";',
    imports,
    'import siteData from "./data/site.json";',
    "",
    "const pageElements: Record<string, ReactNode> = {",
    pageElementEntries,
    "};",
    "",
    "const routes = siteData.pages.map((p) => ({",
    "  key: p.key,",
    "  title: p.title,",
    "  route: p.route,",
    "  element: pageElements[p.key] ?? null,",
    "}));",
    "",
    "/** In-page section anchors from the exported WordPress menu live on the home page. */",
    "function pageKeyForHash(hash: string): string | null {",
    '  if (!hash || hash === "#") return "home";',
    '  if (hash === "#about" || hash === "#services") return "home";',
    "  return null;",
    "}",
    "",
    "export default function App() {",
    `  const [activeKey, setActiveKey] = useState(${JSON.stringify(defaultPageKey)});`,
    "  const [pagesOpen, setPagesOpen] = useState(false);",
    "  const [pageQuery, setPageQuery] = useState(\"\");",
    "  const active = routes.find((r) => r.key === activeKey) ?? routes[0];",
    "",
    "  const filtered = pageQuery.trim()",
    "    ? routes.filter(",
    "        (r) =>",
    "          r.title.toLowerCase().includes(pageQuery.toLowerCase()) ||",
    "          r.key.toLowerCase().includes(pageQuery.toLowerCase()),",
    "      )",
    "    : routes;",
    "",
    "  useEffect(() => {",
    "    const syncFromHash = () => {",
    "      const key = pageKeyForHash(window.location.hash);",
    "      if (key) setActiveKey(key);",
    "    };",
    "    syncFromHash();",
    '    window.addEventListener("hashchange", syncFromHash);',
    '    return () => window.removeEventListener("hashchange", syncFromHash);',
    "  }, []);",
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
    "  function selectPage(key: string) {",
    "    setActiveKey(key);",
    "    setPagesOpen(false);",
    "    setPageQuery(\"\");",
    "  }",
    "",
    "  return (",
    '    <div className="app-shell">',
    '      <div className="app-main">',
    "        {active?.element ? <SiteLayout key={active.key}>{active.element}</SiteLayout> : null}",
    "      </div>",
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
    '        <span className="pages-fab-count">{routes.length}</span>',
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
    "            <button",
    "              key={r.key}",
    '              type="button"',
    '              className={r.key === activeKey ? "active" : ""}',
    "              onClick={() => selectPage(r.key)}",
    "            >",
    "              {r.title}",
    "            </button>",
    "          ))}",
    '          {filtered.length === 0 && <p className="pages-empty">No pages match</p>}',
    "        </nav>",
    "      </aside>",
    "    </div>",
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
}

function escapeJsxText(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
