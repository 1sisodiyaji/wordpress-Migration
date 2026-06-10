import type { PageShellAssets } from "./types";

function scriptBlob(item: PageShellAssets["scripts"][number]): string {
  return `${item.src ?? ""}\n${item.inline ?? ""}\n${item.id ?? ""}`;
}

/** Scripts that only work on live WordPress or break on Next (Cloudflare, WP security). */
export function shouldDropShellScript(
  item: PageShellAssets["scripts"][number],
): boolean {
  const blob = scriptBlob(item);

  if (
    /challenge-platform|__CF\$cv|cdn-cgi|cf-browser-verification/i.test(blob)
  ) {
    return true;
  }

  // WordPress security / honeypot plugins (injected into forms via jQuery on WP only).
  if (/fWNioB|kAvlaCYy|jQuery\.ajaxSetup/i.test(blob)) {
    return true;
  }

  return false;
}

export function sanitizePageShellAssets(
  assets: PageShellAssets | null,
): PageShellAssets | null {
  if (!assets) return null;

  return {
    scripts: assets.scripts.filter((item) => !shouldDropShellScript(item)),
    styles: assets.styles,
  };
}
