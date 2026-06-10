import type { WpRoute } from "../../../app/api/wp/types";

export function maxMigratePages(): number {
  const n = Number(process.env.MIGRATE_MAX_PAGES ?? "150");
  if (!Number.isFinite(n) || n < 1) return 150;
  return Math.floor(n);
}

/** Keep homepage first; cap remaining routes for large sites. */
export function capRoutes(routes: WpRoute[]): WpRoute[] {
  const max = maxMigratePages();
  if (routes.length <= max) return routes;

  const home = routes.find((r) => r.path === "/");
  const rest = routes.filter((r) => r.path !== "/");
  const budget = home ? max - 1 : max;
  const kept = rest.slice(0, budget);
  const capped = home ? [home, ...kept] : kept;

  console.log(
    `  ⚠ Route cap: ${routes.length} discovered → ${capped.length} will be crawled (MIGRATE_MAX_PAGES=${max})`,
  );
  return capped;
}
