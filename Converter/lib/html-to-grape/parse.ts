/** Minimal HTML helpers — no DOM dependency. */

const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "param",
  "source",
  "track",
  "wbr",
]);

/** Extract open-tag name from a `<tag …>` start. */
export function tagNameOf(openTag: string): string {
  const m = openTag.match(/^<\s*([a-zA-Z0-9:-]+)/);
  return (m?.[1] ?? "").toLowerCase();
}

/** Parse class list from an open tag. */
export function classesOf(openTag: string): string[] {
  const m = openTag.match(/\bclass\s*=\s*(["'])(.*?)\1/i);
  if (!m?.[2]) return [];
  return m[2].split(/\s+/).filter(Boolean);
}

/** Read a named attribute value from an open tag. */
export function attrOf(openTag: string, name: string): string | null {
  const re = new RegExp(`\\b${name}\\s*=\\s*(["'])(.*?)\\1`, "i");
  const m = openTag.match(re);
  return m?.[2] ?? null;
}

/**
 * Given html starting at an open tag, return the full balanced element
 * (open…close) or null if unbalanced / void.
 */
export function extractBalancedElement(html: string, start: number): string | null {
  if (start < 0 || start >= html.length || html[start] !== "<") return null;
  const openMatch = html.slice(start).match(/^<([a-zA-Z0-9:-]+)(\s[^>]*)?>/);
  if (!openMatch) return null;

  const tag = openMatch[1].toLowerCase();
  const openLen = openMatch[0].length;
  if (VOID_TAGS.has(tag) || /\/\s*>$/.test(openMatch[0])) {
    return openMatch[0];
  }

  let depth = 1;
  let i = start + openLen;
  const openRe = new RegExp(`<${tag}\\b[^>]*>`, "gi");
  const closeRe = new RegExp(`</${tag}\\s*>`, "gi");

  while (i < html.length && depth > 0) {
    openRe.lastIndex = i;
    closeRe.lastIndex = i;
    const nextOpen = openRe.exec(html);
    const nextClose = closeRe.exec(html);
    if (!nextClose) return null;

    const openIdx = nextOpen?.index ?? Infinity;
    const closeIdx = nextClose.index;

    if (openIdx < closeIdx) {
      // Self-closing open of same tag still increases… skip void-like
      const tok = nextOpen![0];
      if (!/\/\s*>$/.test(tok) && !VOID_TAGS.has(tag)) depth += 1;
      i = openIdx + tok.length;
    } else {
      depth -= 1;
      i = closeIdx + nextClose[0].length;
      if (depth === 0) return html.slice(start, i);
    }
  }
  return null;
}

/** Split an HTML fragment into top-level element strings (skips bare text nodes that are only whitespace). */
export function splitTopLevelElements(html: string): string[] {
  const out: string[] = [];
  let i = 0;
  const s = html.trim();
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i]!)) i += 1;
    if (i >= s.length) break;

    if (s[i] !== "<") {
      // Free text — wrap remainder of text until next tag as one chunk
      const next = s.indexOf("<", i);
      const text = (next === -1 ? s.slice(i) : s.slice(i, next)).trim();
      if (text) out.push(`<div data-gjs-type="text">${text}</div>`);
      i = next === -1 ? s.length : next;
      continue;
    }

    // Skip comments / doctype
    if (s.startsWith("<!--", i)) {
      const end = s.indexOf("-->", i + 4);
      i = end === -1 ? s.length : end + 3;
      continue;
    }
    if (s.startsWith("<!", i)) {
      const end = s.indexOf(">", i);
      i = end === -1 ? s.length : end + 1;
      continue;
    }

    const el = extractBalancedElement(s, i);
    if (!el) {
      // Fallback: consume until next sibling-ish boundary
      const next = s.indexOf("<", i + 1);
      out.push(next === -1 ? s.slice(i) : s.slice(i, next));
      i = next === -1 ? s.length : next;
      continue;
    }
    out.push(el);
    i += el.length;
  }
  return out;
}

/** Inner HTML between first open tag and its matching close. */
export function innerHtmlOf(elementHtml: string): string {
  const open = elementHtml.match(/^<[^>]+>/);
  if (!open) return elementHtml;
  const closeIdx = elementHtml.lastIndexOf("</");
  if (closeIdx <= open[0].length) return "";
  return elementHtml.slice(open[0].length, closeIdx).trim();
}
