import { BarChart3, Clock, Gauge, HardDrive, Search, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import type { WorkspaceBrowserMetrics } from "@/lib/reports/browser-metrics";
import { formatBytes, formatMs } from "@/api/reports/measure-url";
import type { SiteReport } from "@/api/reports/site-report";

function ScoreStat({ score, label }: { score: number; label: string }) {
  const color =
    score >= 80 ? "text-emerald-600" : score >= 60 ? "text-amber-600" : "text-red-600";
  return (
    <div className="flex items-center gap-3">
      <span className={`text-4xl font-semibold tabular-nums ${color}`}>{score}</span>
      <span className="text-sm text-slate-500">{label}</span>
    </div>
  );
}

function CompareRow({
  label,
  live,
  migrated,
}: {
  label: string;
  live: string;
  migrated: string;
}) {
  return (
    <div className="grid grid-cols-3 gap-2 text-xs">
      <span className="text-slate-500">{label}</span>
      <span className="tabular-nums text-slate-700">{live}</span>
      <span className="tabular-nums text-slate-700">{migrated}</span>
    </div>
  );
}

interface ReportsPanelProps {
  open: boolean;
  onClose: () => void;
  report: SiteReport | null;
  browserMetrics: WorkspaceBrowserMetrics | null;
  metricsLoading?: boolean;
  isLanding?: boolean;
}

export function ReportsPanel({
  open,
  onClose,
  report,
  browserMetrics,
  metricsLoading,
  isLanding,
}: ReportsPanelProps) {
  if (!open) return null;

  const live = browserMetrics?.live;
  const migrated = browserMetrics?.migrated;

  return (
    <div className="absolute top-0 right-0 left-0 z-30 max-h-[min(70vh,32rem)] overflow-y-auto border-b border-slate-200 bg-white/95 shadow-lg backdrop-blur-md">
      <div className="mx-auto max-w-6xl px-4 py-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
            <BarChart3 className="size-4 text-blue-600" />
            Site analysis
            {metricsLoading ? (
              <span className="text-xs font-normal text-slate-400">Measuring…</span>
            ) : null}
          </div>
          <Button variant="ghost" size="sm" onClick={onClose} aria-label="Close reports">
            <X className="size-4" />
          </Button>
        </div>

        <div className="mb-3 grid grid-cols-3 gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-500">
          <span>Metric</span>
          <span>Live site</span>
          <span>Migrated preview</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Search className="size-4 text-blue-600" />
                SEO
              </CardTitle>
              <CardDescription>Homepage snapshot</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report ? (
                <>
                  <ScoreStat score={report.seo.score} label={report.seo.label} />
                  <ul className="space-y-1 text-xs text-slate-600">
                    {report.seo.hints.map((h) => (
                      <li key={h}>• {h}</li>
                    ))}
                  </ul>
                </>
              ) : (
                <p className="text-xs text-slate-500">No report yet</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Gauge className="size-4 text-violet-600" />
                Performance
              </CardTitle>
              <CardDescription>Asset & DOM weight</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {report ? (
                <>
                  <ScoreStat
                    score={report.performance.score}
                    label={report.performance.label}
                  />
                  <p className="text-xs text-slate-500">
                    {report.htmlSizeKb} KB HTML shell · {report.stylesheetCount} CSS files
                  </p>
                  <ul className="space-y-1 text-xs text-slate-600">
                    {report.performance.hints.map((h) => (
                      <li key={h}>• {h}</li>
                    ))}
                  </ul>
                </>
              ) : null}
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <Clock className="size-4 text-amber-600" />
                Load time
              </CardTitle>
              <CardDescription>Opening / full load (browser)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <CompareRow
                label="Full load"
                live={live ? formatMs(live.loadTimeMs) : "—"}
                migrated={migrated ? formatMs(migrated.loadTimeMs) : "—"}
              />
              <CompareRow
                label="TTFB"
                live={live?.ttfbMs != null ? formatMs(live.ttfbMs) : "—"}
                migrated={migrated?.ttfbMs != null ? formatMs(migrated.ttfbMs) : "—"}
              />
              <CompareRow
                label="DOM ready"
                live={live?.domContentLoadedMs != null ? formatMs(live.domContentLoadedMs) : "—"}
                migrated={
                  migrated?.domContentLoadedMs != null
                    ? formatMs(migrated.domContentLoadedMs)
                    : "—"
                }
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <HardDrive className="size-4 text-teal-600" />
                Page size
              </CardTitle>
              <CardDescription>Transfer weight at load</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2">
              <CompareRow
                label="Total"
                live={live ? formatBytes(live.pageSizeBytes) : "—"}
                migrated={migrated ? formatBytes(migrated.pageSizeBytes) : "—"}
              />
              <CompareRow
                label="Resources"
                live={live?.resourceCount != null ? String(live.resourceCount) : "—"}
                migrated={
                  migrated?.resourceCount != null ? String(migrated.resourceCount) : "—"
                }
              />
              <p className="pt-1 text-[10px] leading-relaxed text-slate-400">
                Lighthouse-style: server fetch + iframe Performance API for migrated pane.
              </p>
            </CardContent>
          </Card>
        </div>

        {isLanding ? (
          <p className="mt-3 text-center text-xs leading-relaxed text-slate-500">
            Migrated preview uses raw HTML document replay for pixel-perfect Elementor CSS/JS.
          </p>
        ) : null}
      </div>
    </div>
  );
}
