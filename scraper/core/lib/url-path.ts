/** WordPress `link` → Next.js route path (respects pretty permalinks & parent pages). */
export function linkToPath(link: string, siteHome: string): string {
  try {
    const pathname = new URL(link).pathname.replace(/\/$/, "") || "/";
    const homePath = new URL(siteHome).pathname.replace(/\/$/, "") || "";
    if (homePath && pathname.startsWith(homePath) && pathname !== homePath) {
      const trimmed = pathname.slice(homePath.length) || "/";
      return trimmed.startsWith("/") ? trimmed : `/${trimmed}`;
    }
    return pathname === "" ? "/" : pathname;
  } catch {
    return "/";
  }
}

import { sanitizeMigratedUrls } from "./sanitize-urls";

/** Rewrite absolute WP URLs in crawled HTML (optional proxy origin). */
export function rewriteMigratedHtml(html: string, wpUrl: string): string {
  const proxy = process.env.NEXT_PUBLIC_WP_MEDIA_ORIGIN;
  let out = html;
  if (proxy) {
    out = out.replaceAll(wpUrl, proxy);
  }
  return sanitizeMigratedUrls(out, wpUrl);
}
