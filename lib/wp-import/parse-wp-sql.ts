import fs from "node:fs";

export interface SqlPage {
  postId: number;
  slug: string;
  title: string;
  html: string;
  isElementor?: boolean;
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

/** Parse one SQL string or number token from text starting at i. Returns [value, nextIndex]. */
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

/** Parse `(a, b, 'c', ...)` into field array. */
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

const POST_COL = {
  id: 0,
  content: 4,
  title: 5,
  status: 7,
  name: 11,
  type: 20,
} as const;

/**
 * Extract published pages from a WordPress SQL dump (phpMyAdmin / mysqldump).
 */
export function extractPagesFromSql(sqlPath: string, tablePrefix = "wp_"): SqlPage[] {
  const stat = fs.statSync(sqlPath);
  if (stat.size > MAX_SQL_BYTES) {
    console.warn(
      `  SQL file large (${Math.round(stat.size / 1024 / 1024)}MB) — parsing first ${MAX_SQL_BYTES} bytes`,
    );
  }

  const text = fs.readFileSync(sqlPath, "utf8").slice(0, MAX_SQL_BYTES);
  const table = `${tablePrefix.replace(/`/g, "")}posts`;
  const insertRe = new RegExp(
    `INSERT INTO \`${table}\`\\s*\\([^)]+\\)\\s*VALUES`,
    "gi",
  );

  const pages: SqlPage[] = [];
  const seen = new Set<string>();

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

      const fields = row.fields;
      const postId = Number(fields[POST_COL.id] ?? 0);
      const postType = fields[POST_COL.type] ?? "";
      const postStatus = fields[POST_COL.status] ?? "";
      const postName = fields[POST_COL.name] ?? "";
      const postTitle = fields[POST_COL.title] ?? "";
      const postContent = fields[POST_COL.content] ?? "";

      if (postType !== "page" || postStatus !== "publish") continue;
      if (!postContent.trim() || seen.has(postName)) continue;

      seen.add(postName);
      pages.push({
        postId,
        slug: postName || "page",
        title: postTitle || postName,
        html: postContent,
      });
    }
  }

  return pages;
}

export function extractSiteUrlFromSql(sqlPath: string, tablePrefix = "wp_"): string | undefined {
  const sample = fs.readFileSync(sqlPath, "utf8").slice(0, 3_000_000);
  const table = `${tablePrefix.replace(/`/g, "")}options`;
  const insertRe = new RegExp(
    `INSERT INTO \`${table}\`\\s*\\([^)]+\\)\\s*VALUES`,
    "gi",
  );

  const match = insertRe.exec(sample);
  if (!match) return undefined;

  const blockStart = match.index + match[0].length;
  const blockEnd = findStatementEnd(sample, blockStart);
  const block = sample.slice(blockStart, blockEnd);

  let i = 0;
  while (i < block.length) {
    while (i < block.length && block[i] !== "(") i++;
    if (i >= block.length) break;

    const row = parseSqlRow(block, i);
    if (!row) break;
    i = row.end;

    const name = row.fields[1] ?? "";
    const value = row.fields[2] ?? "";
    if (name === "siteurl" || name === "home") return value;
  }

  return undefined;
}
