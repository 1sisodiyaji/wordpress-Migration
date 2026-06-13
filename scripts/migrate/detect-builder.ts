import { getWpUrl } from "../../app/api/wp/config";
import { wpHttpFetchText } from "../../app/api/wp/http";
import { detectBuilderFromHtml, type PageBuilder } from "./lib/html-extract";

export async function detectSitePageBuilder(
  sampleUrl = getWpUrl(),
): Promise<PageBuilder> {
  const { response: res, text: html } = await wpHttpFetchText(sampleUrl);
  if (!res.ok) return "unknown";
  return detectBuilderFromHtml(html);
}
