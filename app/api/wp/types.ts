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

export type PageBuilder = "elementor" | "gutenberg" | "classic" | "unknown";
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
}
