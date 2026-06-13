#!/usr/bin/env npx tsx
import "dotenv/config";
import { wpHttpFetch } from "../app/api/wp/http";
import { buildPageAssetGraph } from "./migrate/lib/asset-graph";
import { verifyAssetsAgainstHtml } from "./migrate/lib/asset-verify";
import { manifestFromPageGraph } from "./migrate/lib/plugin-assets-merge";
import { buildWpContentTree } from "./migrate/lib/wp-content-tree";

const url = process.argv[2] ?? "https://radius-ois.ai/";
const res = await wpHttpFetch(url);
console.log("Status:", res.status);
const html = await res.text();
console.log("HTML size:", html.length);
const graph = buildPageAssetGraph(html, url);
const m = manifestFromPageGraph(graph);
const tree = await buildWpContentTree(html, url, url, { probeListings: true });

console.log("Builder:", graph.builder);
console.log("Plugins (HTML):", m.plugins.join(", ") || "(none)");
console.log("Plugins (tree):", tree.plugins.map((p) => p.slug).join(", ") || "(none)");
console.log("Themes:", m.themes.join(", ") || "(none)");
console.log(
  `CSS: ${m.stylesheets.all.length} total | plugin ${m.stylesheets.plugin.length} | theme ${m.stylesheets.theme.length} | core ${m.stylesheets.core.length}`,
);
console.log(
  `JS: ${m.scripts.all.length} total | plugin ${m.scripts.plugin.length} | theme ${m.scripts.theme.length}`,
);
console.log(`CDN/external: ${tree.external.css.length} CSS, ${tree.external.js.length} JS`);

console.log("\n--- wp-content/plugins tree ---");
for (const p of tree.plugins) {
  console.log(
    `  ${p.slug}: ${p.css.length} CSS, ${p.js.length} JS${p.listingAvailable ? " (listing)" : ""}`,
  );
}
if (tree.muPluginAssets.css.length || tree.muPluginAssets.js.length) {
  console.log(
    `  mu-plugins: ${tree.muPluginAssets.css.length} CSS, ${tree.muPluginAssets.js.length} JS`,
  );
}

console.log("\n--- Plugin CSS (manifest) ---");
for (const u of m.stylesheets.plugin) console.log(u);
console.log("\n--- Plugin JS (manifest) ---");
for (const s of m.scripts.plugin) {
  console.log(s.src ?? `[inline ${s.id ?? "anon"}]`);
}

if (process.argv[3]) {
  const report = verifyAssetsAgainstHtml(html, url, process.argv[3]);
  console.log("\n--- Verification vs registry ---");
  console.log(
    `Plugin CSS cloned: ${report.clonedPluginCss}/${report.htmlPluginCss.length}`,
  );
  console.log(`Plugin JS cloned: ${report.clonedPluginJs}/${report.htmlPluginJs.length}`);
  if (report.missingPluginCss.length) {
    console.log("Missing plugin CSS:", report.missingPluginCss.length);
  }
  if (report.missingPluginJs.length) {
    console.log("Missing plugin JS:", report.missingPluginJs.length);
  }
}
