import { Laptop, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type ViewportPreset = "desktop" | "tablet" | "mobile";

export const VIEWPORT_WIDTHS: Record<ViewportPreset, number | null> = {
  desktop: null,
  tablet: 768,
  mobile: 375,
};

const PRESETS: {
  id: ViewportPreset;
  icon: typeof Laptop;
  label: string;
}[] = [
  { id: "desktop", icon: Laptop, label: "Desktop" },
  { id: "tablet", icon: Tablet, label: "Tablet" },
  { id: "mobile", icon: Smartphone, label: "Mobile" },
];

export function ResponsiveViewportToolbar({
  value,
  onChange,
}: {
  value: ViewportPreset;
  onChange: (preset: ViewportPreset) => void;
}) {
  return (
    <div
      className="flex items-center rounded-md border border-slate-200 bg-slate-50 p-0.5 gap-2"
      role="group"
      aria-label="Responsive preview size"
    >
      {PRESETS.map(({ id, icon: Icon, label }) => (
        <Button
          key={id}
          type="button"
          variant="ghost"
          size="icon"
          className={cn(
            "size-8 text-slate-600",
            value === id && "bg-white text-slate-900 shadow-sm",
          )}
          title={`${label} preview`}
          aria-label={`${label} preview`}
          aria-pressed={value === id}
          onClick={() => onChange(id)}
        >
          <Icon className="size-4" />
        </Button>
      ))}
    </div>
  );
}

/** Constrains iframe content to a device width for side-by-side responsive testing. */
export function ViewportFrame({
  viewport,
  children,
}: {
  viewport: ViewportPreset;
  children: React.ReactNode;
}) {
  const width = VIEWPORT_WIDTHS[viewport];

  if (!width) {
    return <div className="h-full min-h-0 w-full">{children}</div>;
  }

  return (
    <div className="flex h-full min-h-0 justify-center overflow-auto bg-slate-100/90">
      <div
        className="h-full shrink-0 border-x border-slate-200/80 bg-white shadow-sm"
        style={{ width }}
      >
        {children}
      </div>
    </div>
  );
}
