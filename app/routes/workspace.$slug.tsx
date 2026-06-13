import { useCallback, useEffect, useRef, useState } from "react";
import { Link, useFetcher, useRevalidator } from "react-router";
import { ArrowLeft, BarChart3, Boxes, Download, RotateCw } from "lucide-react";
import {
  ResponsiveViewportToolbar,
  ViewportFrame,
  type ViewportPreset,
} from "@/components/workspace/ResponsiveViewport";
import type { Route } from "./+types/workspace.$slug";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BrowserUrlBar } from "@/components/workspace/BrowserUrlBar";
import { IframePane } from "@/components/workspace/IframePane";
import {
  MigrationLogPanel,
  MigrationLogToggle,
} from "@/components/workspace/MigrationLogPanel";
import { startMigration } from "@/api/migration/start-migration.server";
import { ReportsPanel } from "@/components/workspace/ReportsPanel";
import { WorkspaceSplit } from "@/components/workspace/WorkspaceSplit";
import { useWorkspaceMetrics } from "@/components/workspace/useWorkspaceMetrics";
import { buildSiteReport } from "@/api/reports/site-report";
import { syncPreviewDocument } from "@/api/wp/sync-preview-document";
import { getSite, siteHasData } from "@/api/wp/sites";
import { isWorkspaceNavMessage } from "@/lib/workspace/nav-messages";
import { workspacePreviewPath } from "@/lib/workspace/proxy-html";

