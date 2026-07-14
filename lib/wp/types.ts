export interface WpRenderedField {
  rendered: string;
  protected?: boolean;
}

export interface WpPost {
  id: number;
  slug: string;
  status: string;
  type: string;
  link: string;
  date: string;
  modified: string;
  title: WpRenderedField;
  content: WpRenderedField;
  excerpt: WpRenderedField;
  featured_media: number;
  categories?: number[];
  tags?: number[];
  class_list?: string[];
  template?: string;
}

export interface WpMedia {
  id: number;
  slug: string;
  source_url: string;
  alt_text: string;
  media_type: string;
  mime_type: string;
  title: WpRenderedField;
}

export interface WpSiteMeta {
  name: string;
  description: string;
  url: string;
  home: string;
  gmt_offset: number;
  timezone_string: string;
}

export type PageBuilder =
  | "elementor"
  | "gutenberg"
  | "classic"
  | "divi"
  | "wpbakery"
  | "beaver"
  | "brizy"
  | "oxygen"
  | "unknown";
export type RouteRenderMode = "api" | "shell";

export interface WpRoute {
  path: string;
  wpLink: string;
  type: "home" | "page" | "post";
  postId?: number;
  slug?: string;
  renderMode?: RouteRenderMode;
  isElementor?: boolean;
  /** Detected from live HTML crawl (overrides site default). */
  pageBuilder?: PageBuilder;
  source?: "rest" | "sitemap" | "both";
}

export interface MigratedStaticFile {
  path: string;
  sourceUrl: string;
  localPath: string;
}

export interface SitemapManifest {
  fetchedAt: string;
  pageUrlCount: number;
  sitemapSources: string[];
  paths: string[];
}

export interface StylesManifest {
  fetchedAt: string;
  sourceUrl: string;
  pageBuilder?: PageBuilder;
  elementorPageCount?: number;
  stylesheets: string[];
  inlineStyles: string[];
  bodyClasses: string[];
  htmlClasses: string[];
  themeJsonPath?: string;
}

/** Per-page scripts/styles extracted from Elementor HTML (custom code, widgets). */
export interface PageShellAssets {
  scripts: Array<{ src?: string; inline?: string; id?: string; type?: string }>;
  styles: Array<{ inline?: string; id?: string }>;
}

export interface ElementorSnippet {
  id: number;
  slug: string;
  title: string;
  link: string;
  scripts: PageShellAssets["scripts"];
  styles: PageShellAssets["styles"];
}

export interface ElementorTemplate {
  id: number;
  slug: string;
  title: string;
  link: string;
  templateType?: string;
}

export interface ElementorSystemManifest {
  fetchedAt: string;
  kitId?: number;
  snippets: ElementorSnippet[];
  templates: ElementorTemplate[];
  floatingButtons: ElementorTemplate[];
  /** Snippet IDs referenced in Theme Builder (from crawl). */
  globalSnippetIds: number[];
}

export interface MigrationManifest {
  version: 1;
  migratedAt: string;
  wordpressUrl: string;
  restBase: string;
  pageBuilder?: PageBuilder;
  site: WpSiteMeta;
  routes: WpRoute[];
  posts: WpPost[];
  pages: WpPost[];
  media: WpMedia[];
  styles: StylesManifest;
  elementor?: ElementorSystemManifest;
  staticFiles?: MigratedStaticFile[];
  sitemap?: SitemapManifest;
  /** Present when the site was produced by the wp-grape-export plugin (schema v2). */
  pluginExport?: PluginExportMeta;
}

/* ------------------------------------------------------------------ *
 * Plugin export contract (schema v2)
 *
 * Mirrors export-schema/v2/manifest.schema.json produced by the
 * wp-grape-export WordPress plugin. These describe the *bundle on disk*;
 * the importer normalizes them into the internal layout above.
 * ------------------------------------------------------------------ */

export interface PluginExportGenerator {
  name: string;
  version: string;
  wpVersion?: string;
  phpVersion?: string;
}

export interface PluginExportSiteTheme {
  name?: string;
  stylesheet?: string;
  template?: string;
  version?: string;
  hasThemeJson?: boolean;
}

