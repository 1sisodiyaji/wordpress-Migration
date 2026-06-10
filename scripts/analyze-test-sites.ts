#!/usr/bin/env npx tsx
/**
 * Probe sites from test-url.md — builder detection, fetch status, asset counts.
 * Usage: npx tsx scripts/analyze-test-sites.ts
 */
import fs from "node:fs";
import path from "node:path";
import { wpHttpFetch } from "../app/api/wp/http";
import { detectBuilderFromHtml } from "./migrate/lib/html-extract";
import { extractLivePageAssets } from "./migrate/lib/live-assets";

const TEST_FILE = path.join(process.cwd(), "test-url.md");

function readTestUrls(): string[] {
  if (!fs.existsSync(TEST_FILE)) return [];
  return fs
    .readFileSync(TEST_FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l));
}

async function analyzeUrl(url: string) {
  const normalized = url.replace(/\/$/, "") || url;
  const fetchUrl = url.endsWith("/") ? url : `${normalized}/`;

  try {
    const res = await wpHttpFetch(fetchUrl, { signal: AbortSignal.timeout(45_000) });
    const html = res.ok ? await res.text() : "";
    const builder = html ? detectBuilderFromHtml(html) : "unknown";
    const live = html ? extractLivePageAssets(html, fetchUrl) : null;

    return {
      url,
      status: res.status,
      ok: res.ok,
      builder,
      css: live?.stylesheetUrls.length ?? 0,
      js: live?.scriptUrls.length ?? 0,
      themes: live?.themeSlugs.join(", ") || "—",
      plugins: live?.pluginSlugs.slice(0, 6).join(", ") || "—",
      wp: html.includes("wp-content") || html.includes("wp-includes"),
    };
  } catch (err) {
    return {
      url,
      status: 0,
      ok: false,
      builder: "unknown" as const,
      css: 0,
      js: 0,
      themes: "—",
      plugins: "—",
      wp: false,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  const urls = readTestUrls();
  if (!urls.length) {
    console.error("No URLs in test-url.md");
    process.exit(1);
  }

  console.log(`\n🔬 Analyzing ${urls.length} test site(s) from test-url.md\n`);
  console.log(
    "URL".padEnd(42) +
      "HTTP".padEnd(6) +
      "Builder".padEnd(12) +
      "CSS".padEnd(5) +
      "JS".padEnd(5) +
      "WP",
  );
  console.log("─".repeat(80));

  for (const url of urls) {
    const r = await analyzeUrl(url);
    const short = url.replace(/^https?:\/\//, "").slice(0, 40);
    const line =
      short.padEnd(42) +
      String(r.status || "ERR").padEnd(6) +
      String(r.builder).padEnd(12) +
      String(r.css).padEnd(5) +
      String(r.js).padEnd(5) +
      (r.wp ? "yes" : "no");
    console.log(line);
    if ("error" in r && r.error) {
      console.log(`   └─ ${r.error}`);
    } else if (r.ok) {
      console.log(`   themes: ${r.themes}`);
      console.log(`   plugins: ${r.plugins}`);
    }
  }

  console.log("\nRun landing migrate per site:");
  console.log("  $env:WORDPRESS_URL='https://example.com'; npm run migrate -- --landing");
  console.log("\nRepair assets after migrate:");
  console.log("  npx tsx scripts/fetch-missing-assets.ts <slug>\n");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
