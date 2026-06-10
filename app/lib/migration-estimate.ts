/** Rough crawl duration from observed Elementor full-site migrations. */
export function estimateCrawlMinutes(totalPages: number): {
  minMinutes: number;
  maxMinutes: number;
} {
  if (totalPages <= 0) {
    return { minMinutes: 1, maxMinutes: 2 };
  }

  const minSec = Math.max(30, totalPages * 2);
  const maxSec = Math.max(60, totalPages * 6);

  return {
    minMinutes: Math.max(1, Math.ceil(minSec / 60)),
    maxMinutes: Math.max(2, Math.ceil(maxSec / 60)),
  };
}

export function formatCrawlDuration(totalPages: number): string {
  const { minMinutes, maxMinutes } = estimateCrawlMinutes(totalPages);
  if (minMinutes === maxMinutes) {
    return `approximately ${minMinutes} minute${minMinutes === 1 ? "" : "s"}`;
  }
  return `approximately ${minMinutes}–${maxMinutes} minutes`;
}

export function formatCrawlEstimate(totalPages: number): string {
  const pageLabel = totalPages === 1 ? "1 page" : `${totalPages} pages`;
  return `${pageLabel} — ${formatCrawlDuration(totalPages)}`;
}
