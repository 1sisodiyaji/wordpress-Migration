import { useEffect, useRef, useState } from "react";
import { Form, Link, redirect } from "react-router";
import { ArrowLeft, BarChart3, Code2, ExternalLink, RotateCw } from "lucide-react";
import {
  ResponsiveViewportToolbar,
  ViewportFrame,
  type ViewportPreset,
} from "@/components/workspace/ResponsiveViewport";
import type { Route } from "./+types/workspace.$slug";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { IframePane } from "@/components/workspace/IframePane";
import { ReportsPanel } from "@/components/workspace/ReportsPanel";
import { WorkspaceSplit } from "@/components/workspace/WorkspaceSplit";
import { useWorkspaceMetrics } from "@/components/workspace/useWorkspaceMetrics";
import { buildSiteReport } from "@/api/reports/site-report";
import { startMigration } from "@/api/migration/start-migration.server";
import {
  previewDocumentPublicPath,
  syncPreviewDocument,
} from "@/api/wp/sync-preview-document";
import { getSite, siteHasData } from "@/api/wp/sites";

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
    previewPath: previewDocumentPublicPath(slug),
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const slug = params.slug!;
  const entry = getSite(slug);
  if (!entry) throw redirect("/");

  const form = await request.formData();
  if (form.get("intent") === "convert") {
    startMigration(entry.url, false, "full");
    throw redirect(`/migrate/${slug}`);
  }

  return null;
}

export default function Workspace({ loaderData }: Route.ComponentProps) {
  const { slug, entry, report, previewPath } = loaderData;
  const isLanding = entry.stage === "landing" || !entry.stage;
  const [reportsOpen, setReportsOpen] = useState(false);
  const [liveKey, setLiveKey] = useState(0);
  const [previewKey, setPreviewKey] = useState(0);
  const [previewSyncing, setPreviewSyncing] = useState(false);
  const [viewport, setViewport] = useState<ViewportPreset>("desktop");

  const liveLoadStart = useRef(Date.now());
  const [liveIframeLoadMs, setLiveIframeLoadMs] = useState<number | null>(null);

  const reloadLive = () => {
    liveLoadStart.current = Date.now();
    setLiveIframeLoadMs(null);
    setLiveKey((k) => k + 1);
  };

  const reloadPreview = async () => {
    setPreviewSyncing(true);
    try {
      await fetch(`/preview/${slug}/sync`);
      setPreviewKey((k) => k + 1);
    } finally {
      setPreviewSyncing(false);
    }
  };

  useEffect(() => {
    liveLoadStart.current = Date.now();
    setLiveIframeLoadMs(null);
  }, [entry.url]);

  const { metrics, loading: metricsLoading } = useWorkspaceMetrics({
    slug,
    enabled: reportsOpen,
    liveIframeLoadMs,
  });

  const paneHeader = (
    label: string,
    extra?: React.ReactNode,
    onReload?: () => void,
    reloading?: boolean,
  ) => (
    <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 bg-white px-3 py-2">
      <span className="text-xs font-medium text-slate-600">{label}</span>
      <div className="flex items-center gap-2">
        {extra}
        {onReload ? (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            title="Reload preview"
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
            <Form method="post">
              <input type="hidden" name="intent" value="convert" />
              <Button type="submit" className="gap-2">
                <Code2 className="size-4" />
                Convert to React Router Remix
              </Button>
            </Form>
          ) : (
            <Button asChild variant="secondary">
              <Link to={`/${slug}`}>Open full site</Link>
            </Button>
          )}
        </div>
      </header>

      <div className="relative min-h-0 flex-1">
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
          leftLabel={paneHeader(
            "Live site",
            <a
              href={entry.url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-blue-600 hover:underline"
            >
              Open <ExternalLink className="size-3" />
            </a>,
            reloadLive,
          )}
          rightLabel={paneHeader(
            "Migrated preview",
            <span className="text-xs text-slate-400">Static HTML replay</span>,
            reloadPreview,
            previewSyncing,
          )}
          left={
            <ViewportFrame viewport={viewport}>
              <IframePane
                title="live site"
                src={entry.url}
                reloadKey={liveKey}
                sandbox="allow-scripts allow-same-origin allow-forms"
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
                src={`${previewPath}?v=${previewKey}`}
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
