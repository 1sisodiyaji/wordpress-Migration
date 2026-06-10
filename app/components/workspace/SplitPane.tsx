import { useCallback, useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MIN_PANE_PX = 390;

interface SplitPaneProps {
  left: React.ReactNode;
  right: React.ReactNode;
  leftLabel?: React.ReactNode;
  rightLabel?: React.ReactNode;
  defaultRatio?: number;
  className?: string;
}

export function SplitPane({
  left,
  right,
  leftLabel,
  rightLabel,
  defaultRatio = 0.5,
  className,
}: SplitPaneProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [ratio, setRatio] = useState(defaultRatio);
  const dragging = useRef(false);
  const [isDragging, setIsDragging] = useState(false);

  const onPointerMove = useCallback((clientX: number) => {
    const el = containerRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const minRatio = MIN_PANE_PX / rect.width;
    const maxRatio = 1 - minRatio;
    const next = (clientX - rect.left) / rect.width;
    setRatio(Math.min(maxRatio, Math.max(minRatio, next)));
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      onPointerMove(e.clientX);
    };
    const onUp = () => {
      dragging.current = false;
      setIsDragging(false);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [onPointerMove]);

  return (
    <div ref={containerRef} className={cn("flex min-h-0 flex-1", className)}>
      <section
        className="flex min-h-0 flex-col"
        style={{ flex: ratio, minWidth: MIN_PANE_PX }}
      >
        {leftLabel}
        <div className="min-h-0 flex-1">{left}</div>
      </section>

      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="Click and drag to resize panes"
        className={cn(
          "relative z-10 w-2 shrink-0 cursor-col-resize bg-slate-200",
          isDragging && "bg-blue-500",
        )}
        onPointerDown={(e) => {
          e.preventDefault();
          dragging.current = true;
          setIsDragging(true);
          document.body.style.cursor = "col-resize";
          document.body.style.userSelect = "none";
        }}
      />

      <section
        className="flex min-h-0 flex-col"
        style={{ flex: 1 - ratio, minWidth: MIN_PANE_PX }}
      >
        {rightLabel}
        <div className="min-h-0 flex-1">{right}</div>
      </section>
    </div>
  );
}
