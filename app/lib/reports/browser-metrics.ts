export interface PaneMetrics {
  loadTimeMs: number;
  domContentLoadedMs?: number;
  ttfbMs?: number;
  pageSizeBytes: number;
  resourceCount?: number;
  source: "iframe" | "server" | "parent-load";
  error?: string;
}

export interface WorkspaceBrowserMetrics {
  live: PaneMetrics | null;
  migrated: PaneMetrics | null;
  measuredAt: string;
}

export function isMetricsMessage(data: unknown): data is PaneMetrics & { type: string; pane: string } {
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { type?: string }).type === "wp-migrate-metrics"
  );
}
