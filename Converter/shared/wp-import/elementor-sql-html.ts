import fs from "node:fs";

export interface PostMetaMap {
  /** post_id → meta_key → meta_value */
  byPost: Map<number, Map<string, string>>;
}

const MAX_SQL_BYTES = 120 * 1024 * 1024;

/** Find end of SQL INSERT statement (semicolon outside quoted strings). */
function findStatementEnd(text: string, start: number): number {
  let inString = false;
  let depth = 0;

  for (let i = start; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === "\\" && i + 1 < text.length) {
        i++;
        continue;
      }
      if (ch === "'") {
        if (text[i + 1] === "'") {
          i++;
          continue;
        }
        inString = false;
      }
      continue;
    }
    if (ch === "'") {
      inString = true;
      continue;
    }
    if (ch === "(") depth++;
    if (ch === ")") depth = Math.max(0, depth - 1);
    if (ch === ";" && depth === 0) return i;
  }
  return text.length;
}

function parseSqlValue(text: string, i: number): [string, number] {
  while (i < text.length && /\s/.test(text[i])) i++;
  if (text[i] === "'") {
    let out = "";
    i++;
    while (i < text.length) {
      const ch = text[i];
      if (ch === "\\" && i + 1 < text.length) {
        const next = text[i + 1];
        if (next === "n") out += "\n";
        else if (next === "r") out += "\r";
        else if (next === "t") out += "\t";
        else out += next;
        i += 2;
        continue;
      }
      if (ch === "'") {
        if (text[i + 1] === "'") {
          out += "'";
          i += 2;
          continue;
        }
        return [out, i + 1];
      }
      out += ch;
      i++;
    }
    return [out, i];
  }
  if (text[i] === "N" && text.slice(i, i + 4).toUpperCase() === "NULL") {
    return ["", i + 4];
  }
  let start = i;
  while (i < text.length && text[i] !== "," && text[i] !== ")") i++;
  return [text.slice(start, i).trim(), i];
}

function parseSqlRow(text: string, start: number): { fields: string[]; end: number } | null {
  let i = start;
  while (i < text.length && text[i] !== "(") i++;
  if (i >= text.length) return null;
  i++;

  const fields: string[] = [];
  while (i < text.length) {
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] === ")") return { fields, end: i + 1 };
    const [value, next] = parseSqlValue(text, i);
    fields.push(value);
    i = next;
    while (i < text.length && /\s/.test(text[i])) i++;
    if (text[i] === ",") {
      i++;
      continue;
    }
    if (text[i] === ")") return { fields, end: i + 1 };
    break;
  }
  return null;
}

/** Parse wp_postmeta rows from a SQL dump. */
export function extractPostMetaFromSql(sqlPath: string, tablePrefix = "wp_"): PostMetaMap {
  const text = fs.readFileSync(sqlPath, "utf8").slice(0, MAX_SQL_BYTES);
  const table = `${tablePrefix.replace(/`/g, "")}postmeta`;
  const insertRe = new RegExp(
    `INSERT INTO \`${table}\`\\s*\\([^)]+\\)\\s*VALUES`,
    "gi",
  );

  const byPost = new Map<number, Map<string, string>>();

  let match: RegExpExecArray | null;
  while ((match = insertRe.exec(text)) !== null) {
    const pos = match.index + match[0].length;
    const end = findStatementEnd(text, pos);
    const block = text.slice(pos, end);

    let i = 0;
    while (i < block.length) {
      while (i < block.length && block[i] !== "(") i++;
      if (i >= block.length) break;

      const row = parseSqlRow(block, i);
      if (!row) break;
      i = row.end;

      const postId = Number(row.fields[1]);
      const metaKey = row.fields[2] ?? "";
      const metaValue = row.fields[3] ?? "";
      if (!postId || !metaKey) continue;

      let meta = byPost.get(postId);
      if (!meta) {
        meta = new Map();
        byPost.set(postId, meta);
      }
      meta.set(metaKey, metaValue);
    }
  }

  return { byPost };
}

interface ElementorWidgetPayload {
  id?: string;
  elType?: string;
  widgetType?: string;
  settings?: { editor?: string };
}

/** Expand Elementor lazy `[elementor-element ...]` placeholders from base64 widget JSON. */
export function expandElementorPlaceholders(html: string): string {
  return html.replace(
    /\[elementor-element\s+k="[^"]*"\s+data="([^"]+)"\]/g,
    (_match, b64: string) => {
      try {
        const payload = JSON.parse(
          Buffer.from(b64, "base64").toString("utf8"),
        ) as ElementorWidgetPayload;
        if (payload.widgetType !== "text-editor" || !payload.settings?.editor) {
          return "";
        }
        const id = payload.id ?? "unknown";
        return (
          `<div class="elementor-element elementor-element-${id} elementor-widget elementor-widget-text-editor" ` +
          `data-id="${id}" data-element_type="widget" data-widget_type="text-editor.default">` +
          `<div class="elementor-widget-container">${payload.settings.editor}</div></div>`
        );
      } catch {
        return "";
      }
    },
  );
}

/** Pull rendered HTML from `_elementor_element_cache` postmeta JSON. */
export function htmlFromElementorCache(metaValue: string): string | null {
  try {
    const parsed = JSON.parse(metaValue) as {
      value?: { content?: string };
    };
    const content = parsed?.value?.content;
    if (!content?.trim()) return null;
    return expandElementorPlaceholders(content);
  } catch {
    return null;
  }
}

export function wrapElementorPage(html: string, postId: number): string {
  return (
    `<div class="elementor elementor-${postId}" data-elementor-type="wp-page" data-elementor-id="${postId}">` +
    `${html}</div>`
  );
}

export function resolveElementorHtml(
  postId: number,
  fallbackHtml: string,
  meta: Map<string, string> | undefined,
): { html: string; isElementor: boolean } {
  if (!meta) return { html: fallbackHtml, isElementor: false };

  const editMode = meta.get("_elementor_edit_mode");
  const cache = meta.get("_elementor_element_cache");
  if (editMode !== "builder" || !cache) {
    return { html: fallbackHtml, isElementor: false };
  }

  const rendered = htmlFromElementorCache(cache);
  if (!rendered) return { html: fallbackHtml, isElementor: false };

  return {
    html: wrapElementorPage(rendered, postId),
    isElementor: true,
  };
}
