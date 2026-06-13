import type { Route } from "./+types/workspace.$slug.browse";
import { renderWorkspaceBrowseHtml } from "@/api/workspace/render-html";

export async function loader({ params, request }: Route.LoaderArgs) {
  return renderWorkspaceBrowseHtml(params.slug!, new URL(request.url));
}

export default function WorkspaceLiveBrowse() {
  return null;
}
