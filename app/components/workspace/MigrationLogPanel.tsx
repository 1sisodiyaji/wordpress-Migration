import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  migrationLogsPollPath,
  type MigrationLogSiteEntry,
  type MigrationLogsPayload,
} from "@/lib/migration-logs-poll";
import { cn } from "@/lib/utils";

interface MigrationLogPanelProps {
  slug: string;
  open: boolean;
  onClose: () => void;
  onComplete?: () => void;
}

/** Live migration log stream for the workspace (polls /migrate/:slug/logs). */
export function MigrationLogPanel({
  slug,
  open,
  onClose,
  onComplete,
}: MigrationLogPanelProps) {
  const [logs, setLogs] = useState("");
  const [phase, setPhase] = useState<string | null>(null);
  const [entry, setEntry] = useState<MigrationLogSiteEntry | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(
    null,
  );
  const logRef = useRef<HTMLPreElement>(null);
  const completedRef = useRef(false);

  useEffect(() => {
    if (!open) return;

    let cancelled = false;
    completedRef.current = false;

    const poll = async () => {
      try {
        const res = await fetch(
          `${migrationLogsPollPath(slug)}?t=${Date.now()}`,
          { cache: "no-store", headers: { Accept: "application/json" } },
        );
        if (!res.ok || cancelled) return;
        const contentType = res.headers.get("content-type") ?? "";
        if (!contentType.includes("application/json")) return;
        const data = (await res.json()) as MigrationLogsPayload;
        setLogs(data.logs);
        setPhase(data.phase);
        setEntry(data.entry ?? null);
        setProgress(data.progress);

        if (
          data.entry?.status === "ready" &&
          data.hasData &&
          !completedRef.current
        ) {
          completedRef.current = true;
          onComplete?.();
        }
      } catch {
        /* retry */
      }
    };

    poll();
    const interval = setInterval(poll, 1000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [slug, open, onComplete]);

  useEffect(() => {
    const el = logRef.current;
    if (el && open) el.scrollTop = el.scrollHeight;
  }, [logs, open]);

  if (!open) return null;

  const isRunning = entry?.status === "migrating";
  const failed = entry?.status === "failed";
  const progressPct =
    progress && progress.total > 0
      ? Math.round((progress.done / progress.total) * 100)
      : 0;

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-30 flex max-h-[45%] flex-col border-t border-slate-200 bg-white shadow-[0_-8px_30px_rgba(15,23,42,0.08)]"
      role="region"
      aria-label="Migration logs"
    >
      <div className="flex shrink-0 items-center justify-between gap-2 border-b border-slate-100 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {isRunning ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-blue-600" />
          ) : null}
          <span className="truncate text-sm font-medium text-slate-800">
            {failed
              ? "Scrape failed"
              : isRunning
                ? "Scraping live site…"
                : "Scrape logs"}
          </span>
          {phase ? (
            <span className="truncate text-xs italic text-slate-500">{phase}</span>
          ) : null}
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {progress && progress.total > 0 ? (
            <span className="text-xs tabular-nums text-slate-500">
              {progress.done}/{progress.total} ({progressPct}%)
            </span>
          ) : null}
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7"
            title="Hide logs"
            onClick={onClose}
          >
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {progress && progress.total > 0 ? (
        <div className="shrink-0 px-3 pb-2">
          <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-linear-to-r from-blue-600 to-violet-600 transition-[width] duration-300"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      ) : null}

      {failed && entry?.error ? (
        <p className="shrink-0 px-3 pb-2 text-xs text-red-600" role="alert">
          {entry.error}
        </p>
      ) : null}

      <pre
        ref={logRef}
        className={cn(
          "min-h-0 flex-1 overflow-auto px-3 pb-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-slate-700",
        )}
      >
        {logs || "Starting scrape worker…"}
      </pre>
    </div>
  );
}

/** Collapsed strip to re-open logs while migration may still be running. */
export function MigrationLogToggle({
  open,
  onToggle,
  scraping,
}: {
  open: boolean;
  onToggle: () => void;
  scraping: boolean;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      className="gap-1.5"
      onClick={onToggle}
    >
      {scraping ? <Loader2 className="size-3.5 animate-spin" /> : null}
      {open ? <ChevronDown className="size-3.5" /> : <ChevronUp className="size-3.5" />}
      {scraping ? "Scraping…" : open ? "Hide logs" : "Show scrape logs"}
    </Button>
  );
}
