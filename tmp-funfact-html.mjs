import fs from "fs";

const html = fs.readFileSync("tmp-live-home.html", "utf8");

// Find funfact widget markup around d333650
const idx = html.indexOf("elementor-element-d333650");
console.log("idx", idx);
console.log(html.slice(idx, idx + 1200).replace(/\s+/g, " ").slice(0, 1100));

const idx2 = html.indexOf("elementor-element-b7c28c0");
console.log("\nbtn", html.slice(idx2, idx2 + 900).replace(/\s+/g, " ").slice(0, 800));

// media queries for icon size
const fe = [...html.matchAll(/<style[^>]*id=["']elementor-frontend-inline-css["'][^>]*>([\s\S]*?)<\/style>/i)][0]?.[1] || "";
const mediaIcon = [...fe.matchAll(/@media[^{]+\{[^}]*d333650[^}]+\}/g)].slice(0, 5);
console.log("\nmedia samples", mediaIcon.length);
for (const m of mediaIcon) console.log(m[0].slice(0, 250));

const anyMedia = [...fe.matchAll(/@media[^{]+\{[\s\S]*?elementor-element-d333650[\s\S]*?\}/g)].slice(0, 3);
console.log("\nbroader", anyMedia.length);
for (const m of anyMedia) console.log(m[0].slice(0, 400).replace(/\s+/g, " "));
