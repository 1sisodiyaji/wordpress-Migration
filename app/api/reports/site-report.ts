import fs from "node:fs";
import path from "node:path";
import { getSiteDataDir } from "@/api/wp/sites";

export interface SiteReport {
  seo: { score: number; label: string; hints: string[] };
  performance: { score: number; label: string; hints: string[] };
  htmlSizeKb: number;
  stylesheetCount: number;
}

export function buildSiteReport(slug: string): SiteReport | null {
  const dataDir = getSiteDataDir(slug);
  const manifestPath = path.join(dataDir, "manifest.json");
  if (!fs.existsSync(manifestPath)) return null;

  const manifest = JSON.parse(fs.readFileSync(manifestPath, "utf8")) as {
    styles?: { stylesheets?: string[] };
    site?: { description?: string };
  };

  const homeHtml = path.join(dataDir, "pages", "home.html");
  const htmlSizeKb = fs.existsSync(homeHtml)
    ? Math.round(fs.statSync(homeHtml).size / 1024)
    : 0;

  const stylesheetCount = manifest.styles?.stylesheets?.length ?? 0;
  const hasDescription = Boolean(manifest.site?.description?.trim());

  const seoHints: string[] = [];
  let seoScore = 72;
  if (!hasDescription) {
    seoHints.push("Add meta description on homepage");
    seoScore -= 12;
  }
  if (htmlSizeKb > 500) {
    seoHints.push("Homepage HTML is large — split into sections");
    seoScore -= 8;
  }
  seoHints.push("Run full crawl for sitemap & meta audit");

  const perfHints: string[] = [];
  let perfScore = 78;
  if (stylesheetCount > 15) {
    perfHints.push(`${stylesheetCount} CSS files — consider bundling`);
    perfScore -= 10;
  }
  if (htmlSizeKb > 300) {
    perfHints.push("Heavy DOM — componentize sections in Remix");
    perfScore -= 8;
  }
  perfHints.push("Convert to Remix for code-splitting & SSR");

  return {
    seo: {
      score: Math.max(0, seoScore),
      label: seoScore >= 80 ? "Good" : seoScore >= 60 ? "Fair" : "Needs work",
      hints: seoHints,
    },
    performance: {
      score: Math.max(0, perfScore),
      label: perfScore >= 80 ? "Good" : perfScore >= 60 ? "Fair" : "Needs work",
      hints: perfHints,
    },
    htmlSizeKb,
    stylesheetCount,
  };
}
