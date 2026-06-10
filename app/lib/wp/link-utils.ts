import { WP_URL } from "@/api/wp/config";

const SITE_HOSTS = new Set([
  new URL(WP_URL).hostname,
  "radius-ois.ai",
  "www.radius-ois.ai",
  "localhost",
]);

export function isInternalHref(href: string | undefined): boolean {
  if (!href || href.startsWith("#") || href.startsWith("mailto:") || href.startsWith("tel:")) {
    return false;
  }
  if (href.startsWith("/")) return true;
  try {
    const host = new URL(href, WP_URL).hostname;
    return SITE_HOSTS.has(host);
  } catch {
    return false;
  }
}

export function toAppPath(href: string): string {
  if (href.startsWith("/")) return href;
  try {
    const u = new URL(href, WP_URL);
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return href;
  }
}

/** @deprecated Use toAppPath */
export const toNextPath = toAppPath;

export function normalizeImageSrc(src: string | undefined): string {
  if (!src) return "";
  let s = src.trim();
  s = s.replace(/https:https:\/\//gi, "https://");
  s = s.replace(/http:https:\/\//gi, "https://");
  if (s.startsWith("//")) return `https:${s}`;
  return s;
}
