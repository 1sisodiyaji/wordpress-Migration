import fs from "node:fs/promises";
import path from "node:path";
import {
  getActiveSiteSlug,
  getMigratedPublicDir,
  getMigratedPublicUrlPrefix,
} from "../../../app/api/wp/config";
import { mergeFontRegistry } from "../../../app/api/wp/font-registry";
import { wpHttpFetch } from "../../../app/api/wp/http";
import { resolveUrl } from "./css-download";

const FONT_EXT =
  /\.(woff2?|ttf|otf|eot)(\?|#|$)|\/fonts\/|font\/|\.woff2/i;

let globalFontRegistry: Map<string, string> | null = null;

export function getFontRegistry(): Map<string, string> {
  if (!globalFontRegistry) globalFontRegistry = new Map();
  return globalFontRegistry;
}

export function resetFontRegistry(): void {
  globalFontRegistry = new Map();
}

export function persistFontRegistry(siteSlug?: string): void {
  const slug = siteSlug ?? getActiveSiteSlug();
  if (!slug || !globalFontRegistry?.size) return;
  mergeFontRegistry(slug, globalFontRegistry);
}

export function isFontAssetUrl(url: string): boolean {
  if (url.startsWith("data:")) return false;
  const lower = url.toLowerCase();
  return (
    FONT_EXT.test(lower) ||
    lower.includes("fonts.gstatic.com") ||
    lower.includes("/uploads/elementor/custom-fonts/")
  );
}

function fontDir(): string {
  return path.join(getMigratedPublicDir(), "fonts");
}

function sanitizeFontFilename(url: string, index: number): string {
  const parsed = new URL(url.split("?")[0]!);
  const base = parsed.pathname.split("/").filter(Boolean).pop() || "font";
  const hash = Buffer.from(url).toString("base64url").slice(0, 8);
  const ext = path.extname(base) || ".woff2";
  const stem = base.replace(ext, "") || "font";
  return `${index}-${stem}-${hash}${ext}`.replace(/[^a-zA-Z0-9._-]/g, "_");
}

/** Download font file; returns local public path. */
export async function downloadFont(
  absoluteUrl: string,
  registry = getFontRegistry(),
): Promise<string | null> {
  const normalized = absoluteUrl.split("?")[0]!;
  const lookup = registry.has(absoluteUrl)
    ? absoluteUrl
    : registry.has(normalized)
      ? normalized
      : null;
  if (lookup) return registry.get(lookup)!;

  const dir = fontDir();
  await fs.mkdir(dir, { recursive: true });
  const index = registry.size;
  const filename = sanitizeFontFilename(absoluteUrl, index);
  const publicPath = `${getMigratedPublicUrlPrefix()}/fonts/${filename}`;
  const diskPath = path.join(dir, filename);

  try {
    const res = await wpHttpFetch(absoluteUrl);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    await fs.writeFile(diskPath, buf);
    registry.set(absoluteUrl, publicPath);
    registry.set(normalized, publicPath);
    return publicPath;
  } catch {
    return null;
  }
}

/** Rewrite CSS url() — mirror fonts locally when possible. */
export async function rewriteCssFontUrls(
  css: string,
  cssFileUrl: string,
  registry = getFontRegistry(),
): Promise<string> {
  const fontUrls = new Set<string>();
  css.replace(/url\((['"]?)([^'")]+)\1\)/g, (_match, _quote, assetUrl: string) => {
    if (assetUrl.startsWith("data:")) return "";
    const absolute = resolveUrl(assetUrl.trim(), cssFileUrl);
    if (isFontAssetUrl(absolute)) fontUrls.add(absolute);
    return "";
  });
  await Promise.all([...fontUrls].map((url) => downloadFont(url, registry)));

  return css.replace(
    /url\((['"]?)([^'")]+)\1\)/g,
    (match, quote, assetUrl: string) => {
      if (assetUrl.startsWith("data:")) return match;
      const absolute = resolveUrl(assetUrl.trim(), cssFileUrl);
      if (!isFontAssetUrl(absolute)) {
        if (absolute.startsWith("http")) {
          return `url(${quote}${absolute}${quote})`;
        }
        return match;
      }
      const local =
        registry.get(absolute) ?? registry.get(absolute.split("?")[0]!);
      return local ? `url(${quote}${local}${quote})` : match;
    },
  );
}