export async function loader({ params }: Route.LoaderArgs) {
  const slug = params.slug!;
  const entry = getSite(slug);
  if (!entry || !siteHasData(slug)) {
    throw new Response("Project not found", { status: 404 });
  }
  try {
    syncPreviewDocument(slug);
  } catch {
    /* preview may be stale until assets are migrated */
  }

  return {
    slug,
    entry,
    report: buildSiteReport(slug),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const slug = params.slug!;
  const entry = getSite(slug);
  if (!entry) {
    return { error: "Project not found." };
  }

  const form = await request.formData();
  const intent = String(form.get("intent") ?? "");

  if (intent === "scrape") {
    const mode = String(form.get("mode") ?? "landing") === "full" ? "full" : "landing";
    startMigration(entry.url, true, mode);
    return { scraping: true as const };
  }

  return { error: "Unknown action." };
}

export default function Workspace({ loaderData }: Route.ComponentProps) {
  const { slug, entry, report } = loaderData;
  const isLanding = entry.stage === "landing" || !entry.stage;
  const [reportsOpen, setReportsOpen] = useState(false);
  const [liveKey, setLiveKey] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewSyncing, setPreviewSyncing] = useState(false);
  const [viewport, setViewport] = useState<ViewportPreset>("desktop");
  const [liveDisplayUrl, setLiveDisplayUrl] = useState(entry.url);
  const [migratedDisplayUrl, setMigratedDisplayUrl] = useState(() =>
    workspacePreviewPath(slug, "/"),
  );
  const [logsOpen, setLogsOpen] = useState(entry.status === "migrating");
  const scrapeFetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();

  const liveLoadStart = useRef(Date.now());
  const [liveIframeLoadMs, setLiveIframeLoadMs] = useState<number | null>(null);

  /** Iframe src only changes on reload — in-iframe navigation updates the URL bar via postMessage. */
  const liveBrowseSrc = `/workspace/${slug}/browse?url=${encodeURIComponent(entry.url)}`;
  const migratedPreviewSrc = `/workspace/${slug}/preview?route=${encodeURIComponent("/")}&v=${previewKey}`;

  const onNavMessage = useCallback((event: MessageEvent) => {
    if (!isWorkspaceNavMessage(event.data)) return;
    if (event.data.pane === "live") {
      setLiveDisplayUrl(event.data.url);
    } else if (event.data.pane === "migrated") {
      setMigratedDisplayUrl(event.data.url);
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", onNavMessage);
    return () => window.removeEventListener("message", onNavMessage);
  }, [onNavMessage]);

  const reloadLive = () => {
    liveLoadStart.current = Date.now();
    setLiveIframeLoadMs(null);
    setLiveDisplayUrl(entry.url);
    setLiveKey((k) => k + 1);
  };

  const reloadPreview = useCallback(async () => {
    setPreviewSyncing(true);
    try {
      await fetch(`/preview/${slug}/sync`);
      setMigratedDisplayUrl(workspacePreviewPath(slug, "/"));
      setPreviewKey((k) => k + 1);
    } finally {
      setPreviewSyncing(false);
    }
  }, [slug]);

  useEffect(() => {
    liveLoadStart.current = Date.now();
    setLiveIframeLoadMs(null);
    setLiveDisplayUrl(entry.url);
    setMigratedDisplayUrl(workspacePreviewPath(slug, "/"));
  }, [entry.url, slug]);

  useEffect(() => {
    if (scrapeFetcher.data?.scraping) {
      setLogsOpen(true);
    }
  }, [scrapeFetcher.data]);

  const scraping =
    entry.status === "migrating" || scrapeFetcher.state !== "idle";

  const onScrapeComplete = useCallback(() => {
    revalidator.revalidate();
    void reloadPreview();
  }, [revalidator, reloadPreview]);

  const { metrics, loading: metricsLoading } = useWorkspaceMetrics({
    slug,
    enabled: reportsOpen,
    liveIframeLoadMs,
  });

  const paneChrome = (
    label: string,
    url: string,
    onReload?: () => void,
    reloading?: boolean,
  ) => (
    <div className="flex shrink-0 flex-col border-b border-slate-100 bg-white">
      <div className="flex items-center justify-between gap-2 px-3 py-1">
        <span className="text-xs font-medium text-slate-600">{label}</span>
        <BrowserUrlBar url={url} />
        {onReload ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            title="Reload"
            disabled={reloading}
            onClick={onReload}
          >
            <RotateCw className={`size-3.5 ${reloading ? "animate-spin" : ""}`} />
          </Button>
        ) : null}
      </div>
      
    </div>
  );

  return (
    <div className="platform-ui flex h-screen flex-col overflow-hidden bg-slate-50 text-slate-900">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 py-1">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" asChild>
            <Link to="/">
              <ArrowLeft className="size-4" />
              Projects
            </Link>
          </Button>
          <div>
            <h1 className="text-sm font-semibold">{entry.name}</h1>
            <p className="text-xs text-slate-500">{entry.url}</p>
          </div>
          <Badge variant={isLanding ? "warning" : "success"}>
            {isLanding ? "Landing preview" : entry.stage ?? "ready"}
          </Badge>
        </div>

        <div className="flex items-center gap-2">
          <scrapeFetcher.Form method="post">
            <input type="hidden" name="intent" value="scrape" />
            <input type="hidden" name="mode" value="landing" />
            <Button
              type="submit"
              variant="outline"
              size="sm"
              className="gap-2"
              disabled={scraping}
            >
              <Download className="size-4" />
              {scraping ? "Scraping…" : "Re-scrape site"}
            </Button>
          </scrapeFetcher.Form>

          <MigrationLogToggle
            open={logsOpen}
            scraping={scraping}
            onToggle={() => setLogsOpen((v) => !v)}
          />

          <ResponsiveViewportToolbar value={viewport} onChange={setViewport} />
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={() => setReportsOpen((v) => !v)}
          >
            <BarChart3 className="size-4" />
            {reportsOpen ? "Hide reports" : "View reports"}
            {report ? (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-xs tabular-nums text-slate-600">
                SEO {report.seo.score} · Perf {report.performance.score}
              </span>
            ) : null}
          </Button>

          {isLanding ? (
            <Button asChild className="gap-2">
              <Link to={`/puck/${slug}`}>
                <Boxes className="size-4" />
                Convert to Puck
              </Link>
            </Button>
          ) : (
            <Button asChild variant="secondary">
              <Link to={`/${slug}`}>Open full site</Link>
            </Button>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
        <MigrationLogPanel
          slug={slug}
          open={logsOpen}
          onClose={() => setLogsOpen(false)}
          onComplete={onScrapeComplete}
        />

        <ReportsPanel
          open={reportsOpen}
          onClose={() => setReportsOpen(false)}
          report={report}
          browserMetrics={metrics}
          metricsLoading={metricsLoading}
          isLanding={isLanding}
        />

        <WorkspaceSplit
          className="h-full"
          leftLabel={paneChrome("Live site", liveDisplayUrl, reloadLive)}
          rightLabel={paneChrome(
            "Migrated preview",
            migratedDisplayUrl,
            reloadPreview,
            previewSyncing,
          )}
          left={
            <ViewportFrame viewport={viewport}>
              <IframePane
                title="live site"
                src={liveBrowseSrc}
                reloadKey={liveKey}
                onLoad={() => {
                  setLiveIframeLoadMs(Date.now() - liveLoadStart.current);
                }}
              />
            </ViewportFrame>
          }
          right={
            <ViewportFrame viewport={viewport}>
              <IframePane
                title="migrated preview"
                src={migratedPreviewSrc}
                reloadKey={previewKey}
                forceLoading={previewSyncing}
              />
            </ViewportFrame>
          }
        />
      </div>
    </div>
  );
}
