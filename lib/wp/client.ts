import { getWpUrl } from "./config";
import { formatWpHttpError, wpHttpFetch } from "./http";

let cachedRestBase: string | null = null;
let cachedRestBaseFor: string | null = null;

export function resetRestBaseCache(): void {
  cachedRestBase = null;
  cachedRestBaseFor = null;
}

/** Resolves REST base — supports pretty permalinks or `?rest_route=` fallback. */
export async function getRestBase(): Promise<string> {
  const wpUrl = getWpUrl();
  if (cachedRestBase && cachedRestBaseFor === wpUrl) return cachedRestBase;

  const pretty = `${wpUrl}/wp-json`;
  try {
    const res = await wpHttpFetch(pretty);
    if (res.ok) {
      cachedRestBase = pretty;
      cachedRestBaseFor = wpUrl;
      return pretty;
    }
  } catch {
    /* fall through */
  }

  cachedRestBase = `${wpUrl}/index.php?rest_route=`;
  cachedRestBaseFor = wpUrl;
  return cachedRestBase;
}

export function buildRestUrl(base: string, route: string, params?: Record<string, string>): string {
  const path = route.startsWith("/") ? route : `/${route}`;
  const search = params
    ? `?${new URLSearchParams(params).toString()}`
    : "";

  if (base.endsWith("rest_route=")) {
    return `${base}${encodeURIComponent(path)}${search ? `&${search.slice(1)}` : ""}`;
  }

  return `${base}${path}${search}`;
}

export async function wpFetch<T>(
  route: string,
  params?: Record<string, string>,
): Promise<T> {
  const base = await getRestBase();
  const url = buildRestUrl(base, route, params);
  const res = await wpHttpFetch(url);

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`WP REST ${route}: ${formatWpHttpError(url, res.status, body)}`);
  }

  return res.json() as Promise<T>;
}

/** Paginates collection endpoints (max 100 per page). */
export async function wpFetchAll<T extends { id: number }>(
  route: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  const perPage = "100";
  let page = 1;
  const all: T[] = [];

  for (;;) {
    const batch = await wpFetch<T[]>(route, {
      ...params,
      per_page: perPage,
      page: String(page),
    });

    if (!batch.length) break;
    all.push(...batch);
    if (batch.length < Number(perPage)) break;
    page += 1;
  }

  return all;
}

/** Lightweight list fetch — avoids huge Elementor HTML in REST `content.rendered`. */
export async function wpFetchAllLight<T extends { id: number }>(
  route: string,
  params: Record<string, string> = {},
): Promise<T[]> {
  return wpFetchAll<T>(route, {
    ...params,
    _fields:
      "id,slug,link,title,status,date,modified,type,featured_media,class_list,excerpt",
  });
}

export async function fetchSiteMeta(): Promise<{
  name: string;
  description: string;
  url: string;
  home: string;
}> {
  try {
    const settings = await wpFetch<{
      title?: string;
      description?: string;
      url?: string;
      home?: string;
    }>("/wp/v2/settings");

    return {
      name: settings.title ?? "WordPress Site",
      description: settings.description ?? "",
      url: settings.url ?? getWpUrl(),
      home: settings.home ?? getWpUrl(),
    };
  } catch {
    const wpUrl = getWpUrl();
    return {
      name: "WordPress Site",
      description: "",
      url: wpUrl,
      home: wpUrl,
    };
  }
}
