/** Shared migrate feature flags from environment. */
export function migrateFullSite(): boolean {
  return (
    process.env.MIGRATE_FULL_SITE === "1" ||
    process.env.MIGRATE_CRAWL_ALL === "1"
  );
}

export function migrateFullDesign(): boolean {
  return migrateFullSite() && process.env.MIGRATE_FULL_DESIGN !== "false";
}

export function migrateUseSitemap(): boolean {
  return process.env.MIGRATE_USE_SITEMAP !== "false";
}
