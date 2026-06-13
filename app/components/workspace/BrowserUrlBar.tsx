import { ExternalLink, Lock } from "lucide-react";
import { cn } from "@/lib/utils";

interface BrowserUrlBarProps {
  url: string;
  className?: string;
  /** Shown when iframe is cross-origin and URL may be stale. */
  crossOrigin?: boolean;
}

/** Compact read-only address bar (browser chrome). */
export function BrowserUrlBar({ url, className, crossOrigin }: BrowserUrlBarProps) {
  const openable =
    url.startsWith("http://") ||
    url.startsWith("https://") ||
    url.startsWith("/");

  return (
    <div
      className={cn(
        "flex min-w-0 items-center gap-1.5 border-t border-slate-100 bg-slate-50 px-2 py-1.5",
        className,
      )}
    >
      {crossOrigin ? (
        <span title="Cross-origin">
          <Lock className="size-3 shrink-0 text-slate-400" aria-hidden />
        </span>
      ) : null}
      <div
        className="min-w-0 flex-1 truncate rounded-md border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] text-slate-700"
        title={url}
      >
        {url || "—"}
      </div>
      {openable && url !== "—" ? (
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-200 hover:text-slate-800"
          title="Open in new tab"
        >
          <ExternalLink className="size-3.5" />
        </a>
      ) : null}
    </div>
  );
}
