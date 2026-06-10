import path from "node:path";
import { getSiteDataDir, getSitePublicDir, getSitePublicUrlPrefix } from "./sites";

export const WP_URL = (
  process.env.WORDPRESS_URL ?? "http://localhost:8080"
).replace(/\/$/, "");

export const GRAPHQL_URL =
  process.env.WORDPRESS_GRAPHQL_URL ?? `${WP_URL}/graphql`;

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
