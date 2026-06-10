import { WP_URL } from "../../app/api/wp/config";
import { wpHttpFetch } from "../../app/api/wp/http";
import { detectBuilderFromHtml, type PageBuilder } from "./lib/html-extract";

export async function detectSitePageBuilder(
  sampleUrl = WP_URL,
): Promise<PageBuilder> {
  const res = await wpHttpFetch(sampleUrl);
  if (!res.ok) return "unknown";
  const html = await res.text();
  return detectBuilderFromHtml(html);
}
