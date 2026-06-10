import type { Config } from "@react-router/dev/config";

export default {
  ssr: true,
  // Prerender only the home page at build time. Migrated routes (often 1000+)
  // are rendered on demand via SSR — set PRERENDER_ALL=1 to prerender everything.
  async prerender() {
    if (process.env.PRERENDER_ALL === "1") {
      const { getRoutePaths } = await import("./app/api/wp/load-migrated");
      return getRoutePaths();
    }
    return ["/"];
  },
} satisfies Config;
