import fs from "fs";
import path from "path";

const homeRaw = "sites/radius/data/pages/home/raw.json";
const homeMeta = "sites/radius/data/pages/home/meta.json";
const uploadHtmlCandidates = [
  "sites/radius/data/pages/home/rendered.html",
  "sites/radius/data/pages/home/content.html",
  "sites/radius/data/pages/home/html.html",
];

for (const p of uploadHtmlCandidates) {
  if (fs.existsSync(p)) console.log("exists", p, fs.statSync(p).size);
}

if (fs.existsSync(homeMeta)) {
  console.log("meta", fs.readFileSync(homeMeta, "utf8").slice(0, 500));
}

// find page html files
function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, e.name);
    if (e.isDirectory()) walk(abs, acc);
    else if (/\.(html|htm)$/i.test(e.name)) acc.push(abs);
  }
  return acc;
}
const htmls = walk("sites/radius/data/pages/home").slice(0, 20);
console.log("home html files", htmls);

const tree = JSON.parse(fs.readFileSync(homeRaw, "utf8"));
let custom = 0;
let iconSizes = [];
function visit(nodes) {
  for (const n of nodes || []) {
    const s = n.settings || {};
    if (s.custom_css || s._css_classes) custom++;
    if (s.custom_css) {
      console.log("custom_css sample id", n.id, String(s.custom_css).slice(0, 180).replace(/\s+/g, " "));
    }
    for (const k of Object.keys(s)) {
      if (/icon_size|icon_font_size/i.test(k) && /(_mobile|_tablet|_laptop)$/.test(k)) {
        iconSizes.push({ id: n.id, k, v: s[k], widget: n.widgetType });
      }
    }
    if (n.elements) visit(n.elements);
  }
}
visit(tree);
console.log("nodes with custom_css/_css_classes", custom);
console.log("responsive icon settings", iconSizes.slice(0, 15));

// scrape live html for style/elementor-element patterns already done
const liveCache = "tmp-live-home.html";
if (!fs.existsSync(liveCache)) {
  const res = await fetch("https://radius-ois.ai/", {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  const html = await res.text();
  fs.writeFileSync(liveCache, html);
  console.log("saved live html", html.length);
} else {
  console.log("using cached live html", fs.statSync(liveCache).size);
}

const html = fs.readFileSync(liveCache, "utf8");
const styleCount = [...html.matchAll(/<style\b[^>]*>/gi)].length;
const elementorElementRules = (html.match(/\.elementor-element-[a-z0-9]+/gi) || []).length;
const dataEl = (html.match(/data-id=["'][a-z0-9]+["']/gi) || []).length;
const inlineElementor = [...html.matchAll(/<style[^>]*id=["']([^"']*elementor[^"']*)["'][^>]*>([\s\S]*?)<\/style>/gi)]
  .map((m) => ({ id: m[1], len: m[2].length }));
console.log({ styleCount, elementorElementRules, dataEl, inlineElementor: inlineElementor.slice(0, 20) });

// Sample a style block that contains elementor-element
const m = html.match(/<style[^>]*>([\s\S]*?\.elementor-element-[a-z0-9]+[\s\S]*?)<\/style>/i);
if (m) {
  console.log("inline style sample len", m[1].length);
  console.log(m[1].slice(0, 400).replace(/\s+/g, " "));
}

// Look for post CSS in as-json or upload zip assets
const cssPosts = walk("public/sites/radius").filter((p) => /post-\d+\.css$/i.test(p));
console.log("local post css", cssPosts.slice(0, 10));
