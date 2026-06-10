#!/usr/bin/env npx tsx
import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { wpHttpFetch } from "../app/api/wp/http";
import { getMigratedDataDir } from "../app/api/wp/config";
import { buildPageAssetGraph } from "./migrate/lib/asset-graph";
import { mirrorPageAssetGraph } from "./migrate/lib/mirror-page-assets";
import { bootstrapMigrateEnv } from "./migrate/bootstrap";

const slug = "webdorks-com";
process.env.SITE_SLUG = slug;
process.env.WORDPRESS_URL = "https://www.webdorks.com";
bootstrapMigrateEnv([]);

const url = "https://www.webdorks.com/";
const html = await (await wpHttpFetch(url)).text();
const graph = buildPageAssetGraph(html, url);
console.log("Inline style blocks:", graph.inlineStyles.length);
for (const s of graph.inlineStyles) {
  console.log(`  ${s.id ?? "(no id)"}: ${s.content.length} bytes`);
}
console.log("Discovered JS:", graph.discoveredScripts.length);
console.log("Discovered CSS:", graph.discoveredStylesheets.length);

await mirrorPageAssetGraph(graph, slug);

const manifest = JSON.parse(
  fs.readFileSync(path.join(getMigratedDataDir(slug), "plugin-assets.json"), "utf8"),
);
console.log("\nplugin-assets.json:");
console.log("  plugins:", manifest.plugins.join(", "));
console.log("  inlineStyles:", manifest.inlineStyles?.length ?? 0);
for (const s of manifest.inlineStyles ?? []) {
  console.log(`    ${s.id}: ${s.bytes} bytes → ${s.publicPath}`);
}
console.log("  plugin CSS:", manifest.stylesheets.plugin.length);
console.log("  cache JS:", manifest.scripts.cache?.length ?? 0);
