export interface UrlMeasureResult {
  loadTimeMs: number;
  pageSizeBytes: number;
  ttfbMs: number;
  status: number;
  error?: string;
}

/** Server-side fetch timing (Lighthouse-style transfer weight + wall clock). */
export async function measureUrl(url: string): Promise<UrlMeasureResult> {
  const t0 = Date.now();
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "WP-Migrate-Metrics/1.0",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(60_000),
    });
    const ttfbMs = Date.now() - t0;
    const body = await res.text();
    const loadTimeMs = Date.now() - t0;
    const pageSizeBytes = new TextEncoder().encode(body).length;

    return {
      loadTimeMs,
      pageSizeBytes,
      ttfbMs,
      status: res.status,
    };
  } catch (err) {
    return {
      loadTimeMs: Date.now() - t0,
      pageSizeBytes: 0,
      ttfbMs: Date.now() - t0,
      status: 0,
      error: err instanceof Error ? err.message : "Measure failed",
    };
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function formatMs(ms: number): string {
  if (ms < 1000) return `${ms} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

export function scoreLoadTime(ms: number): { score: number; label: string } {
  let score = 100;
  if (ms > 1000) score -= 15;
  if (ms > 2500) score -= 20;
  if (ms > 4000) score -= 25;
  if (ms > 8000) score -= 20;
  const s = Math.max(0, score);
  return {
    score: s,
    label: s >= 90 ? "Fast" : s >= 70 ? "Moderate" : s >= 50 ? "Slow" : "Poor",
  };
}

export function scorePageSize(bytes: number): { score: number; label: string } {
  let score = 100;
  if (bytes > 500_000) score -= 10;
  if (bytes > 1_500_000) score -= 20;
  if (bytes > 3_000_000) score -= 25;
  if (bytes > 6_000_000) score -= 20;
  const s = Math.max(0, score);
  return {
    score: s,
    label: s >= 90 ? "Light" : s >= 70 ? "OK" : s >= 50 ? "Heavy" : "Very heavy",
  };
}
