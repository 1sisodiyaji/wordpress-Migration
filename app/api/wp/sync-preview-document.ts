import fs from "node:fs";
import path from "node:path";
import { buildRawPreviewDocument } from "./build-raw-document";

const PREVIEW_DIR = path.join(process.cwd(), "public", "preview-static");

/** Disk path for generated preview HTML. */
export function getPreviewStaticDiskPath(siteSlug: string): string {
  return path.join(PREVIEW_DIR, `${siteSlug}.html`);
}

export function previewDocumentPublicPath(siteSlug: string): string {
  return `/preview-static/${siteSlug}.html`;
}

export function previewDocumentExists(siteSlug: string): boolean {
  return fs.existsSync(getPreviewStaticDiskPath(siteSlug));
}

/** Write iframe-ready HTML (served via /preview-static/:slug.html middleware). */
export function syncPreviewDocument(siteSlug: string, routePath = "/"): string {
  const html = buildRawPreviewDocument(siteSlug, routePath);
  fs.mkdirSync(PREVIEW_DIR, { recursive: true });
  fs.writeFileSync(getPreviewStaticDiskPath(siteSlug), html, "utf8");
  return previewDocumentPublicPath(siteSlug);
}
