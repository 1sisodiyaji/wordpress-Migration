/** Load order matches Elementor + ElementsKit on radius-ois.ai */
export const ELEMENTOR_CRITICAL_CSS_PATHS = [
  "/wp-content/plugins/elementor/assets/lib/eicons/css/elementor-icons.min.css",
  "/wp-content/plugins/elementor/assets/css/frontend.min.css",
  "/wp-content/uploads/elementor/css/custom-frontend.min.css",
  "/wp-content/plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css",
  "/wp-content/uploads/elementor/css/custom-widget-icon-box.min.css",
  "/wp-content/uploads/elementor/css/custom-widget-icon-list.min.css",
  "/wp-content/uploads/elementor/css/custom-pro-widget-nav-menu.min.css",
  "/wp-content/plugins/elementor-pro/assets/css/modules/sticky.min.css",
  "/wp-content/plugins/elementor-pro/assets/css/conditionals/popup.min.css",
  "/wp-content/plugins/elementskit-lite/widgets/init/assets/css/widget-styles.css",
  "/wp-content/plugins/elementskit/widgets/init/assets/css/widget-styles-pro.css",
  "/wp-content/plugins/elementskit-lite/widgets/init/assets/css/responsive.css",
  "/wp-content/themes/astra/assets/css/minified/main.min.css",
  "/wp-content/themes/astra-child-theme/style.css",
];

export function criticalStylesheetUrls(baseUrl: string): string[] {
  const base = baseUrl.replace(/\/$/, "");
  return ELEMENTOR_CRITICAL_CSS_PATHS.map((p) => `${base}${p}`);
}
