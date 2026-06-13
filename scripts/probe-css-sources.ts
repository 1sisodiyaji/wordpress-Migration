#!/usr/bin/env npx tsx
import "dotenv/config";
import * as cheerio from "cheerio";
import { wpHttpFetch } from "../app/api/wp/http";

const url = process.argv[2] ?? "https://radius-ois.ai/";
const html = await (await wpHttpFetch(url)).text();
const $ = cheerio.load(html);

console.log("=== link tags ===");
$("link").each((_, el) => {
  const rel = $(el).attr("rel");
  const href = $(el).attr("href");
  const as = $(el).attr("as");
  if (href) console.log(`${rel ?? ""} as=${as ?? ""} ${href.slice(0, 120)}`);
});

console.log("\n=== style tags ===");
$("style").each((i, el) => {
  const id = $(el).attr("id") ?? `style-${i}`;
  const len = ($(el).html() ?? "").length;
  console.log(`${id}: ${len} chars`);
});

const cacheCss = html.match(/\/wp-content\/cache\/[^"'\s>]+\.css/gi) ?? [];
console.log("\n=== cache css refs in HTML ===", [...new Set(cacheCss)].length);
[...new Set(cacheCss)].slice(0, 20).forEach((u) => console.log(u));

const uploadCss = html.match(/\/wp-content\/uploads\/elementor\/css\/[^"'\s>]+\.css/gi) ?? [];
console.log("\n=== elementor upload css refs ===", [...new Set(uploadCss)].length);
[...new Set(uploadCss)].slice(0, 20).forEach((u) => console.log(u));

const themeCss = html.match(/\/wp-content\/themes\/[^"'\s>]+\.css/gi) ?? [];
console.log("\n=== theme css refs ===", [...new Set(themeCss)].length);
[...new Set(themeCss)].slice(0, 20).forEach((u) => console.log(u));
