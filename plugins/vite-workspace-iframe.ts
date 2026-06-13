import type { Plugin, ViteDevServer } from "vite";

const BROWSE_RE = /^\/workspace\/([a-z0-9-]+)\/browse(?:\?.*)?$/i;
const PREVIEW_RE = /^\/workspace\/([a-z0-9-]+)\/preview(?:\?.*)?$/i;

async function loadRenderModule(server: ViteDevServer) {
  return server.ssrLoadModule("/app/api/workspace/render-html.ts") as Promise<{
    renderWorkspaceBrowseHtml: (
      slug: string,
      requestUrl: URL,
    ) => Promise<Response>;
    renderWorkspacePreviewHtml: (slug: string, requestUrl: URL) => Response;
  }>;
}

/** Serve raw workspace iframe HTML before React Router (avoids SPA shell in iframes). */
export function viteWorkspaceIframe(): Plugin {
  return {
    name: "vite-workspace-iframe",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.method !== "GET" && req.method !== "HEAD") return next();

        const rawUrl = req.url ?? "";
        const browseMatch = rawUrl.match(BROWSE_RE);
        const previewMatch = rawUrl.match(PREVIEW_RE);
        if (!browseMatch && !previewMatch) return next();

        const slug = (browseMatch ?? previewMatch)![1];
        const origin = `http://${req.headers.host ?? "localhost"}`;
        const requestUrl = new URL(rawUrl, origin);

        void (async () => {
          try {
            const { renderWorkspaceBrowseHtml, renderWorkspacePreviewHtml } =
              await loadRenderModule(server);

            const response = browseMatch
              ? await renderWorkspaceBrowseHtml(slug, requestUrl)
              : renderWorkspacePreviewHtml(slug, requestUrl);

            res.statusCode = response.status;
            for (const [key, value] of response.headers.entries()) {
              res.setHeader(key, value);
            }
            if (req.method === "HEAD") {
              res.end();
              return;
            }
            const body = await response.text();
            res.end(body);
          } catch (err) {
            res.statusCode = 500;
            res.end(err instanceof Error ? err.message : "Workspace iframe error");
          }
        })();
      });
    },
  };
}
