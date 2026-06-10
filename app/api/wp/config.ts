import path from "node:path";
import { getSiteDataDir, getSitePublicDir, getSitePublicUrlPrefix } from "./sites";

/** Current migrate target — always read at call time (batch runs change WORDPRESS_URL). */
export function getWpUrl(): string {
  return (process.env.WORDPRESS_URL ?? "http://localhost:8080").replace(
    /\/$/,
    "",
  );
}

export function getGraphqlUrl(): string {
  return process.env.WORDPRESS_GRAPHQL_URL ?? `${getWpUrl()}/graphql`;
}

/** @deprecated Use getWpUrl() — frozen at first import in long-lived processes */
export const WP_URL = getWpUrl();

export const GRAPHQL_URL = getGraphqlUrl();

export function getActiveSiteSlug(): string | undefined {
  return process.env.SITE_SLUG;
}

export function getMigratedDataDir(siteSlug?: string): string {
  const slug = siteSlug ?? getActiveSiteSlug();
  if (slug) return getSiteDataDir(slug);
  return path.join(process.cwd(), "src", "data", "migrated");
}

export function getMigratedPublicDir(siteSlug?: string): string {
  const slug = siteSlug ?? getActiveSiteSlug();
  if (slug) return getSitePublicDir(slug);
  return path.join(process.cwd(), "public", "wp-migrated");
}

export function getMigratedPublicUrlPrefix(siteSlug?: string): string {
  const slug = siteSlug ?? getActiveSiteSlug();
  if (slug) return getSitePublicUrlPrefix(slug);
  return "/wp-migrated";
}

/** @deprecated use getMigratedDataDir() */
export const MIGRATED_DATA_DIR = getMigratedDataDir();

/** @deprecated use getMigratedPublicDir() */
export const MIGRATED_PUBLIC_DIR = getMigratedPublicDir();
