import { Agent } from "undici";

const DEFAULT_USER_AGENT =
  process.env.WORDPRESS_FETCH_USER_AGENT ??
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CONNECT_TIMEOUT_MS = Number(process.env.WORDPRESS_FETCH_CONNECT_MS ?? "30_000");
const HEADERS_TIMEOUT_MS = Number(process.env.WORDPRESS_FETCH_HEADERS_MS ?? "120_000");
const BODY_TIMEOUT_MS = Number(process.env.WORDPRESS_FETCH_BODY_MS ?? "180_000");
const DEFAULT_RETRIES = Number(process.env.WORDPRESS_FETCH_RETRIES ?? "5");
const RETRY_DELAY_MS = Number(process.env.WORDPRESS_FETCH_RETRY_MS ?? "2000");

/** Shared agent — generous timeouts for slow WordPress hosts (LiteSpeed, large HTML). */
const wpFetchAgent = new Agent({
  connect: { timeout: CONNECT_TIMEOUT_MS },
  headersTimeout: HEADERS_TIMEOUT_MS,
  bodyTimeout: BODY_TIMEOUT_MS,
  keepAliveTimeout: 30_000,
  keepAliveMaxTimeout: 120_000,
  pipelining: 0,
});

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
  if (!headers.has("Connection")) headers.set("Connection", "keep-alive");

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

const RETRYABLE_STATUS = new Set([403, 429, 502, 503, 504]);

export function isRetryableNetworkError(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  const msg = err.message.toLowerCase();
  const cause =
    err.cause instanceof Error ? err.cause.message.toLowerCase() : "";

  return (
    msg.includes("terminated") ||
    msg.includes("econnreset") ||
    msg.includes("etimedout") ||
    msg.includes("socket hang up") ||
    msg.includes("network") ||
    msg.includes("fetch failed") ||
    msg.includes("aborted") ||
    msg.includes("und_err") ||
    cause.includes("terminated") ||
    cause.includes("econnreset") ||
    cause.includes("etimedout")
  );
}

function formatNetworkError(url: string, err: Error, attempt: number, max: number): string {
  return [
    `Network error fetching ${url} (attempt ${attempt}/${max}): ${err.message}`,
    "The WordPress host closed the connection or timed out.",
    "Common causes: LiteSpeed rate limits, slow TTFB, too many parallel downloads.",
    "The migrate script will retry automatically. If this persists, set:",
    "  WORDPRESS_FETCH_RETRIES=8  WORDPRESS_FETCH_BODY_MS=300000",
    "  MIGRATE_CSS_CONCURRENCY=3  MIGRATE_JS_CONCURRENCY=3",
  ].join("\n");
}

async function rawFetch(url: string, init: RequestInit): Promise<Response> {
  const headers = wpFetchHeaders(init.headers);
  return fetch(url, {
    ...init,
    headers,
    // @ts-expect-error undici dispatcher — supported by Node fetch
    dispatcher: wpFetchAgent,
  });
}

async function attemptFetch(
  url: string,
  init: RequestInit,
  attempt: number,
  retries: number,
): Promise<Response> {
  const res = await rawFetch(url, init);

  if (RETRYABLE_STATUS.has(res.status) && attempt < retries) {
    const body = await res.text().catch(() => "");
    if (isCloudflareChallenge(res.status, body) || res.status === 429) {
      const delay = RETRY_DELAY_MS * (attempt + 1);
      console.warn(`  ↻ HTTP ${res.status} for ${url} — retry in ${delay}ms`);
      await new Promise((r) => setTimeout(r, delay));
      return attemptFetch(url, init, attempt + 1, retries);
    }
    throw new Error(formatWpHttpError(url, res.status, body));
  }

  return res;
}

function scheduleRetry(
  url: string,
  err: Error,
  attempt: number,
  retries: number,
): Promise<void> {
  const delay = RETRY_DELAY_MS * (attempt + 1);
  console.warn(
    `  ↻ ${err.message} — retry ${attempt + 2}/${retries + 1} in ${delay}ms (${url})`,
  );
  return new Promise((r) => setTimeout(r, delay));
}

export async function wpHttpFetch(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  const retries = DEFAULT_RETRIES;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await attemptFetch(url, init, attempt, retries);
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < retries && isRetryableNetworkError(lastError)) {
        await scheduleRetry(url, lastError, attempt, retries);
        continue;
      }

      if (isRetryableNetworkError(lastError)) {
        throw new Error(formatNetworkError(url, lastError, attempt + 1, retries + 1));
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

/** Fetch URL and read body as text — retries when the host drops mid-download. */
export async function wpHttpFetchText(
  url: string,
  init: RequestInit = {},
): Promise<{ response: Response; text: string }> {
  const retries = DEFAULT_RETRIES;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await attemptFetch(url, init, attempt, retries);
      const text = await response.text();
      return { response, text };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      if (attempt < retries && isRetryableNetworkError(lastError)) {
        await scheduleRetry(url, lastError, attempt, retries);
        continue;
      }

      if (isRetryableNetworkError(lastError)) {
        throw new Error(formatNetworkError(url, lastError, attempt + 1, retries + 1));
      }
      throw lastError;
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}
