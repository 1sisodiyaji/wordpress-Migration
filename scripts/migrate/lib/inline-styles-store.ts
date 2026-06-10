import fs from "node:fs/promises";
import path from "node:path";
import {
  getMigratedPublicDir,
  getMigratedPublicUrlPrefix,
} from "../../../app/api/wp/config";

export interface PersistedInlineStyle {
  id?: string;
  publicPath: string;
  bytes: number;
}

function safeId(id: string | undefined, index: number): string {
  const base = (id ?? `inline-style-${index}`)
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  return base || `inline-style-${index}`;
}

/**
 * Persist head inline CSS (e.g. WP Rocket wpr-usedcss, elementor-frontend-inline).
 * Without this, optimized sites ship zero <link> tags and the clone has no styles.
 */
export async function persistDocumentInlineStyles(
  siteSlug: string,
  inlineStyles: Array<{ id?: string; content: string }>,
  minBytes = 32,
): Promise<PersistedInlineStyle[]> {
  const out: PersistedInlineStyle[] = [];
  const dir = path.join(getMigratedPublicDir(siteSlug), "css");
  await fs.mkdir(dir, { recursive: true });
  const prefix = getMigratedPublicUrlPrefix(siteSlug);

  for (let i = 0; i < inlineStyles.length; i++) {
    const block = inlineStyles[i]!;
    const content = block.content?.trim() ?? "";
    if (content.length < minBytes) continue;

    const id = safeId(block.id, i);
    const filename = `inline-${id}.css`;
    const diskPath = path.join(dir, filename);
    await fs.writeFile(diskPath, content, "utf8");
    out.push({
      id: block.id,
      publicPath: `${prefix}/css/${filename}`,
      bytes: content.length,
    });
  }

  return out;
}
