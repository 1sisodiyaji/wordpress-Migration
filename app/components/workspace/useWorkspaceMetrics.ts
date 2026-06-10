import { useCallback, useEffect, useState } from "react";
import type { WorkspaceBrowserMetrics, PaneMetrics } from "@/lib/reports/browser-metrics";
import { isMetricsMessage } from "@/lib/reports/browser-metrics";

interface UseWorkspaceMetricsOptions {
  slug: string;
  enabled: boolean;
  liveIframeLoadMs?: number | null;
}

export function useWorkspaceMetrics({
  slug,
  enabled,
  liveIframeLoadMs,
}: UseWorkspaceMetricsOptions) {
  const [metrics, setMetrics] = useState<WorkspaceBrowserMetrics | null>(null);
  const [loading, setLoading] = useState(false);

  const onMigratedMessage = useCallback((event: MessageEvent) => {
    if (!isMetricsMessage(event.data)) return;
    const data = event.data as PaneMetrics & { pane: string };
    if (data.pane !== "migrated") return;

    setMetrics((prev) => ({
      live: prev?.live ?? null,
      migrated: {
        loadTimeMs: data.loadTimeMs,
        domContentLoadedMs: data.domContentLoadedMs,
        ttfbMs: data.ttfbMs,
        pageSizeBytes: data.pageSizeBytes,
        resourceCount: data.resourceCount,
        source: "iframe",
      },
      measuredAt: new Date().toISOString(),
    }));
  }, []);

  useEffect(() => {
    window.addEventListener("message", onMigratedMessage);
    return () => window.removeEventListener("message", onMigratedMessage);
  }, [onMigratedMessage]);

  useEffect(() => {
    if (!enabled) return;

    let cancelled = false;
    setLoading(true);

    void (async () => {
      try {
        const res = await fetch(`/workspace/${slug}/metrics`);
        if (!res.ok) throw new Error(`Metrics ${res.status}`);
        const server = (await res.json()) as WorkspaceBrowserMetrics;
        if (cancelled) return;

        setMetrics((prev) => ({
          live: server.live,
          migrated: prev?.migrated ?? server.migrated,
          measuredAt: new Date().toISOString(),
        }));
      } catch (err) {
        if (!cancelled) {
          setMetrics((prev) => ({
            live: prev?.live ?? {
              loadTimeMs: 0,
              pageSizeBytes: 0,
              source: "server",
              error: err instanceof Error ? err.message : "Failed",
            },
            migrated: prev?.migrated ?? null,
            measuredAt: new Date().toISOString(),
          }));
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, slug]);

  useEffect(() => {
    if (!enabled || liveIframeLoadMs == null) return;

    setMetrics((prev) => ({
      live: {
        loadTimeMs: liveIframeLoadMs,
        pageSizeBytes: prev?.live?.pageSizeBytes ?? 0,
        ttfbMs: prev?.live?.ttfbMs,
        source: "parent-load",
      },
      migrated: prev?.migrated ?? null,
      measuredAt: new Date().toISOString(),
    }));
  }, [enabled, liveIframeLoadMs]);

  return { metrics, loading, refresh: () => setMetrics(null) };
}
