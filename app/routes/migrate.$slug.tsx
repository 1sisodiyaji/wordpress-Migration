import { useEffect, useRef, useState } from "react";
import {
  Form,
  Link,
  redirect,
  useLoaderData,
  useNavigate,
} from "react-router";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { Route } from "./+types/migrate.$slug";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { migrationLogsPollPath } from "@/lib/migration-logs-poll";
import { readMigrationLog } from "@/api/wp/migration-log";
import { readMigrationStatus } from "@/api/wp/migration-status";
import { startMigration } from "@/api/migration/start-migration.server";
import type { SiteEntry } from "@/api/wp/sites";
import { getSite, siteHasData } from "@/api/wp/sites";
import {
  formatCrawlDuration,
  formatCrawlEstimate,
} from "@/lib/migration-estimate";
import { cn } from "@/lib/utils";

export async function loader({ params }: Route.LoaderArgs) {
  const slug = params.slug!;
  const entry = getSite(slug);

  if (!entry) {
    throw new Response("Unknown project", { status: 404 });
  }

  if (entry.status === "ready" && siteHasData(slug)) {
    throw redirect(
      entry.stage === "full" ? `/${slug}` : `/workspace/${slug}`,
    );
  }

  return {
    slug,
    entry,
    logs: readMigrationLog(slug),
    phase: readMigrationStatus(slug)?.phase ?? null,
  };
}

export async function action({ request, params }: Route.ActionArgs) {
  const slug = params.slug!;
  const form = await request.formData();
  const intent = String(form.get("intent") ?? "retry");

  if (intent === "delete") {
    const { deleteSite } = await import("@/api/wp/sites");
    deleteSite(slug);
    throw redirect("/");
  }

  const entry = getSite(slug);
  if (!entry) return { error: "Project not found." };

  startMigration(
    entry.url,
    true,
    entry.stage === "full" ? "full" : "landing",
  );
  throw redirect(`/migrate/${slug}`);
}

type PollPayload = {
  logs: string;
  entry: SiteEntry | null;
  phase: string | null;
  progress: { done: number; total: number } | null;
  hasData: boolean;
};

function StatusBadge({ status }: { status: SiteEntry["status"] }) {
  const styles = {
    ready: "bg-emerald-50 text-emerald-700 ring-emerald-600/10",
    migrating: "bg-blue-50 text-blue-700 ring-blue-600/10",
    failed: "bg-red-50 text-red-700 ring-red-600/10",
  }[status];

  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide ring-1 ring-inset",
        styles,
      )}
    >
      {status}
    </span>
  );
}

