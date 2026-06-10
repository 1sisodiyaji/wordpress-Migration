#!/usr/bin/env npx tsx
/**
 * Migrate each URL in test-url.md — landing + asset repair + audit.
 * Usage: npx tsx scripts/migrate-test-sites.ts
 */
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { wpHttpFetch } from "../app/api/wp/http";
import { getMigratedPublicDir } from "../app/api/wp/config";
import { normalizeWordPressUrl, urlToSlug } from "../app/api/wp/sites";
import { detectBuilderFromHtml } from "./migrate/lib/html-extract";
import { extractLivePageAssets } from "./migrate/lib/live-assets";
import { bootstrapMigrateEnv } from "./migrate/bootstrap";
import { runMigration } from "./migrate/run";

const TEST_FILE = path.join(process.cwd(), "test-url.md");

interface SiteResult {
  url: string;
  slug: string;
  status: "ok" | "skipped" | "failed";
  builder?: string;
  css?: number;
  js?: number;
  note?: string;
}

function readUrls(): string[] {
  return fs
    .readFileSync(TEST_FILE, "utf8")
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^https?:\/\//i.test(l));
}

async function probe(url: string) {
  const normalized = normalizeWordPressUrl(url);
  const fetchUrl = normalized.endsWith("/") ? normalized : `${normalized}/`;
  const res = await wpHttpFetch(fetchUrl, { signal: AbortSignal.timeout(60_000) });
  const html = res.ok ? await res.text() : "";
  const isWp =
    html.includes("wp-content") ||
    html.includes("wp-includes") ||
    html.includes("/wp-json");
  const builder = html ? detectBuilderFromHtml(html) : "unknown";
  const live = html ? extractLivePageAssets(html, fetchUrl) : null;
  return { ok: res.ok, status: res.status, isWp, builder, live, fetchUrl: normalized };
}

async function repairAssets(slug: string, wpUrl: string): Promise<void> {
  const { spawn } = await import("node:child_process");
  await new Promise<void>((resolve, reject) => {
    const child = spawn(
      process.platform === "win32" ? "npx.cmd" : "npx",
      ["tsx", "scripts/fetch-missing-assets.ts", slug],
      {
        stdio: "inherit",
        env: {
          ...process.env,
          SITE_SLUG: slug,
          WORDPRESS_URL: wpUrl,
        },
        shell: process.platform === "win32",
      },
    );
    child.on("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`repair exit ${code}`)),
    );
  });
}

function countAssets(slug: string): { css: number; js: number } {
  const cssDir = path.join(getMigratedPublicDir(slug), "css");
  const jsDir = path.join(getMigratedPublicDir(slug), "js");
  return {
    css: fs.existsSync(cssDir) ? fs.readdirSync(cssDir).length : 0,
    js: fs.existsSync(jsDir) ? fs.readdirSync(jsDir).length : 0,
  };
}

async function migrateOne(url: string): Promise<SiteResult> {
  const slug = urlToSlug(normalizeWordPressUrl(url));
  console.log(`\n${"═".repeat(72)}\n▶ ${url}\n   slug: ${slug}\n`);

  try {
    const probeResult = await probe(url);
    if (!probeResult.ok) {
      return {
        url,
        slug,
        status: "failed",
        note: `HTTP ${probeResult.status}`,
      };
    }
    if (!probeResult.isWp) {
      return {
        url,
        slug,
        status: "skipped",
        builder: probeResult.builder,
        note: "Not WordPress — skipped",
      };
    }

    process.env.WORDPRESS_URL = probeResult.fetchUrl;
    process.env.SITE_SLUG = slug;
    bootstrapMigrateEnv([]);

    const { resetRestBaseCache } = await import("../app/api/wp/client");
    const { resetCssRegistry } = await import("./migrate/lib/css-download");
    const { resetJsRegistry } = await import("./migrate/lib/js-download");
    resetRestBaseCache();
    resetCssRegistry();
    resetJsRegistry();

    console.log(`   Source: ${probeResult.fetchUrl}`);
    console.log(`   Builder: ${probeResult.builder}`);
    console.log(
      `   Live assets: ${probeResult.live?.stylesheetUrls.length ?? 0} CSS, ${probeResult.live?.scriptUrls.length ?? 0} JS`,
    );
    console.log("   → Landing migrate…");

    await runMigration(["--landing"]);

    console.log("   → Repair assets…");
    await repairAssets(slug, probeResult.fetchUrl);

    const counts = countAssets(slug);
    const previewPath = path.join(
      process.cwd(),
      "public",
      "preview-static",
      `${slug}.html`,
    );
    const hasPreview = fs.existsSync(previewPath);

    return {
      url,
      slug,
      status: "ok",
      builder: probeResult.builder,
      css: counts.css,
      js: counts.js,
      note: hasPreview
        ? `preview OK · ${counts.css} CSS · ${counts.js} JS`
        : `missing preview · ${counts.css} CSS · ${counts.js} JS`,
    };
  } catch (err) {
    return {
      url,
      slug,
      status: "failed",
      note: err instanceof Error ? err.message : String(err),
    };
  }
}

async function main(): Promise<void> {
  const urls = readUrls();
  console.log(`\n🚀 Batch landing migrate: ${urls.length} URL(s) from test-url.md\n`);

  const results: SiteResult[] = [];
  for (let i = 0; i < urls.length; i++) {
    console.log(`[${i + 1}/${urls.length}]`);
    results.push(await migrateOne(urls[i]!));
  }

  console.log(`\n${"═".repeat(72)}\n📋 SUMMARY\n`);
  for (const r of results) {
    const icon =
      r.status === "ok" ? "✅" : r.status === "skipped" ? "⏭" : "❌";
    console.log(
      `${icon} ${r.url.replace(/^https?:\/\//, "").padEnd(36)} ${(r.builder ?? "").padEnd(10)} ${r.note ?? r.status}`,
    );
  }

  const ok = results.filter((r) => r.status === "ok").length;
  const failed = results.filter((r) => r.status === "failed").length;
  const skipped = results.filter((r) => r.status === "skipped").length;
  console.log(`\nDone: ${ok} migrated, ${skipped} skipped, ${failed} failed\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
