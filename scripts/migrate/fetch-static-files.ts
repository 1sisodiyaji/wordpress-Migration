import fs from "node:fs/promises";
import path from "node:path";
import {
  getMigratedDataDir,
  getMigratedPublicDir,
  getWpUrl,
} from "../../app/api/wp/config";
import type { MigratedStaticFile } from "../../app/api/wp/types";
import { wpHttpFetch } from "../../app/api/wp/http";

/** Well-known and AI-related files to mirror from WordPress. */
const STATIC_CANDIDATES = [
  "/robots.txt",
  "/llms.txt",
  "/llms-full.txt",
  "/ai.txt",
  "/humans.txt",
  "/security.txt",
  "/ads.txt",
  "/.well-known/ai-plugin.json",
  "/.well-known/security.txt",
  "/sitemap.xml",
  "/sitemap_index.xml",
  "/wp-sitemap.xml",
];

function publicPathFor(urlPath: string): string {
  const root = getMigratedPublicDir();
  if (urlPath.startsWith("/.well-known/")) {
    return path.join(root, ".well-known", path.basename(urlPath));
  }
  return path.join(root, urlPath.replace(/^\//, ""));
}

export async function fetchStaticFiles(
  siteUrl = getWpUrl(),
): Promise<MigratedStaticFile[]> {
  console.log("📄 Mirroring robots.txt, llms.txt, sitemap, and AI files…");

  const base = siteUrl.replace(/\/$/, "");
  const copied: MigratedStaticFile[] = [];

  for (const urlPath of STATIC_CANDIDATES) {
    const sourceUrl = `${base}${urlPath}`;
    try {
      const res = await wpHttpFetch(sourceUrl, {
        signal: AbortSignal.timeout(30_000),
      });
      if (!res.ok) continue;

      const body = await res.text();
      if (!body.trim()) continue;

      const diskPath = publicPathFor(urlPath);
      await fs.mkdir(path.dirname(diskPath), { recursive: true });
      await fs.writeFile(diskPath, body, "utf8");

      copied.push({
        path: urlPath,
        sourceUrl,
        localPath: urlPath,
      });
      console.log(`  ✓ ${urlPath}`);
    } catch {
      /* optional file */
    }
  }

  await fs.mkdir(getMigratedDataDir(), { recursive: true });
  await fs.writeFile(
    path.join(getMigratedDataDir(), "static-files.json"),
    JSON.stringify({ fetchedAt: new Date().toISOString(), files: copied }, null, 2),
    "utf8",
  );

  console.log(`   ${copied.length} static file(s) copied to site public folder\n`);
  return copied;
}