export default function MigrateProgress({ loaderData }: Route.ComponentProps) {
  const { slug } = loaderData;
  const [logs, setLogs] = useState(loaderData.logs);
  const [entry, setEntry] = useState(loaderData.entry);
  const [phase, setPhase] = useState(loaderData.phase);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const logRef = useRef<HTMLPreElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `${migrationLogsPollPath(slug)}?t=${Date.now()}`,
          { cache: "no-store", headers: { Accept: "application/json" } },
        );
        if (!res.ok || cancelled) return;
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) return;
        const data = (await res.json()) as PollPayload;
        setLogs(data.logs);
        if (data.entry) setEntry(data.entry);
        setPhase(data.phase);
        setProgress(data.progress);

        if (data.entry?.status === "ready" && data.hasData) {
          const dest =
            data.entry.stage === "full" ? `/${slug}` : `/workspace/${slug}`;
          navigate(dest, { replace: true });
        }
      } catch {
        /* retry on next tick */
      }
    };

    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [slug, navigate]);

  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [logs]);

  const failed = entry.status === "failed";
  const isRunning = entry.status === "migrating";
  const progressPct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;
  const totalPages = progress?.total ?? entry.routes ?? 0;
  const crawlEstimate =
    totalPages > 0 && isRunning ? formatCrawlEstimate(totalPages) : null;

  const title = failed
    ? "Migration failed"
    : isRunning
      ? "Cloning website…"
      : "Finishing up…";

  return (
    <div className="platform-ui relative min-h-screen overflow-hidden bg-[#f8fafd] font-sans text-slate-800 antialiased">
      <div
        aria-hidden
        className="pointer-events-none absolute -top-32 left-[10%] size-[28rem] rounded-full bg-blue-400/20 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute right-[5%] bottom-[8%] size-96 rounded-full bg-violet-400/15 blur-3xl"
      />

      <main className="relative z-10 mx-auto max-w-3xl px-5 py-8 sm:py-10">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2 gap-2">
          <Link to="/">
            <ArrowLeft className="size-4" />
            All projects
          </Link>
        </Button>

        <Card className="border-slate-200/80 bg-white/90 shadow-lg shadow-slate-200/40 backdrop-blur-sm">
          <CardHeader className="border-b border-slate-100 pb-4">
            <div className="flex flex-wrap items-center gap-3">
              <CardTitle className="text-xl font-semibold text-slate-900 sm:text-2xl">
                {title}
              </CardTitle>
              <StatusBadge status={entry.status} />
              {isRunning ? (
                <Loader2
                  className="size-4 animate-spin text-blue-600"
                  aria-hidden
                />
              ) : null}
            </div>
            <p className="truncate text-sm text-slate-500">{entry.url}</p>
          </CardHeader>

          <CardContent className="space-y-4 pt-4">
            <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
              {phase ? (
                <span className="italic text-slate-500">{phase}</span>
              ) : null}
              {entry.routes ? (
                <Badge variant="secondary">{entry.routes} routes</Badge>
              ) : null}
            </div>

            {progress && progress.total > 0 ? (
              <div className="space-y-2">
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-linear-to-r from-blue-600 to-violet-600 transition-[width] duration-300 ease-out"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
                <p className="text-xs text-slate-500 tabular-nums">
                  {progress.done} / {progress.total} pages ({progressPct}%)
                  {crawlEstimate ? (
                    <span className="text-slate-400">
                      {" "}
                      · {formatCrawlDuration(progress.total)}
                    </span>
                  ) : null}
                </p>
              </div>
            ) : null}

            {!failed && isRunning ? (
              <p className="text-sm leading-relaxed text-slate-500">
                {crawlEstimate ? (
                  <>
                    Crawling every page live — {crawlEstimate}. Logs update every
                    second; keep this tab open.
                  </>
                ) : (
                  <>
                    Discovering pages and preparing the crawl. Logs update every
                    second; keep this tab open.
                  </>
                )}
              </p>
            ) : null}

            {failed && entry.error ? (
              <p
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700"
                role="alert"
              >
                {entry.error}
              </p>
            ) : null}

            <pre
              ref={logRef}
              aria-live="polite"
              className="max-h-[min(28rem,50vh)] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-xs leading-relaxed whitespace-pre-wrap text-slate-700"
            >
              {logs || "Starting migration worker…"}
            </pre>

            <div className="flex flex-wrap gap-3 pt-1">
              {failed ? (
                <Form method="post">
                  <input type="hidden" name="intent" value="retry" />
                  <Button
                    type="submit"
                    className="bg-linear-to-r from-blue-600 to-violet-600 shadow-md shadow-blue-500/20 hover:from-blue-500 hover:to-violet-500"
                  >
                    Retry migration
                  </Button>
                </Form>
              ) : null}
              <Form
                method="post"
                onSubmit={(e) => {
                  if (
                    !confirm(
                      `Delete "${entry.name}" and all migrated files? This cannot be undone.`,
                    )
                  ) {
                    e.preventDefault();
                  }
                }}
              >
                <input type="hidden" name="intent" value="delete" />
                <Button type="submit" variant="outline" className="border-red-200 text-red-600 hover:bg-red-50 hover:text-red-700">
                  Delete project
                </Button>
              </Form>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
