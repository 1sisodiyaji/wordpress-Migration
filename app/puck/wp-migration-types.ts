/**
 * Puck Data shape for WP-migrated sites.
 * Matches @puckeditor/core Data — kept local so migrate scripts need no Puck install.
 */
export interface PuckComponentData {
  type: string;
  props: Record<string, unknown> & { id: string };
  readOnly?: Record<string, boolean>;
}

export interface PuckPageData {
  root: {
    props: Record<string, unknown> & { id: string; title?: string };
  };
  content: PuckComponentData[];
  zones?: Record<string, PuckComponentData[]>;
}

/** sites/{slug}/data/puck/database.json — path → page data (Puck recipe format). */
export type PuckSiteDatabase = Record<string, PuckPageData>;

export interface PuckConversionMeta {
  convertedAt: string;
  siteSlug: string;
  wordpressUrl: string;
  pageBuilder?: string;
  pageCount: number;
  routes: string[];
  strategy: "wp-html-shell";
  notes: string[];
}

/** Props for the bridge component — render loads pages/{pageKey}.html + assets. */
export interface WpHtmlShellProps {
  id: string;
  siteSlug: string;
  pageKey: string;
  routePath: string;
}
