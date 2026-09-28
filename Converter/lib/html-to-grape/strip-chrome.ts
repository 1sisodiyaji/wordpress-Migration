import { extractBalancedElement, innerHtmlOf, splitTopLevelElements } from "./parse";

const HEADER_RE =
  /<(header|div)\b[^>]*(?:wp-block-template-part|site-header|elementor-location-header|main-header|theme-header)\b[^>]*>/i;
const FOOTER_RE =
  /<(footer|div)\b[^>]*(?:wp-block-template-part|site-footer|elementor-location-footer|footer-section|main-footer)\b[^>]*>/i;
/** Classic themes often use a bare <header> / <footer> without FSE classes (Abiz). */
const BARE_HEADER_RE = /<header\b[^>]*>/i;
const BARE_FOOTER_RE = /<footer\b[^>]*>/i;

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

function removeFirstMatch(html: string, openRe: RegExp): string {
  const m = html.match(openRe);
  if (!m || m.index == null) return html;
  const el = extractBalancedElement(html, m.index);
  if (!el) return html;
  return html.slice(0, m.index) + html.slice(m.index + el.length);
}

/**
 * Prefer the FSE `<main>` slot inside `.wp-site-blocks` when present;
 * otherwise strip header/footer template parts from the fragment.
 */
export function stripPageChrome(html: string): string {
  const trimmed = (html ?? "").trim();
  if (!trimmed) return "";

  // Classic Abiz / Techboost: content wrapper between theme header and footer.
  const contentOpen = trimmed.match(
    /<div\b[^>]*(?:\bid=["']content["']|class="[^"]*\babiz-theme-data\b)[^>]*>/i,
  );
  if (contentOpen && contentOpen.index != null) {
    const el = extractBalancedElement(trimmed, contentOpen.index);
    if (el) {
      const inner = innerHtmlOf(el).trim();
      if (inner.replace(/<[^>]+>/g, "").trim().length > 20 || /<(section|article|div)\b/i.test(inner)) {
        return inner;
      }
    }
  }

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

  // Classic bare <header>/<footer> (Abiz main-header lives in <header id="main-header">).
  if (htmlLooksLikeFullChrome(next) || htmlLooksLikeFullChrome(trimmed)) {
    next = removeFirstMatch(next, BARE_HEADER_RE);
    next = removeFirstMatch(next, BARE_FOOTER_RE);
  }

  // If still wrapped in wp-site-blocks, unwrap to children
  const siteBlocks = next.match(/<div\b[^>]*\bwp-site-blocks\b[^>]*>/i);
  if (siteBlocks && siteBlocks.index != null) {
    const el = extractBalancedElement(next, siteBlocks.index);
    if (el) {
      const inner = innerHtmlOf(el).trim();
      if (inner) next = inner;
    }
  }

  // Drop empty classic content shell left after chrome removal.
  next = next
    .replace(/<div\b[^>]*\bid=["']content["'][^>]*>\s*<\/div>/gi, "")
    .replace(/<!DOCTYPE[^>]*>/gi, "")
    .replace(/<\/?html\b[^>]*>/gi, "")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, "")
    .replace(/<\/?body\b[^>]*>/gi, "")
    .trim();

  return next;
}

/** True when HTML still looks like it embeds site chrome. */
export function htmlLooksLikeFullChrome(html: string): boolean {
  const s = html ?? "";
  return (
    /\bwp-site-blocks\b/i.test(s) ||
    (/<header\b/i.test(s) && /<footer\b/i.test(s)) ||
    (/\bwp-block-template-part\b/i.test(s) && /<(header|footer)\b/i.test(s)) ||
    (/\bmain-header\b/i.test(s) && /\b(footer-section|main-footer)\b/i.test(s))
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
  if (parts.length > 0) return parts;
  return [body];
}
