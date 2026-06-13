import { WpHtmlShell } from "./components/WpHtmlShell";

/**
 * Puck config for WP-migrated sites.
 * Wire with @puckeditor/core when Puck routes are enabled.
 * Phase 1: WpHtmlShell replays crawled HTML with asset pipeline.
 * Phase 2+: add native components (Heading, Image, Section, …) and map Elementor widgets.
 */
export const puckConfig = {
  root: {
    fields: {
      title: { type: "text", label: "Page title" },
    },
    defaultProps: {
      title: "",
    },
  },
  components: {
    WpHtmlShell: {
      label: "WordPress HTML (migrated)",
      fields: {
        siteSlug: { type: "text", label: "Site slug" },
        pageKey: { type: "text", label: "Page key" },
        routePath: { type: "text", label: "Route path" },
      },
      defaultProps: {
        siteSlug: "",
        pageKey: "home",
        routePath: "/",
      },
      render: WpHtmlShell,
    },
  },
};
