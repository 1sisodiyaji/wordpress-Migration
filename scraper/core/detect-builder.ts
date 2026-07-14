import { getWpUrl } from "../../lib/wp/config";
import { wpHttpFetchText } from "../../lib/wp/http";
import { detectBuilderFromHtml, type PageBuilder } from "./lib/html-extract";

export async function detectSitePageBuilder(
  sampleUrl = getWpUrl(),
): Promise<PageBuilder> {
  const { response: res, text: html } = await wpHttpFetchText(sampleUrl);
  if (!res.ok) return "unknown";
  return detectBuilderFromHtml(html);
}
