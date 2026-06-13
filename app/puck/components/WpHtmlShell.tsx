import { WpPageShell } from "@/components/wp/WpPageShell";
import type { WpHtmlShellProps } from "../wp-migration-types";

/**
 * Puck bridge: renders migrated WordPress page shell for a route.
 * CSS/JS loaded via WpPageShell + global asset manifests.
 */
export function WpHtmlShell({ routePath }: WpHtmlShellProps) {
  return <WpPageShell routePath={routePath} />;
}
