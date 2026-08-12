const origin = "https://radius-ois.ai";

async function main() {
  const res = await fetch(origin, {
    headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" },
    redirect: "follow",
  });
  const html = await res.text();
  console.log("status", res.status, "final", res.url, "html", html.length);

  const linkHrefs = [...html.matchAll(/<link[^>]+href=["']([^"']+)["'][^>]*>/gi)].map((m) => m[1]);
  const elementorCss = linkHrefs.filter((h) => /elementor/i.test(h) && /\.css/i.test(h));
  const postCss = linkHrefs.filter((h) => /post-\d+\.css/i.test(h));
  const postIds = [...html.matchAll(/id=["']elementor-post-(\d+)-css["']/gi)].map((m) => m[1]);

  console.log("post ids", postIds);
  console.log("post css count", postCss.length);
  for (const u of postCss.slice(0, 20)) console.log(" POST", u);
  console.log("elementor css count", elementorCss.length);
  for (const u of elementorCss.slice(0, 40)) console.log(" EL", u);

  // Probe a few candidate URL shapes for home post 3447
  const candidates = [
    `${origin}/wp-content/uploads/elementor/css/post-3447.css`,
    `${origin}/wp-content/uploads/elementor/css/post-3447.css?ver=1`,
    `${origin}/elementor/css/post-3447.css`,
  ];
  // Also absolute post links found in HTML
  for (const u of postCss.slice(0, 5)) {
    candidates.push(u.startsWith("http") ? u : new URL(u, origin).href);
  }

  for (const url of [...new Set(candidates)]) {
    try {
      const r = await fetch(url, {
        method: "GET",
        headers: { "User-Agent": "Mozilla/5.0" },
        redirect: "follow",
      });
      const ct = r.headers.get("content-type") || "";
      const text = await r.text();
      console.log("TRY", r.status, ct.slice(0, 40), text.length, url.slice(0, 120));
      if (r.ok && text.length > 100 && /elementor-element-/i.test(text)) {
        console.log("  MATCH sample:", text.slice(0, 200).replace(/\s+/g, " "));
      }
    } catch (e) {
      console.log("TRY FAIL", url, e.message);
    }
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
