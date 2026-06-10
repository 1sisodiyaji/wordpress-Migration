import { getWpUrl } from "../../../app/api/wp/config";

function hostKey(hostname: string): string {
  return hostname.toLowerCase().replace(/^www\./, "");
}

/** Align asset URL host with WORDPRESS_URL (www vs apex). */
export function normalizeAssetUrl(url: string, canonicalBase?: string): string {
  try {
    const base = canonicalBase ?? getWpUrl();
    const u = new URL(url);
    const canon = new URL(base.endsWith("/") ? base : `${base}/`);
    if (hostKey(u.hostname) === hostKey(canon.hostname)) {
      u.protocol = canon.protocol;
      u.hostname = canon.hostname;
    }
    return u.href;
  } catch {
    return url;
  }
}

export function assetUrlAliases(url: string, canonicalBase?: string): string[] {
  const normalized = normalizeAssetUrl(url, canonicalBase);
  const aliases = new Set<string>([url, normalized]);
  try {
    const u = new URL(normalized);
    const bare = u.hostname.replace(/^www\./, "");
    aliases.add(normalized.replace(u.hostname, bare));
    aliases.add(normalized.replace(u.hostname, `www.${bare}`));
    aliases.add(u.origin + u.pathname);
  } catch {
    /* ignore */
  }
  return [...aliases];
}
