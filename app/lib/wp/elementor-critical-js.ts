/**
 * Elementor + ElementsKit JS in dependency order (matches WP enqueue).
 * Loaded before elementor-frontend.min.js runs.
 */
export const ELEMENTOR_SCRIPT_PATHS = [
  "/wp-includes/js/jquery/jquery.min.js",
  "/wp-includes/js/jquery/jquery-migrate.min.js",
  "/wp-content/plugins/elementor/assets/lib/swiper/v8/swiper.min.js",
  "/wp-content/plugins/elementor/assets/js/webpack.runtime.min.js",
  "/wp-content/plugins/elementor/assets/js/frontend-modules.min.js",
  "/wp-content/plugins/elementor/assets/js/frontend.min.js",
  "/wp-content/plugins/elementor-pro/assets/js/webpack-pro.runtime.min.js",
  "/wp-content/plugins/elementor-pro/assets/js/frontend.min.js",
  "/wp-content/plugins/elementor-pro/assets/lib/sticky/jquery.sticky.min.js",
  "/wp-content/plugins/elementskit-lite/widgets/init/assets/js/widget-scripts.js",
  "/wp-content/plugins/elementskit/widgets/init/assets/js/widget-scripts-pro.js",
  "/wp-content/plugins/elementskit-lite/widgets/init/assets/js/elementor.js",
];

export function criticalScriptUrls(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/$/, "");
  return ELEMENTOR_SCRIPT_PATHS.map((p) => `${base}${p}`);
}
