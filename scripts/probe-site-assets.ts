#!/usr/bin/env npx tsx
import "dotenv/config";
import { wpHttpFetch } from "../app/api/wp/http";
import { buildPageAssetGraph } from "./migrate/lib/asset-graph";
import { manifestFromPageGraph } from "./migrate/lib/plugin-assets-merge";

const url = process.argv[2] ?? "https://www.webdorks.com/";
const res = await wpHttpFetch(url);
console.log("Status:", res.status);
const html = await res.text();
console.log("HTML size:", html.length);
const graph = buildPageAssetGraph(html, url);
const m = manifestFromPageGraph(graph);
console.log("Builder:", graph.builder);
console.log("Plugins:", m.plugins.join(", ") || "(none)");
console.log("Themes:", m.themes.join(", ") || "(none)");
console.log(
  `CSS: ${m.stylesheets.all.length} total | plugin ${m.stylesheets.plugin.length} | theme ${m.stylesheets.theme.length} | core ${m.stylesheets.core.length}`,
);
console.log(
  `JS: ${m.scripts.all.length} total | plugin ${m.scripts.plugin.length} | theme ${m.scripts.theme.length}`,
);
console.log("\n--- Plugin CSS ---");
for (const u of m.stylesheets.plugin) console.log(u);
console.log("\n--- Plugin JS ---");
for (const s of m.scripts.plugin) {
  console.log(s.src ?? `[inline ${s.id ?? "anon"}]`);
}
console.log("\n--- ALL CSS (DOM order) ---");
for (const u of m.stylesheets.all) console.log(u);
console.log("\n--- Cache/min paths ---");
for (const u of [...m.stylesheets.all, ...m.scripts.all.map((s) => s.src).filter(Boolean) as string[]]) {
  if (u.includes("/cache/") || u.includes("/min/")) console.log(u);
}
console.log("\n--- Inline style tags ---", graph.inlineStyles.length);
console.log("\n--- Elementor doc IDs ---", graph.elementorDocumentIds.join(", "));
