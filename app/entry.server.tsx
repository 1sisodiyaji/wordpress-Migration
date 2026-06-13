import fs from "node:fs";
import path from "node:path";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import {
  renderWorkspaceBrowseHtml,
  renderWorkspacePreviewHtml,
} from "@/api/workspace/render-html";
import {
  getPreviewStaticDiskPath,
  previewDocumentExists,
  syncPreviewDocument,
} from "@/api/wp/sync-preview-document";
import { migrationLogsJsonResponse } from "@/api/migration/logs-payload.server";
import { siteHasData } from "@/api/wp/sites";

const MIGRATION_LOGS_API_RE = /^\/api\/migrate\/([a-z0-9-]+)\/logs$/i;

export const streamTimeout = 5_000;

const PREVIEW_PATH_RE = /^\/preview-static\/([a-z0-9-]+)\.html$/i;
const WORKSPACE_BROWSE_RE = /^\/workspace\/([a-z0-9-]+)\/browse$/i;
const WORKSPACE_PREVIEW_RE = /^\/workspace\/([a-z0-9-]+)\/preview$/i;
const SITES_ASSET_RE = /^\/sites\/([a-z0-9-]+)\/(.+)$/i;

function tryRawPreviewResponse(request: Request): Response | null {
  const url = new URL(request.url);
  const match = url.pathname.match(PREVIEW_PATH_RE);
  if (!match || request.method.toUpperCase() !== "GET") return null;

  const slug = match[1];
  if (!siteHasData(slug)) {
    return new Response("Preview not found", { status: 404 });
  }

  try {
    if (!previewDocumentExists(slug)) syncPreviewDocument(slug);
    const html = fs.readFileSync(getPreviewStaticDiskPath(slug), "utf8");
    return new Response(html, {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return new Response(err instanceof Error ? err.message : "Preview error", {
      status: 500,
    });
  }
}

function tryMigratedSitesStaticResponse(request: Request): Response | null {
  const url = new URL(request.url);
  if (request.method.toUpperCase() !== "GET") return null;

  const match = url.pathname.match(SITES_ASSET_RE);
  if (!match) return null;

  const disk = path.join(process.cwd(), "public", "sites", match[1], match[2]);
  if (!fs.existsSync(disk) || !fs.statSync(disk).isFile()) return null;

  const body = fs.readFileSync(disk);
  const ext = path.extname(disk).toLowerCase();
  const type =
    ext === ".css"
      ? "text/css; charset=utf-8"
      : ext === ".js"
        ? "text/javascript; charset=utf-8"
        : "application/octet-stream";

  return new Response(body, {
    headers: { "Content-Type": type, "Cache-Control": "public, max-age=3600" },
  });
}

function tryMigrationLogsApiResponse(request: Request): Response | null {
  if (request.method.toUpperCase() !== "GET") return null;
  const match = new URL(request.url).pathname.match(MIGRATION_LOGS_API_RE);
  if (!match) return null;
  return migrationLogsJsonResponse(match[1]);
}

async function tryRawWorkspaceIframeResponse(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  if (request.method.toUpperCase() !== "GET") return null;

  const browseMatch = url.pathname.match(WORKSPACE_BROWSE_RE);
  if (browseMatch) {
    return renderWorkspaceBrowseHtml(browseMatch[1], url);
  }

  const previewMatch = url.pathname.match(WORKSPACE_PREVIEW_RE);
  if (previewMatch) {
    return renderWorkspacePreviewHtml(previewMatch[1], url);
  }

  return null;
}

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) {
  const rawPreview = tryRawPreviewResponse(request);
  if (rawPreview) return rawPreview;

  const migratedStatic = tryMigratedSitesStaticResponse(request);
  if (migratedStatic) return migratedStatic;

  const migrationLogs = tryMigrationLogsApiResponse(request);
  if (migrationLogs) return migrationLogs;

  const workspaceIframe = await tryRawWorkspaceIframeResponse(request);
  if (workspaceIframe) return workspaceIframe;

  if (request.method.toUpperCase() === "HEAD") {
    return new Response(null, {
      status: responseStatusCode,
      headers: responseHeaders,
    });
  }

  return new Promise((resolve, reject) => {
    let shellRendered = false;
    const userAgent = request.headers.get("user-agent");

    const readyOption: keyof RenderToPipeableStreamOptions =
      (userAgent && isbot(userAgent)) || routerContext.isSpaMode
        ? "onAllReady"
        : "onShellReady";

    let timeoutId: ReturnType<typeof setTimeout> | undefined = setTimeout(
      () => abort(),
      streamTimeout + 1000,
    );

    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter context={routerContext} url={request.url} />,
      {
        [readyOption]() {
          shellRendered = true;
          const body = new PassThrough({
            final(callback) {
              clearTimeout(timeoutId);
              timeoutId = undefined;
              callback();
            },
          });
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");

          pipe(body);

          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            }),
          );
        },
        onShellError(error: unknown) {
          reject(error);
        },
        onError(error: unknown) {
          responseStatusCode = 500;
          if (shellRendered) {
            console.error(error);
          }
        },
      },
    );
  });
}
