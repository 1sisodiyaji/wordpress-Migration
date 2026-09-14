import { useCallback, useEffect, useState } from "react";
import type { Project } from "../api";
import { fetchCompareInsights, type CompareInsightsResponse, type PageInsight } from "../api";
import { Button } from "./ui";
import { cx } from "../lib/cx";

interface Props {
  project: Project;
  onBack: () => void;
}

function formatBytes(n?: number): string {
  if (n == null) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function formatMs(n?: number): string {
  if (n == null) return "—";
  return `${Math.round(n)} ms`;
}

function riskTone(label?: PageInsight["clsRiskLabel"]): string {
  if (label === "high") return "bg-danger-soft text-danger";
  if (label === "moderate") return "bg-coral-soft text-coral";
  return "bg-ok-soft text-ok";
}

function MetricCard({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: string;
}) {
  return (
    <article className="rounded-2xl bg-studio-row px-3.5 py-3">
      <p className="m-0 text-[0.72rem] font-semibold tracking-wide text-studio-muted uppercase">{label}</p>
      <p className={cx("mt-1 mb-0 text-xl font-extrabold tracking-tight", tone)}>{value}</p>
      {hint ? <p className="mt-1 mb-0 text-xs text-studio-muted">{hint}</p> : null}
    </article>
  );
}

function PreviewPane({
  title,
  url,
  badge,
  loadMs,
  onLoadMs,
}: {
  title: string;
  url: string | null;
  badge: string;
  loadMs: number | null;
  onLoadMs: (ms: number) => void;
}) {
  const [startedAt] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden rounded-[1.5rem] bg-studio-surface shadow-studio">
      <header className="flex flex-wrap items-center gap-2 border-b border-studio-border px-4 py-3">
        <span className="rounded-full bg-studio-row px-2.5 py-1 text-[0.7rem] font-bold text-studio-muted">
          {badge}
        </span>
        <h2 className="m-0 text-sm font-bold">{title}</h2>
        <span className="ml-auto text-xs font-semibold text-studio-muted">
          {loadMs != null ? `Load ${formatMs(loadMs)}` : "Loading…"}
        </span>
      </header>
      <div className="min-h-[22rem] flex-1 bg-[color-mix(in_srgb,var(--color-studio-row)_70%,transparent)]">
        {!url ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-studio-muted">
            URL not available yet.
          </div>
        ) : failed ? (
          <div className="grid h-full place-items-center gap-3 px-6 text-center">
            <p className="m-0 text-sm text-studio-muted">
              This site blocked embedding (X-Frame-Options / CSP). Open it in a new tab instead.
            </p>
            <a
              className="font-bold text-teal-ink hover:underline"
              href={url}
              target="_blank"
              rel="noopener noreferrer"
            >
              {url}
            </a>
          </div>
        ) : (
          <iframe
            key={url}
            title={title}
            src={url}
            className="h-full min-h-[22rem] w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => onLoadMs(Date.now() - startedAt)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
      {url ? (
        <footer className="truncate border-t border-studio-border px-4 py-2 text-xs text-studio-muted">
          <a className="font-semibold text-teal-ink hover:underline" href={url} target="_blank" rel="noopener noreferrer">
            {url}
          </a>
        </footer>
      ) : null}
    </section>
  );
}

function InsightColumn({ label, insight }: { label: string; insight: PageInsight | null }) {
  if (!insight) {
    return (
      <div className="rounded-[1.5rem] bg-studio-surface p-5 shadow-studio">
        <h3 className="mt-0 mb-2 text-sm font-bold">{label}</h3>
        <p className="m-0 text-sm text-studio-muted">No report yet.</p>
      </div>
    );
  }

  if (!insight.ok) {
    return (
      <div className="rounded-[1.5rem] bg-studio-surface p-5 shadow-studio">
        <h3 className="mt-0 mb-2 text-sm font-bold">{label}</h3>
        <p className="m-0 rounded-[1rem] bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {insight.error ?? "Failed to analyze"}
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-[1.5rem] bg-studio-surface p-5 shadow-studio">
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-sm font-bold">{label}</h3>
        <span className={cx("rounded-full px-2.5 py-1 text-[0.7rem] font-bold capitalize", riskTone(insight.clsRiskLabel))}>
          CLS risk {insight.clsRiskLabel}
        </span>
      </div>
      {insight.title ? <p className="mt-0 mb-3 text-sm text-studio-muted">{insight.title}</p> : null}

      <div className="mb-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <MetricCard label="TTFB" value={formatMs(insight.ttfbMs)} />
        <MetricCard label="HTML fetch" value={formatMs(insight.downloadMs)} />
        <MetricCard label="HTML size" value={formatBytes(insight.htmlBytes)} />
        <MetricCard label="CLS risk" value={`${insight.clsRisk ?? "—"}`} hint="Heuristic from HTML structure" />
        <MetricCard label="Images" value={`${insight.images ?? 0}`} hint={`${insight.imagesMissingSize ?? 0} missing size`} />
        <MetricCard label="Scripts" value={`${insight.scripts ?? 0}`} hint={`${insight.stylesheets ?? 0} CSS`} />
      </div>

      <h4 className="mt-0 mb-2 text-xs font-semibold tracking-wide text-studio-muted uppercase">Findings</h4>
      <ul className="m-0 list-disc space-y-1.5 pl-5 text-sm text-studio-muted">
        {(insight.findings ?? []).map((f, i) => (
          <li key={i}>{f}</li>
        ))}
      </ul>
      {insight.frameBlocked ? (
        <p className="mt-3 mb-0 rounded-[1rem] bg-studio-row px-3 py-2 text-xs text-studio-muted">
          Response headers block iframe embedding — preview may be blank; metrics above still apply.
        </p>
      ) : null}
    </div>
  );
}

export function CompareInsights({ project, onBack }: Props) {
  const meta = project.meta;
  const originalUrl = meta?.url?.trim() || null;
  const migratedUrl =
    project.editorUrl ?? (meta?.editorPort ? `http://localhost:${meta.editorPort}` : null);

  const [report, setReport] = useState<CompareInsightsResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [origLoadMs, setOrigLoadMs] = useState<number | null>(null);
  const [migLoadMs, setMigLoadMs] = useState<number | null>(null);

  const runReport = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      const data = await fetchCompareInsights(project.slug, {
        originalUrl: originalUrl ?? undefined,
        migratedUrl: migratedUrl ?? undefined,
      });
      setReport(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }, [project.slug, originalUrl, migratedUrl]);

  useEffect(() => {
    void runReport();
  }, [runReport]);

  const displayName = meta?.name ?? project.slug;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" onClick={onBack}>
          ← Back to project
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 text-lg font-extrabold tracking-tight">{displayName}</h1>
          <p className="m-0 text-sm text-studio-muted">Homepage compare · original vs migrated</p>
        </div>
        <Button type="button" variant="outline" disabled={busy} onClick={() => void runReport()}>
          {busy ? "Measuring…" : "Refresh insights"}
        </Button>
      </div>

      {error ? (
        <div className="rounded-[1.125rem] bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">{error}</div>
      ) : null}

      {!originalUrl || !migratedUrl ? (
        <div className="rounded-[1.125rem] bg-studio-surface px-4 py-3 text-sm text-studio-muted shadow-studio">
          {!originalUrl ? "Add a WordPress URL on the project first. " : null}
          {!migratedUrl
            ? "Start the editor so the migrated homepage URL is available."
            : null}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 xl:items-stretch">
        <PreviewPane
          title="Original WordPress"
          badge="Source"
          url={originalUrl}
          loadMs={origLoadMs}
          onLoadMs={setOrigLoadMs}
        />
        <PreviewPane
          title="Migrated GrapeJS"
          badge="Migrated"
          url={migratedUrl}
          loadMs={migLoadMs}
          onLoadMs={setMigLoadMs}
        />
      </div>

      {report?.deltas && report.deltas.length > 0 ? (
        <section className="overflow-hidden rounded-[1.5rem] bg-studio-surface shadow-studio">
          <div className="border-b border-studio-border px-4 py-3">
            <h2 className="m-0 text-sm font-bold">Comparison deltas</h2>
            <p className="mt-1 mb-0 text-xs text-studio-muted">
              Server-side HTML fetch · measured {new Date(report.measuredAt).toLocaleString()}
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr>
                  <th className="border-b border-studio-border px-4 py-2.5 text-left font-medium text-studio-muted">
                    Metric
                  </th>
                  <th className="border-b border-studio-border px-4 py-2.5 text-left font-medium text-studio-muted">
                    Original
                  </th>
                  <th className="border-b border-studio-border px-4 py-2.5 text-left font-medium text-studio-muted">
                    Migrated
                  </th>
                  <th className="border-b border-studio-border px-4 py-2.5 text-left font-medium text-studio-muted">
                    Edge
                  </th>
                </tr>
              </thead>
              <tbody>
                {report.deltas.map((d) => (
                  <tr key={d.label}>
                    <td className="border-b border-studio-border px-4 py-2.5 font-semibold">{d.label}</td>
                    <td className="border-b border-studio-border px-4 py-2.5">{d.original}</td>
                    <td className="border-b border-studio-border px-4 py-2.5">{d.migrated}</td>
                    <td className="border-b border-studio-border px-4 py-2.5 capitalize text-studio-muted">
                      {d.better === "same" ? "tie" : d.better}
                    </td>
                  </tr>
                ))}
                <tr>
                  <td className="px-4 py-2.5 font-semibold">Browser iframe load</td>
                  <td className="px-4 py-2.5">{formatMs(origLoadMs ?? undefined)}</td>
                  <td className="px-4 py-2.5">{formatMs(migLoadMs ?? undefined)}</td>
                  <td className="px-4 py-2.5 text-studio-muted">
                    {origLoadMs != null && migLoadMs != null
                      ? migLoadMs === origLoadMs
                        ? "tie"
                        : migLoadMs < origLoadMs
                          ? "migrated"
                          : "original"
                      : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <InsightColumn label="Original insights" insight={report?.original ?? null} />
        <InsightColumn label="Migrated insights" insight={report?.migrated ?? null} />
      </div>
    </div>
  );
}
