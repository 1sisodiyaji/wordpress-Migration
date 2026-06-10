import fs from "node:fs/promises";
import path from "node:path";
import * as cheerio from "cheerio";
import { wpFetchAllLight } from "../../app/api/wp/client";
import { getMigratedDataDir } from "../../app/api/wp/config";
import { wpHttpFetch } from "../../app/api/wp/http";
import type {
  ElementorSnippet,
  ElementorSystemManifest,
  ElementorTemplate,
  PageShellAssets,
} from "../../app/api/wp/types";
import { fetchElementorMetaFromApi } from "./builders/elementor/resolve-api";
import { transformHtmlForNext } from "./lib/html-transform";

interface LightPost {
  id: number;
  slug: string;
  link: string;
  title: { rendered: string };
  meta?: Record<string, unknown>;
}

function extractAssetsFromHtml(html: string): PageShellAssets {
  const { assets } = transformHtmlForNext(html);
  return assets;
}

async function crawlSnippetAssets(link: string): Promise<PageShellAssets> {
  try {
    const res = await wpHttpFetch(link, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) return { scripts: [], styles: [] };
    const html = await res.text();
    const $ = cheerio.load(html);
    const body = $("body").html() ?? html;
    return extractAssetsFromHtml(body);
  } catch {
    return { scripts: [], styles: [] };
  }
}

async function fetchTemplateList(
  postType: string,
): Promise<ElementorTemplate[]> {
  try {
    const items = await wpFetchAllLight<LightPost>(`/wp/v2/${postType}`, {
      status: "publish",
    });
    return items.map((t) => ({
      id: t.id,
      slug: t.slug,
      title: t.title?.rendered?.replace(/<[^>]+>/g, "") ?? t.slug,
      link: t.link,
      templateType: postType,
    }));
  } catch {
    return [];
  }
}

/**
 * Elementor architecture on RADIUS:
 * - elementor_library: headers, footers, popups, loops (Theme Builder)
 * - elementor_snippet: Custom Code (conditional CSS/JS)
 * - e-floating-buttons: floating CTAs
 * Templates are embedded in page HTML when crawled; this fetches metadata + snippet source.
 */
export async function fetchElementorSystem(): Promise<ElementorSystemManifest> {
  console.log("  🧩 Elementor system (templates, snippets, custom code)…");

  const [snippetsRaw, templates, floatingButtons] = await Promise.all([
    wpFetchAllLight<LightPost>("/wp/v2/elementor_snippet", {
      status: "publish",
    }).catch(() => [] as LightPost[]),
    fetchTemplateList("elementor_library"),
    fetchTemplateList("e-floating-buttons"),
  ]);

  const snippets: ElementorSnippet[] = [];
  const delay = Number(process.env.MIGRATE_CRAWL_DELAY_MS ?? "300");

  for (let i = 0; i < snippetsRaw.length; i++) {
    const s = snippetsRaw[i];
    if (i > 0 && delay > 0) await new Promise((r) => setTimeout(r, delay));

    const assets = await crawlSnippetAssets(s.link);
    snippets.push({
      id: s.id,
      slug: s.slug,
      title: s.title?.rendered?.replace(/<[^>]+>/g, "") ?? s.slug,
      link: s.link,
      scripts: assets.scripts,
      styles: assets.styles,
    });

    if (assets.scripts.length || assets.styles.length) {
      console.log(
        `  ✓ snippet ${s.slug} (${assets.scripts.length} scripts, ${assets.styles.length} styles)`,
      );
    }
  }

  const apiMeta = await fetchElementorMetaFromApi();

  const manifest: ElementorSystemManifest = {
    fetchedAt: new Date().toISOString(),
    kitId: apiMeta.kitId,
    snippets,
    templates,
    floatingButtons,
    globalSnippetIds: snippets.map((s) => s.id),
  };

  const dir = path.join(getMigratedDataDir(), "elementor");
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(
    path.join(dir, "system.json"),
    JSON.stringify(manifest, null, 2),
    "utf8",
  );

  // Global custom CSS/JS bundle for layout injection
  const globalStyles = snippets.flatMap((s) => s.styles);
  const globalScripts = snippets.flatMap((s) => s.scripts);

  if (globalStyles.length) {
    await fs.writeFile(
      path.join(dir, "global-styles.css"),
      globalStyles.map((s) => s.inline).filter(Boolean).join("\n\n"),
      "utf8",
    );
  }

  if (globalScripts.length) {
    await fs.writeFile(
      path.join(dir, "global-scripts.json"),
      JSON.stringify(globalScripts, null, 2),
      "utf8",
    );
  }

  console.log(
    `   ${templates.length} templates, ${snippets.length} snippets, ${floatingButtons.length} floating buttons`,
  );

  return manifest;
}
