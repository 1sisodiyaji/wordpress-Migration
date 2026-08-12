import fs from "fs";

const html = fs.readFileSync("tmp-live-home.html", "utf8");

// Extract all elementor-post-* style blocks
const blocks = [...html.matchAll(/<style[^>]*id=["']([^"']+)["'][^>]*>([\s\S]*?)<\/style>/gi)];
for (const m of blocks) {
  const id = m[1];
  if (!/elementor/i.test(id)) continue;
  const css = m[2];
  const elCount = (css.match(/\.elementor-element-/g) || []).length;
  const hasIcon = /icon|funfact|svg/i.test(css);
  console.log(id, "len", css.length, "el-rules", elCount, "iconish", hasIcon);
}

// sample from elementor-frontend-inline-css for icon sizes
const fe = blocks.find((m) => m[1] === "elementor-frontend-inline-css");
if (fe) {
  const css = fe[2];
  const iconSnips = [...css.matchAll(/[^}]*icon[^ {]*\{[^}]+\}/gi)].slice(0, 8);
  console.log("\nicon snips from frontend-inline:");
  for (const s of iconSnips) console.log(s[0].slice(0, 220).replace(/\s+/g, " "));

  // funfact / elements size
  const fun = [...css.matchAll(/[^}]*funfact[^ {]*\{[^}]+\}/gi)].slice(0, 5);
  console.log("\nfunfact snips:");
  for (const s of fun) console.log(s[0].slice(0, 220).replace(/\s+/g, " "));

  // look for specific ids
  for (const id of ["d333650", "b7c28c0", "2556c52"]) {
    const idx = css.indexOf(`elementor-element-${id}`);
    if (idx >= 0) console.log("\nfound", id, css.slice(idx, idx + 280).replace(/\s+/g, " "));
  }
}

// Is home post 3447 present?
console.log("\nhas elementor-post-3447?", /elementor-post-3447/.test(html));
console.log("data-elementor-id attrs", [...html.matchAll(/data-elementor-id=["'](\d+)["']/g)].map((m) => m[1]).slice(0, 30));