export interface PluginExportSite {
  name: string;
  description?: string;
  url: string;
  home: string;
  language?: string;
  timezone?: string;
  charset?: string;
  pageBuilder: PageBuilder;
  theme?: PluginExportSiteTheme;
  activePlugins?: string[];
  builderPlugins?: string[];
}

export interface PluginExportRoute {
  id: number;
  path: string;
  slug?: string;
  type: "home" | "page" | "post" | "cpt";
  postType?: string;
  title: string;
  status?: string;
  pageBuilder?: string;
  template?: string;
  parentId?: number | null;
  menuOrder?: number;
  isFront?: boolean;
  /** Relative dir under pages/ holding this route's files. */
  dir?: string;
}

export interface PluginExportLayoutRegion {
  source?: string;
  postId?: number | null;
  title?: string;
  htmlFile?: string;
  dataFile?: string | null;
  assignedTo?: string[];
}

export interface PluginExportMenuItem {
  id: number;
  title: string;
  url: string;
  parentId?: number;
  order?: number;
  target?: string;
  classes?: string[];
  objectType?: string;
  objectId?: number | null;
}

export interface PluginExportMenu {
  id: number;
  slug: string;
  name?: string;
  location?: string | null;
  items: PluginExportMenuItem[];
}

export interface PluginExportLayout {
  header?: PluginExportLayoutRegion | null;
  footer?: PluginExportLayoutRegion | null;
  menus: PluginExportMenu[];
}

/** Layout region with its rendered HTML inlined (produced by the importer). */
export interface PluginExportResolvedRegion extends PluginExportLayoutRegion {
  html: string;
}

/** Resolved layout persisted to sites/{slug}/data/layout.json. */
export interface PluginExportBundleLayout {
  header: PluginExportResolvedRegion | null;
  footer: PluginExportResolvedRegion | null;
  menus: PluginExportMenu[];
}

export interface PluginExportShortcode {
  tag: string;
  attrs?: Record<string, unknown>;
  resolved?: boolean;
}

export interface PluginExportPageMeta {
  postId: number;
  path: string;
  slug?: string;
  title: string;
  type?: string;
  pageBuilder?: string;
  template?: string;
  renderedFile: string;
  rawFile?: string | null;
  assetsFile?: string | null;
  slots?: {
    headerTemplateId?: number | null;
    footerTemplateId?: number | null;
  };
  shortcodes?: PluginExportShortcode[];
}

export interface PluginExportTemplate {
  id: number;
  slug?: string;
  title?: string;
  type: string;
  source?: string;
  htmlFile?: string;
  dataFile?: string | null;
  conditions?: string[];
}

export interface PluginExportAssetRef {
  handle?: string;
  src?: string | null;
  deps?: string[];
  ver?: string | null;
  inlineBefore?: string | null;
  inlineAfter?: string | null;
  media?: string;
  position?: "head" | "footer";
  /** Path inside the export bundle when the file was copied (e.g. assets/wp-content/...). */
  bundlePath?: string;
  /** Path inside the bundle for inlined CSS/JS (e.g. assets/inline/styles/handle.css). */
  bundleInline?: string;
}

export interface PluginExportAssetManifest {
  stylesheets: PluginExportAssetRef[];
  scripts: PluginExportAssetRef[];
}

export interface PluginExportMediaItem {
  id: number;
  url: string;
  path?: string;
  alt?: string;
  mime?: string;
  sizes?: Record<string, unknown>;
}

export interface PluginExportAudit {
  unresolvedShortcodes: Array<{ tag: string; postId?: number; path?: string }>;
  warnings: string[];
}

export interface PluginExportManifest {
  version: 2;
  generator: PluginExportGenerator;
  exportedAt: string;
  site: PluginExportSite;
  counts?: Record<string, number>;
  files?: {
    site?: string;
    layout?: string;
    routes?: string;
    assets?: string;
    media?: string;
    audit?: string;
  };
}

/** Metadata carried on the internal manifest when sourced from a plugin export. */
export interface PluginExportMeta {
  schemaVersion: number;
  generator: PluginExportGenerator;
  exportedAt: string;
  hasLayout: boolean;
  menuCount: number;
  templateCount: number;
  unresolvedShortcodeCount: number;
}
