import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const LOAD_TIMEOUT_MS = 45_000;

interface IframePaneProps {
  title: string;
  src: string;
  reloadKey?: number | string;
  sandbox?: string;
  onLoad?: () => void;
  /** Keep overlay visible while parent work runs (e.g. preview HTML rebuild). */
  forceLoading?: boolean;
  className?: string;
}

/** iframe with loading overlay until the document finishes loading. */
export function IframePane({
  title,
  src,
  reloadKey = 0,
  sandbox,
  onLoad,
  forceLoading = false,
  className,
}: IframePaneProps) {
  const [loading, setLoading] = useState(true);
  const [timedOut, setTimedOut] = useState(false);
  const [timeoutDismissed, setTimeoutDismissed] = useState(false);
  const showOverlay = loading || forceLoading;

  useEffect(() => {
    setLoading(true);
    setTimedOut(false);
    setTimeoutDismissed(false);

    const timer = window.setTimeout(() => {
      setTimedOut(true);
      setLoading(false);
    }, LOAD_TIMEOUT_MS);

    return () => window.clearTimeout(timer);
  }, [src, reloadKey]);

  return (
    <div className={cn("relative h-full w-full min-h-0", className)}>
      {showOverlay ? (
        <div
          className="absolute inset-0 z-10 flex flex-col items-center justify-center gap-3 bg-slate-50"
          aria-live="polite"
          aria-busy="true"
        >
          <Loader2 className="size-8 animate-spin text-blue-600" aria-hidden />
          <p className="text-sm text-slate-500">
            {forceLoading ? `Refreshing ${title}…` : `Loading ${title}…`}
          </p>
        </div>
      ) : null}

      {timedOut && !timeoutDismissed ? (
        <div className="absolute inset-x-0 top-0 z-20 flex items-center gap-2 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
          <p className="min-w-0 flex-1 text-center">
            {title} is taking longer than expected — content may still be loading.
          </p>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-6 shrink-0 text-amber-800 hover:bg-amber-100 hover:text-amber-900"
            title="Dismiss"
            aria-label="Dismiss loading notice"
            onClick={() => setTimeoutDismissed(true)}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : null}

      <iframe
        key={reloadKey}
        title={title}
        src={src}
        className="h-full w-full border-0 bg-white"
        sandbox={sandbox}
        onLoad={() => {
          setLoading(false);
          setTimedOut(false);
          onLoad?.();
        }}
      />
    </div>
  );
}
