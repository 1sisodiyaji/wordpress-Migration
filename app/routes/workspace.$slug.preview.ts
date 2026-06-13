import type { Route } from "./+types/workspace.$slug.preview";
import { renderWorkspacePreviewHtml } from "@/api/workspace/render-html";

export async function loader({ params, request }: Route.LoaderArgs) {
  return renderWorkspacePreviewHtml(params.slug!, new URL(request.url));
}

export default function WorkspaceMigratedPreview() {
  return null;
}
