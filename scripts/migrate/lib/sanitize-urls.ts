/** Fixes broken URLs introduced during migration (e.g. https:https://). */
export function sanitizeMigratedUrls(html: string, wpUrl: string): string {
  let out = html;

  out = out.replace(/https:https:\/\//gi, "https://");
  out = out.replace(/http:https:\/\//gi, "https://");
  out = out.replace(/https:http:\/\//gi, "https://");
  out = out.replace(/http:http:\/\//gi, "http://");

  const host = new URL(wpUrl).hostname;
  const betaHost = "beta.radius-ois.ai";

  // Prefer production uploads when beta URLs appear
  out = out.replaceAll(`https://${betaHost}/wp-content/`, `https://${host}/wp-content/`);
  out = out.replaceAll(`http://${betaHost}/wp-content/`, `https://${host}/wp-content/`);

  // Protocol-relative in attributes only (avoid double-https on absolute URLs)
  out = out.replace(
    new RegExp(`(src|href|srcset|data-src|data-bg)=("|')//${host}`, "gi"),
    `$1=$2https://${host}`,
  );

  return out;
}
