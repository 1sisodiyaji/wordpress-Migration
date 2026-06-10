/** Client/server flags shared across Vite (Remix) and migrate scripts. */
export function useLiveCss(): boolean {
  if (typeof import.meta !== "undefined" && import.meta.env?.VITE_WP_LIVE_CSS !== undefined) {
    return String(import.meta.env.VITE_WP_LIVE_CSS) !== "false";
  }
  return (
    process.env.VITE_WP_LIVE_CSS !== "false" &&
    process.env.NEXT_PUBLIC_WP_LIVE_CSS !== "false"
  );
}

export function wordpressUrl(): string {
  return (
    process.env.WORDPRESS_URL ??
    (typeof import.meta !== "undefined"
      ? import.meta.env?.VITE_WORDPRESS_URL
      : undefined) ??
    "http://localhost:8080"
  ).replace(/\/$/, "");
}
