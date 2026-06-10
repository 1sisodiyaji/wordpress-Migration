const DEFAULT_USER_AGENT =
  process.env.WORDPRESS_FETCH_USER_AGENT ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function basicAuthHeader(): string | undefined {
  const user = process.env.WORDPRESS_AUTH_USER;
  const password =
    process.env.WORDPRESS_APPLICATION_PASSWORD ??
    process.env.WORDPRESS_AUTH_PASSWORD;
  if (!user || !password) return undefined;
  return `Basic ${Buffer.from(`${user}:${password}`).toString("base64")}`;
}

/** Headers for server-side migrate fetches (Cloudflare/WAF-friendly). */
export function wpFetchHeaders(extra?: HeadersInit): Headers {
  const headers = new Headers(extra);
  if (!headers.has("User-Agent")) headers.set("User-Agent", DEFAULT_USER_AGENT);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json, text/html, */*;q=0.8");
  }
  if (!headers.has("Accept-Language")) {
    headers.set("Accept-Language", "en-US,en;q=0.9");
  }

  const auth = basicAuthHeader();
  if (auth && !headers.has("Authorization")) headers.set("Authorization", auth);

  const cookie = process.env.WORDPRESS_COOKIE?.trim();
  if (cookie && !headers.has("Cookie")) headers.set("Cookie", cookie);

  return headers;
}

export function isCloudflareChallenge(status: number, body: string): boolean {
  if (status !== 403 && status !== 503) return false;
  return (
    body.includes("Just a moment") ||
    body.includes("cf-browser-verification") ||
    body.includes("challenge-platform") ||
    body.includes("__cf_chl")
  );
}

export function formatWpHttpError(url: string, status: number, body: string): string {
  if (isCloudflareChallenge(status, body)) {
    return [
      `Blocked by Cloudflare (${status}) for ${url}.`,
      "The migrate script was served a bot challenge instead of WordPress JSON.",
      "Fix options:",
      "  1. Set WORDPRESS_COOKIE in .env with cf_clearance (copy from browser DevTools after visiting the site).",
      "  2. Allowlist your IP for /wp-json on the WordPress host.",
      "  3. Migrate from a local/staging WordPress copy without Cloudflare.",
      "  4. Retry — Cloudflare blocks are sometimes intermittent.",
    ].join("\n");
  }

  return `HTTP ${status} for ${url}: ${body.slice(0, 200)}`;
}

const RETRYABLE = new Set([403, 429, 503]);

export async function wpHttpFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const retries = Number(process.env.WORDPRESS_FETCH_RETRIES ?? "3");
  const retryDelayMs = Number(process.env.WORDPRESS_FETCH_RETRY_MS ?? "1500");

  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const headers = wpFetchHeaders(init.headers);
      const res = await fetch(url, { ...init, headers });

      if (RETRYABLE.has(res.status) && attempt < retries) {
        const body = await res.text().catch(() => "");
        if (isCloudflareChallenge(res.status, body) || res.status === 429) {
          await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
          continue;
        }
        throw new Error(formatWpHttpError(url, res.status, body));
      }

      return res;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, retryDelayMs * (attempt + 1)));
        continue;
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}
