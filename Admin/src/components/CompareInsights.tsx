import { useCallback, useEffect, useId, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
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

function builderTone(id?: string): string {
  if (id === "elementor") return "bg-coral-soft text-coral";
  if (id === "gutenberg") return "bg-teal-soft text-teal-ink";
  if (id === "classic") return "bg-navy-soft text-navy";
  if (id === "grapejs") return "bg-navy-soft text-navy";
  return "bg-studio-row text-studio-muted";
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

function SplitPane({
  title,
  url,
  badge,
  loadMs,
  onLoadMs,
  widthPct,
}: {
  title: string;
  url: string | null;
  badge: string;
  loadMs: number | null;
  onLoadMs: (ms: number) => void;
  widthPct?: number;
}) {
  const [startedAt] = useState(() => Date.now());
  const [failed, setFailed] = useState(false);

  return (
    <section
      className="relative flex min-h-0 min-w-0 flex-col overflow-hidden bg-studio-surface"
      style={widthPct != null ? { width: `${widthPct}%`, flex: "none" } : { flex: "1 1 0%" }}
    >
      <header className="flex shrink-0 items-center gap-2 border-b border-studio-border bg-[color-mix(in_srgb,var(--color-studio-row)_55%,var(--color-studio-surface))] px-3 py-2">
        <span className="flex items-center gap-1.5 pr-1" aria-hidden="true">
          <span className="size-2.5 rounded-full bg-[#ff5f57]" />
          <span className="size-2.5 rounded-full bg-[#febc2e]" />
          <span className="size-2.5 rounded-full bg-[#28c840]" />
        </span>
        <span className="rounded-full bg-navy-soft px-2 py-0.5 text-[0.65rem] font-bold tracking-wide text-navy uppercase">
          {badge}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate rounded-lg bg-studio-surface px-3 py-1 text-xs font-semibold text-studio-muted shadow-[inset_0_0_0_1px_var(--color-studio-border)]">
            {url ?? "URL unavailable"}
          </div>
        </div>
        <span className="hidden shrink-0 text-[0.7rem] font-bold text-studio-muted sm:inline">
          {loadMs != null ? formatMs(loadMs) : "…"}
        </span>
        {url ? (
          <a
            className="grid size-7 shrink-0 place-items-center rounded-full text-studio-muted transition hover:bg-studio-row hover:text-teal-ink"
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            title={`Open ${title}`}
            aria-label={`Open ${title} in new tab`}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2">
              <path d="M14 3h7v7" />
              <path d="M10 14L21 3" />
              <path d="M21 14v7H3V3h7" />
            </svg>
          </a>
        ) : null}
      </header>

      <div className="relative min-h-0 flex-1 bg-white">
        <p className="pointer-events-none absolute top-3 left-3 z-1 m-0 rounded-full bg-black/45 px-2.5 py-1 text-[0.65rem] font-bold tracking-wide text-white uppercase backdrop-blur-sm">
          {title}
        </p>
        {!url ? (
          <div className="grid h-full place-items-center px-6 text-center text-sm text-studio-muted">
            URL not available yet.
          </div>
        ) : failed ? (
          <div className="grid h-full place-items-center gap-3 px-6 text-center">
            <p className="m-0 text-sm text-studio-muted">
              This site blocked embedding (X-Frame-Options / CSP). Open it in a new tab instead.
            </p>
            <a className="font-bold text-teal-ink hover:underline" href={url} target="_blank" rel="noopener noreferrer">
              {url}
            </a>
          </div>
        ) : (
          <iframe
            key={url}
            title={title}
            src={url}
            className="h-full w-full border-0 bg-white"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
            referrerPolicy="no-referrer-when-downgrade"
            onLoad={() => onLoadMs(Date.now() - startedAt)}
            onError={() => setFailed(true)}
          />
        )}
      </div>
    </section>
  );
}

function InsightBlock({
  label,
  insight,
  editor,
}: {
  label: string;
  insight: PageInsight | null;
  editor?: { id: string; label: string };
}) {
  if (!insight) {
    return (
      <div>
        <h3 className="mt-0 mb-2 text-sm font-bold">{label}</h3>
        <p className="m-0 text-sm text-studio-muted">No report yet.</p>
      </div>
    );
  }

  if (!insight.ok) {
    return (
      <div>
        <h3 className="mt-0 mb-2 text-sm font-bold">{label}</h3>
        <p className="m-0 rounded-[1rem] bg-danger-soft px-3 py-2 text-sm font-semibold text-danger">
          {insight.error ?? "Failed to analyze"}
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <h3 className="m-0 text-sm font-bold">{label}</h3>
        <span className={cx("rounded-full px-2.5 py-1 text-[0.7rem] font-bold capitalize", riskTone(insight.clsRiskLabel))}>
          CLS {insight.clsRiskLabel}
        </span>
        {editor ? (
          <span
            className={cx(
              "rounded-full px-2.5 py-1 text-[0.7rem] font-bold tracking-wide",
              builderTone(editor.id),
            )}
            title={`${editor.label} editor`}
          >
            {editor.label}
          </span>
        ) : null}
      </div>
      {insight.title ? <p className="mt-0 mb-3 text-sm text-studio-muted">{insight.title}</p> : null}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        <MetricCard label="TTFB" value={formatMs(insight.ttfbMs)} />
        <MetricCard label="HTML fetch" value={formatMs(insight.downloadMs)} />
        <MetricCard label="HTML size" value={formatBytes(insight.htmlBytes)} />
        <MetricCard label="CLS risk" value={`${insight.clsRisk ?? "—"}`} hint="Heuristic" />
        <MetricCard label="Images" value={`${insight.images ?? 0}`} hint={`${insight.imagesMissingSize ?? 0} missing size`} />
        <MetricCard label="Scripts" value={`${insight.scripts ?? 0}`} hint={`${insight.stylesheets ?? 0} CSS`} />
      </div>
    </div>
  );
}

function ResultsPopup({
  open,
  onClose,
  report,
  busy,
  error,
  origLoadMs,
  migLoadMs,
  onRefresh,
  titleId,
}: {
  open: boolean;
  onClose: () => void;
  report: CompareInsightsResponse | null;
  busy: boolean;
  error: string | null;
  origLoadMs: number | null;
  migLoadMs: number | null;
  onRefresh: () => void;
  titleId: string;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  const builder = report?.pageBuilder;

  return (
    <div
      className="fixed inset-0 z-[120] grid place-items-center bg-black/40 p-4 backdrop-blur-[6px] animate-[compare-fade_180ms_ease-out]"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[min(88vh,52rem)] w-full max-w-3xl flex-col overflow-hidden rounded-[1.75rem] bg-studio-surface shadow-[0_24px_80px_rgba(15,23,42,0.28)] animate-[compare-pop_220ms_cubic-bezier(0.22,1,0.36,1)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-studio-border px-5 py-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="m-0 text-lg font-extrabold tracking-tight">
              Compare results
            </h2>
            <p className="mt-0.5 mb-0 flex flex-wrap items-center gap-2 text-xs text-studio-muted">
              <span>
                {report?.measuredAt
                  ? `Measured ${new Date(report.measuredAt).toLocaleString()}`
                  : busy
                    ? "Measuring…"
                    : "Insights for original vs migrated"}
              </span>
              {builder ? (
                <span
                  className={cx(
                    "inline-flex items-center rounded-full px-2.5 py-0.5 text-[0.68rem] font-bold",
                    builderTone(builder.id),
                  )}
                  title={`Detected from export ${builder.source}`}
                >
                  Editor: {builder.label}
                </span>
              ) : null}
            </p>
          </div>
          <Button type="button" variant="outline" size="sm" disabled={busy} onClick={onRefresh}>
            {busy ? "Measuring…" : "Refresh"}
          </Button>
          <button
            type="button"
            className="grid size-9 place-items-center rounded-full border-0 bg-transparent text-2xl text-studio-muted transition hover:bg-coral-soft hover:text-coral"
            onClick={onClose}
            aria-label="Close results"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          {error ? (
            <div className="mb-4 rounded-[1.125rem] bg-danger-soft px-4 py-3 text-sm font-semibold text-danger">
              {error}
            </div>
          ) : null}

          {busy && !report ? (
            <p className="m-0 text-sm text-studio-muted">Collecting load & CLS insights…</p>
          ) : null}

          {builder ? (
            <section className="mb-5 rounded-[1.25rem] bg-studio-row px-4 py-3">
              <p className="m-0 text-[0.72rem] font-semibold tracking-wide text-studio-muted uppercase">
                Source page builder
              </p>
              <p className="mt-1 mb-0 text-base font-extrabold tracking-tight">{builder.label}</p>
              <p className="mt-1 mb-0 text-xs text-studio-muted">
                {builder.id === "gutenberg"
                  ? "Block editor (Gutenberg / FSE). Section CSS comes from wp-block-library + theme styles."
                  : builder.id === "elementor"
                    ? "Elementor page builder. Kit/post CSS and widget assets drive layout."
                    : builder.id === "classic"
                      ? "Classic / theme templates (may still include Gutenberg blocks on some pages)."
                      : "Builder could not be detected from the export manifest."}
              </p>
            </section>
          ) : null}

          {report?.deltas && report.deltas.length > 0 ? (
            <section className="mb-5 overflow-hidden rounded-[1.25rem] bg-studio-row">
              <div className="border-b border-studio-border px-4 py-3">
                <h3 className="m-0 text-sm font-bold">Deltas</h3>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-sm">
                  <thead>
                    <tr>
                      <th className="px-4 py-2.5 text-left font-medium text-studio-muted">Metric</th>
                      <th className="px-4 py-2.5 text-left font-medium text-studio-muted">Original</th>
                      <th className="px-4 py-2.5 text-left font-medium text-studio-muted">Migrated</th>
                    </tr>
                  </thead>
                  <tbody>
                    {report.deltas.map((d) => (
                      <tr key={d.label} className="border-t border-studio-border">
                        <td className="px-4 py-2.5 font-semibold">{d.label}</td>
                        <td className="px-4 py-2.5">{d.original}</td>
                        <td className="px-4 py-2.5">{d.migrated}</td>
                      </tr>
                    ))}
                    <tr className="border-t border-studio-border">
                      <td className="px-4 py-2.5 font-semibold">Browser iframe load</td>
                      <td className="px-4 py-2.5">{formatMs(origLoadMs ?? undefined)}</td>
                      <td className="px-4 py-2.5">{formatMs(migLoadMs ?? undefined)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}

          <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
            <InsightBlock
              label="Original"
              insight={report?.original ?? null}
              editor={
                builder && builder.id !== "unknown"
                  ? { id: builder.id, label: builder.label }
                  : undefined
              }
            />
            <InsightBlock
              label="Migrated"
              insight={report?.migrated ?? null}
              editor={{ id: "grapejs", label: "GrapeJS" }}
            />
          </div>
        </div>
      </div>
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
  const [resultsOpen, setResultsOpen] = useState(false);
  const [leftPct, setLeftPct] = useState(50);
  const [dragging, setDragging] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const splitRef = useRef<HTMLDivElement | null>(null);
  const titleId = useId();

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const apply = () => setIsDesktop(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

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

  const onResizePointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const el = splitRef.current;
    if (!el) return;
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onResizePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!dragging) return;
    const el = splitRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0) return;
    const next = ((e.clientX - rect.left) / rect.width) * 100;
    setLeftPct(Math.min(78, Math.max(22, next)));
  };

  const onResizePointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    setDragging(false);
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
  };

  const displayName = meta?.name ?? project.slug;
  const deltaCount = report?.deltas?.length ?? 0;
  const builderLabel = report?.pageBuilder?.label;
  const dockHint = busy
    ? "Measuring…"
    : [builderLabel, deltaCount > 0 ? `${deltaCount} metrics` : null].filter(Boolean).join(" · ") ||
      "Insights";

  return (
    <div className="relative flex h-full min-h-[70vh] flex-col overflow-hidden rounded-[1.5rem] bg-studio-surface shadow-studio md:min-h-0">
      <style>{`
        @keyframes compare-fade { from { opacity: 0 } to { opacity: 1 } }
        @keyframes compare-pop { from { opacity: 0; transform: translateY(12px) scale(0.96) } to { opacity: 1; transform: none } }
        @keyframes compare-dock { from { opacity: 0; transform: translateX(-50%) translateY(10px) scale(0.96) } to { opacity: 1; transform: translateX(-50%) translateY(0) scale(1) } }
      `}</style>

      <div className="flex shrink-0 items-center gap-2 border-b border-studio-border px-3 py-2.5">
        <Button type="button" variant="ghost" size="sm" onClick={onBack}>
          ← Back
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="m-0 truncate text-sm font-extrabold tracking-tight">{displayName}</h1>
          <p className="m-0 truncate text-[0.7rem] text-studio-muted">
            Split compare · original vs migrated
            {builderLabel ? ` · ${builderLabel}` : ""}
          </p>
        </div>
        {!originalUrl || !migratedUrl ? (
          <span className="hidden rounded-full bg-coral-soft px-2.5 py-1 text-[0.65rem] font-bold text-coral sm:inline">
            {!originalUrl ? "Missing source URL" : "Start editor for migrated URL"}
          </span>
        ) : null}
      </div>

      <div
        ref={splitRef}
        className={cx(
          "relative flex min-h-0 flex-1 flex-col md:flex-row",
          dragging && "select-none",
        )}
      >
        <SplitPane
          title="Original WordPress"
          badge="Source"
          url={originalUrl}
          loadMs={origLoadMs}
          onLoadMs={setOrigLoadMs}
          widthPct={isDesktop ? leftPct : undefined}
        />

        {/* Drag handle — desktop only */}
        <div className={cx("relative z-20 hidden w-0 shrink-0 md:block", dragging ? "cursor-col-resize" : null)}>
          <div
            role="separator"
            aria-orientation="vertical"
            aria-valuenow={Math.round(leftPct)}
            aria-valuemin={22}
            aria-valuemax={78}
            aria-label="Resize compare panes"
            tabIndex={0}
            className="absolute top-0 bottom-0 left-1/2 z-30 flex w-3 -translate-x-1/2 cursor-col-resize touch-none items-center justify-center"
            onPointerDown={onResizePointerDown}
            onPointerMove={onResizePointerMove}
            onPointerUp={onResizePointerUp}
            onPointerCancel={onResizePointerUp}
            onDoubleClick={() => setLeftPct(50)}
            onKeyDown={(e) => {
              if (e.key === "ArrowLeft") setLeftPct((v) => Math.max(22, v - 2));
              if (e.key === "ArrowRight") setLeftPct((v) => Math.min(78, v + 2));
            }}
          >
            <span
              className={cx(
                "h-full w-px bg-[color-mix(in_srgb,var(--color-studio-border)_80%,transparent)]",
                dragging && "bg-coral",
              )}
            />
            <span
              className={cx(
                "absolute grid size-7 place-items-center rounded-full border border-studio-border bg-studio-surface text-studio-muted shadow-studio",
                dragging && "border-coral bg-coral text-white",
              )}
            >
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                <rect x="7" y="5" width="2.5" height="14" rx="1" />
                <rect x="14.5" y="5" width="2.5" height="14" rx="1" />
              </svg>
            </span>
          </div>
        </div>

        <SplitPane
          title="Migrated GrapeJS"
          badge="Migrated"
          url={migratedUrl}
          loadMs={migLoadMs}
          onLoadMs={setMigLoadMs}
          widthPct={isDesktop ? 100 - leftPct : undefined}
        />

        <div className="pointer-events-none absolute bottom-4 left-1/2 z-30 -translate-x-1/2 md:bottom-5">
          <button
            type="button"
            className={cx(
              "pointer-events-auto flex h-11 min-w-[13.5rem] items-center gap-2.5 px-4",
              "rounded-full border border-white/35 bg-white/18 text-studio-text",
              "shadow-[0_8px_28px_rgba(15,23,42,0.14),inset_0_1px_0_rgba(255,255,255,0.55)]",
              "backdrop-blur-xl backdrop-saturate-150",
              "transition duration-200 hover:-translate-y-0.5 hover:bg-white/28 hover:shadow-[0_12px_32px_rgba(15,23,42,0.18)]",
              "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral",
              "animate-[compare-dock_280ms_cubic-bezier(0.22,1,0.36,1)]",
            )}
            onClick={() => setResultsOpen(true)}
            aria-haspopup="dialog"
            aria-expanded={resultsOpen}
            title="Open compare results"
          >
            <span className="grid size-7 shrink-0 place-items-center rounded-full bg-studio-text/90 text-studio-surface shadow-sm">
              {busy ? (
                <span className="size-3.5 animate-spin rounded-full border-2 border-white/30 border-t-white" aria-hidden="true" />
              ) : (
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden="true">
                  <path d="M4 6h7v12H4zM13 6h7v12h-7z" />
                  <path d="M10 12h4" />
                </svg>
              )}
            </span>
            <span className="flex min-w-0 flex-1 items-baseline gap-2">
              <span className="text-[0.78rem] font-extrabold tracking-wide uppercase">Results</span>
              <span className="truncate text-[0.72rem] font-semibold text-studio-muted">{dockHint}</span>
            </span>
          </button>
        </div>
      </div>

      <ResultsPopup
        open={resultsOpen}
        onClose={() => setResultsOpen(false)}
        report={report}
        busy={busy}
        error={error}
        origLoadMs={origLoadMs}
        migLoadMs={migLoadMs}
        onRefresh={() => void runReport()}
        titleId={titleId}
      />
    </div>
  );
}
