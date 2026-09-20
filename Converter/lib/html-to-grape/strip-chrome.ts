import { extractBalancedElement, innerHtmlOf, splitTopLevelElements } from "./parse";

const HEADER_RE =
  /<(header|div)\b[^>]*(?:wp-block-template-part|site-header|elementor-location-header)[^>]*>/i;
const FOOTER_RE =
  /<(footer|div)\b[^>]*(?:wp-block-template-part|site-footer|elementor-location-footer)[^>]*>/i;

function removeMatchingElements(html: string, openRe: RegExp): string {
  let out = html;
  // Iteratively remove matched balanced elements (headers/footers can nest oddly).
  for (let n = 0; n < 20; n += 1) {
    const m = out.match(openRe);
    if (!m || m.index == null) break;
    const el = extractBalancedElement(out, m.index);
    if (!el) {
      // Can't balance — strip just the open tag to avoid infinite loop
      out = out.slice(0, m.index) + out.slice(m.index + m[0].length);
      continue;
    }
    out = out.slice(0, m.index) + out.slice(m.index + el.length);
  }
  return out;
}

/**
 * Prefer the FSE `<main>` slot inside `.wp-site-blocks` when present;
 * otherwise strip header/footer template parts from the fragment.
 */
export function stripPageChrome(html: string): string {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return "";

  // FSE: take main content only
  const mainOpen = trimmed.match(/<main\b[^>]*>/i);
  if (mainOpen && mainOpen.index != null) {
    const mainEl = extractBalancedElement(trimmed, mainOpen.index);
    if (mainEl) {
      const inner = innerHtmlOf(mainEl);
      if (inner.replace(/<[^>]+>/g, "").trim().length > 20) {
        return inner.trim();
      }
    }
  }

  // Fallback: drop header/footer template parts / site chrome
  let next = removeMatchingElements(trimmed, HEADER_RE);
  next = removeMatchingElements(next, FOOTER_RE);

  // If still wrapped in wp-site-blocks, unwrap to children
  const siteBlocks = next.match(/<div\b[^>]*\bwp-site-blocks\b[^>]*>/i);
  if (siteBlocks && siteBlocks.index != null) {
    const el = extractBalancedElement(next, siteBlocks.index);
    if (el) {
      const inner = innerHtmlOf(el).trim();
      if (inner) next = inner;
    }
  }

  return next.trim();
}

/** True when HTML still looks like it embeds site chrome. */
export function htmlLooksLikeFullChrome(html: string): boolean {
  const s = html ?? "";
  return (
    /\bwp-site-blocks\b/i.test(s) ||
    (/<header\b/i.test(s) && /<footer\b/i.test(s)) ||
    (/\bwp-block-template-part\b/i.test(s) && /<(header|footer)\b/i.test(s))
  );
}

/**
 * Choose the best body fragment for sectioning: prefer stripped main content.
 * Returns top-level section HTML chunks.
 */
export function extractSectionHtmlChunks(html: string): string[] {
  const body = stripPageChrome(html);
  if (!body) return [];

  const parts = splitTopLevelElements(body);
  // Collapse a single wrapper that only exists to hold sections
  if (parts.length === 1) {
    const only = parts[0]!;
    if (/\b(wp-block-group|entry-content|wp-block-post-content)\b/i.test(only)) {
      const inner = innerHtmlOf(only);
      const nested = splitTopLevelElements(inner);
      if (nested.length > 1) return nested;
    }
  }
  return parts.filter((p) => p.replace(/<[^>]+>/g, "").trim().length > 0 || /<(img|video|iframe|svg)\b/i.test(p));
}
