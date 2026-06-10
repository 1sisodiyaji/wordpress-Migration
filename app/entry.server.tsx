import fs from "node:fs";
import { PassThrough } from "node:stream";
import { createReadableStreamFromReadable } from "@react-router/node";
import type { AppLoadContext, EntryContext } from "react-router";
import { ServerRouter } from "react-router";
import { isbot } from "isbot";
import type { RenderToPipeableStreamOptions } from "react-dom/server";
import { renderToPipeableStream } from "react-dom/server";
import {
  getPreviewStaticDiskPath,
  previewDocumentExists,
  syncPreviewDocument,
} from "@/api/wp/sync-preview-document";
import { siteHasData } from "@/api/wp/sites";

export const streamTimeout = 5_000;

const PREVIEW_PATH_RE = /^\/preview-static\/([a-z0-9-]+)\.html$/i;

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

export default function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  routerContext: EntryContext,
  loadContext: AppLoadContext,
) {
  const rawPreview = tryRawPreviewResponse(request);
  if (rawPreview) return rawPreview;

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
