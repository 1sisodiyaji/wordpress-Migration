import { useEffect, useState } from "react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { SplitPane } from "@/components/workspace/SplitPane";

const MIN_PANE_PX = 390;

interface WorkspaceSplitProps {
  left: React.ReactNode;
  right: React.ReactNode;
  leftLabel?: React.ReactNode;
  rightLabel?: React.ReactNode;
  className?: string;
}

/** shadcn resizable split with ~390px minimum per pane. */
export function WorkspaceSplit({
  left,
  right,
  leftLabel,
  rightLabel,
  className,
}: WorkspaceSplitProps) {
  // react-resizable-panels is client-only; avoid SSR/hydration React dispatcher mismatch.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  if (!mounted) {
    return <SplitPane {...{ left, right, leftLabel, rightLabel, className }} />;
  }

  return (
    <ResizablePanelGroup
      id="workspace-split"
      orientation="horizontal"
      className={className}
    >
      <ResizablePanel id="live" defaultSize="50%" minSize={`${MIN_PANE_PX}px`} className="flex flex-col">
        {leftLabel}
        <div className="min-h-0 flex-1 overflow-hidden">{left}</div>
      </ResizablePanel>
      <ResizableHandle />
      <ResizablePanel id="preview" defaultSize="50%" minSize={`${MIN_PANE_PX}px`} className="flex flex-col">
        {rightLabel}
        <div className="min-h-0 flex-1 overflow-hidden">{right}</div>
      </ResizablePanel>
    </ResizablePanelGroup>
  );
}
