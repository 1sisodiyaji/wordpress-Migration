import { getStyles } from "@/api/wp/load-migrated";
import { useSiteSlug } from "@/lib/wp/site-context";

interface WpShellProps {
  children: React.ReactNode;
  classList?: string[];
}

/** Wraps content with WordPress body classes for pixel-perfect block theme parity. */
export function WpShell({ children, classList }: WpShellProps) {
  const site = useSiteSlug();
  const styles = getStyles(site);
  const bodyClasses = [
    ...(styles?.bodyClasses ?? []),
    "wp-site-blocks",
    ...(classList ?? []),
  ].join(" ");

  return (
    <div className={bodyClasses} data-wp-migrated="true">
      {children}
    </div>
  );
}
