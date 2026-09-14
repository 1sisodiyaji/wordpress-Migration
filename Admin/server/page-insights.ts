export interface PageInsight {
  url: string;
  ok: boolean;
  error?: string;
  status?: number;
  title?: string;
  /** Time to first byte (ms) */
  ttfbMs?: number;
  /** Full download time for HTML (ms) */
  downloadMs?: number;
  htmlBytes?: number;
  images?: number;
  imagesMissingSize?: number;
  scripts?: number;
  stylesheets?: number;
  fonts?: number;
  iframes?: number;
  headings?: number;
  /** Heuristic 0–100; higher = more layout-shift risk from HTML structure */
  clsRisk?: number;
  clsRiskLabel?: "low" | "moderate" | "high";
  findings?: string[];
  frameBlocked?: boolean;
}

function countMatches(html: string, re: RegExp): number {
  const m = html.match(re);
  return m ? m.length : 0;
}

function extractTitle(html: string): string | undefined {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m?.[1]?.replace(/\s+/g, " ").trim().slice(0, 160) || undefined;
}

function analyzeHtml(html: string): Omit<PageInsight, "url" | "ok" | "ttfbMs" | "downloadMs" | "status" | "frameBlocked"> {
  const images = countMatches(html, /<img\b/gi);
  const imgTags = html.match(/<img\b[^>]*>/gi) ?? [];
  const imagesMissingSize = imgTags.filter((tag) => {
    const hasW = /\bwidth\s*=/i.test(tag) || /\bstyle\s*=\s*["'][^"']*\bwidth\s*:/i.test(tag);
    const hasH = /\bheight\s*=/i.test(tag) || /\bstyle\s*=\s*["'][^"']*\bheight\s*:/i.test(tag);
    return !(hasW && hasH);
  }).length;

  const scripts = countMatches(html, /<script\b/gi);
  const stylesheets = countMatches(html, /<link\b[^>]*rel\s*=\s*["']stylesheet["']/gi);
  const fonts = countMatches(html, /fonts\.googleapis|fonts\.gstatic|@font-face/gi);
  const iframes = countMatches(html, /<iframe\b/gi);
  const headings = countMatches(html, /<h[1-6]\b/gi);
  const htmlBytes = Buffer.byteLength(html, "utf8");

  const findings: string[] = [];
  let risk = 0;

  if (imagesMissingSize > 0) {
    const ratio = images > 0 ? imagesMissingSize / images : 1;
    risk += Math.min(55, Math.round(ratio * 55 + imagesMissingSize * 2));
    findings.push(
      `${imagesMissingSize} of ${images} image(s) lack width/height — common CLS source.`,
    );
  }
  if (fonts > 0) {
    risk += 12;
    findings.push("Web fonts detected; ensure font-display and size fallbacks to limit text shift.");
  }
  if (iframes > 0) {
    risk += Math.min(20, iframes * 6);
    findings.push(`${iframes} iframe(s) can reserve space late and shift layout.`);
  }
  if (htmlBytes > 500_000) {
    risk += 10;
    findings.push(`Large HTML document (${(htmlBytes / 1024).toFixed(0)} KB) may delay first paint.`);
  }
  if (scripts > 25) {
    risk += 8;
    findings.push(`High script count (${scripts}) can delay interactivity and late layout.`);
  }
  if (images === 0 && scripts === 0) {
    findings.push("Sparse markup — confirm the homepage HTML was fetched correctly.");
  }
  if (findings.length === 0) {
    findings.push("No major HTML-structure CLS risks detected.");
  }

  const clsRisk = Math.max(0, Math.min(100, risk));
  const clsRiskLabel: PageInsight["clsRiskLabel"] =
    clsRisk >= 60 ? "high" : clsRisk >= 30 ? "moderate" : "low";

  return {
    title: extractTitle(html),
    htmlBytes,
    images,
    imagesMissingSize,
    scripts,
    stylesheets,
    fonts,
    iframes,
    headings,
    clsRisk,
    clsRiskLabel,
    findings,
  };
}

function frameBlockedFromHeaders(headers: Headers): boolean {
  const xfo = headers.get("x-frame-options");
  if (xfo && /deny|sameorigin/i.test(xfo)) return true;
  const csp = headers.get("content-security-policy") ?? "";
  if (/frame-ancestors\s+['"]?none['"]?/i.test(csp)) return true;
  if (/frame-ancestors\s+'self'/i.test(csp) && !/frame-ancestors\s+\*/i.test(csp)) return true;
  return false;
}

export async function fetchPageInsight(url: string, timeoutMs = 20_000): Promise<PageInsight> {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "MigrationStudio-PageInsights/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
    });
    const ttfbMs = Date.now() - started;
    const html = await res.text();
    const downloadMs = Date.now() - started;

    if (!res.ok) {
      return {
        url,
        ok: false,
        status: res.status,
        ttfbMs,
        downloadMs,
        error: `HTTP ${res.status}`,
        frameBlocked: frameBlockedFromHeaders(res.headers),
      };
    }

    return {
      url: res.url || url,
      ok: true,
      status: res.status,
      ttfbMs,
      downloadMs,
      frameBlocked: frameBlockedFromHeaders(res.headers),
      ...analyzeHtml(html),
    };
  } catch (err) {
    return {
      url,
      ok: false,
      downloadMs: Date.now() - started,
      error: err instanceof Error ? err.message : String(err),
    };
  } finally {
    clearTimeout(timer);
  }
}

export function comparisonSummary(original: PageInsight, migrated: PageInsight) {
  const deltas: { label: string; original: string; migrated: string; better: "original" | "migrated" | "same" }[] = [];

  function numDelta(label: string, a?: number, b?: number, lowerIsBetter = true) {
    if (a == null || b == null) return;
    const better =
      a === b ? "same" : lowerIsBetter ? (b < a ? "migrated" : "original") : b > a ? "migrated" : "original";
    deltas.push({
      label,
      original: String(a),
      migrated: String(b),
      better,
    });
  }

  numDelta("TTFB (ms)", original.ttfbMs, migrated.ttfbMs);
  numDelta("HTML download (ms)", original.downloadMs, migrated.downloadMs);
  numDelta("HTML size (bytes)", original.htmlBytes, migrated.htmlBytes);
  numDelta("CLS risk", original.clsRisk, migrated.clsRisk);
  numDelta("Images", original.images, migrated.images);
  numDelta("Scripts", original.scripts, migrated.scripts);

  return deltas;
}
