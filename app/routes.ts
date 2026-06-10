import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/_index.tsx"),
  route("migrate/:slug/logs", "routes/migrate.$slug.logs.tsx"),
  route("migrate/:slug", "routes/migrate.$slug.tsx"),
  route("workspace/:slug/metrics", "routes/workspace.$slug.metrics.ts"),
  route("workspace/:slug", "routes/workspace.$slug.tsx"),
  route("preview/:site/sync", "routes/preview.$site.sync.ts"),
  route("preview/:site/document", "routes/preview.$site.document.ts"),
  route("preview/:site", "routes/preview.$site.tsx"),
  route(":site", "routes/site.tsx", [
    index("routes/site._index.tsx"),
    route("*", "routes/site.$.tsx"),
  ]),
] satisfies RouteConfig;
