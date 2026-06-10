import { wpHttpFetch } from "../../../app/api/wp/http";
import { linkToPath } from "./url-path";

const SITEMAP_PATHS = [
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/wp-sitemap.xml",
  "/sitemap-index.xml",
];

const URL_IN_XML = /<loc>\s*([^<\s]+)\s*<\/loc>/gi;

function isSitemapUrl(url: string): boolean {
  return /\.xml($|\?)/i.test(url) || /sitemap/i.test(new URL(url).pathname);
}

async function fetchText(url: string): Promise<string | null> {
  try {
    const res = await wpHttpFetch(url, { signal: AbortSignal.timeout(45_000) });
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function extractLocs(xml: string): string[] {
  const urls: string[] = [];
  for (const match of xml.matchAll(URL_IN_XML)) {
    urls.push(match[1].trim());
  }
  return urls;
}

async function expandSitemap(url: string, seen: Set<string>): Promise<string[]> {
  if (seen.has(url)) return [];
  seen.add(url);

  const xml = await fetchText(url);
  if (!xml) return [];

  const locs = extractLocs(xml);
  const pageUrls: string[] = [];

  for (const loc of locs) {
    if (isSitemapUrl(loc)) {
      pageUrls.push(...(await expandSitemap(loc, seen)));
    } else {
      pageUrls.push(loc);
    }
  }

  return pageUrls;
}

function parseRobotsSitemaps(robots: string): string[] {
  return robots
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^sitemap:/i.test(line))
    .map((line) => line.replace(/^sitemap:\s*/i, "").trim())
    .filter(Boolean);
}

export interface SitemapDiscovery {
  pageUrls: string[];
  sitemapUrls: string[];
  robotsSitemaps: string[];
}

/** Discover page URLs from sitemap.xml, sitemap index, and robots.txt Sitemap: lines. */
export async function discoverSitemapUrls(siteUrl: string): Promise<SitemapDiscovery> {
  const base = siteUrl.replace(/\/$/, "");
  const seen = new Set<string>();
  const sitemapUrls = new Set<string>();
  const pageUrls = new Set<string>();

  const robots = await fetchText(`${base}/robots.txt`);
  const robotsSitemaps = robots ? parseRobotsSitemaps(robots) : [];

  for (const sm of robotsSitemaps) {
    sitemapUrls.add(sm);
    for (const url of await expandSitemap(sm, seen)) {
      pageUrls.add(url);
    }
  }

  for (const path of SITEMAP_PATHS) {
    const smUrl = `${base}${path}`;
    if (seen.has(smUrl)) continue;
    const xml = await fetchText(smUrl);
    if (!xml) continue;
    sitemapUrls.add(smUrl);
    for (const loc of extractLocs(xml)) {
      if (isSitemapUrl(loc)) {
        sitemapUrls.add(loc);
        for (const url of await expandSitemap(loc, seen)) {
          pageUrls.add(url);
        }
      } else {
        pageUrls.add(loc);
      }
    }
  }

  return {
    pageUrls: [...pageUrls],
    sitemapUrls: [...sitemapUrls],
    robotsSitemaps,
  };
}

export function sitemapPaths(pageUrls: string[], siteHome: string): string[] {
  const paths = new Set<string>();
  for (const url of pageUrls) {
    try {
      const path = linkToPath(url, siteHome);
      if (path && path !== "") paths.add(path);
    } catch {
      /* skip invalid */
    }
  }
  return [...paths];
}
