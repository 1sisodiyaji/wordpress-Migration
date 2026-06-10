import { getWpUrl } from "../../app/api/wp/config";
import { wpHttpFetch } from "../../app/api/wp/http";
import { detectBuilderFromHtml, type PageBuilder } from "./lib/html-extract";

export async function detectSitePageBuilder(
  sampleUrl = getWpUrl(),
): Promise<PageBuilder> {
  const res = await wpHttpFetch(sampleUrl);
  if (!res.ok) return "unknown";
  const html = await res.text();
  return detectBuilderFromHtml(html);
}
