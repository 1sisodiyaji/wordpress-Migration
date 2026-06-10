import type { ComponentProps } from "react";
import { Group, Panel, Separator } from "react-resizable-panels";
import { cn } from "@/lib/utils";

function ResizablePanelGroup({
  className,
  ...props
}: ComponentProps<typeof Group>) {
  return <Group className={cn("flex h-full w-full scrollbar-none p-2", className)} {...props} />;
}

function ResizablePanel({
  className,
  ...props
}: ComponentProps<typeof Panel>) {
  return (
    <Panel className={cn("flex min-h-0 flex-col scrollbar-none rounded-xl border border-gray-200", className)} {...props} />
  );
}

function ResizableHandle({
  className,
  ...props
}: ComponentProps<typeof Separator>) {
  return (
    <Separator
      className={cn(
        "relative z-10 w-2 shrink-0 bg-slate-200 after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500/40 data-[separator]:bg-slate-100 scrollbar-none",
        className,
      )}
      {...props}
    />
  );
}

export { ResizableHandle, ResizablePanel, ResizablePanelGroup };
