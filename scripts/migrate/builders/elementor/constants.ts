/**
 * Asset paths derived from Elementor plugin source:
 * - core/files/css/post.php       → uploads/elementor/css/post-{id}.css
 * - core/files/base.php           → UPLOADS_DIR = elementor/css/
 * - includes/frontend.php         → enqueue elementor-frontend + Post_CSS
 * - core/page-assets/loader.php   → conditional widget CSS (swiper, shapes, animations)
 * - core/kits/manager.php         → OPTION_ACTIVE = elementor_active_kit
 */

export const ELEMENTOR_PLUGIN_CSS = [
  "/wp-content/plugins/elementor/assets/lib/eicons/css/elementor-icons.min.css",
  "/wp-content/plugins/elementor/assets/css/frontend.min.css",
  "/wp-content/plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css",
  "/wp-content/plugins/elementor/assets/css/conditionals/e-swiper.min.css",
] as const;

export const ELEMENTOR_UPLOADS_CSS = [
  "/wp-content/uploads/elementor/css/custom-frontend.min.css",
  "/wp-content/uploads/elementor/css/custom-widget-icon-box.min.css",
  "/wp-content/uploads/elementor/css/custom-widget-icon-list.min.css",
  "/wp-content/uploads/elementor/css/custom-pro-widget-nav-menu.min.css",
  "/wp-content/uploads/elementor/css/custom-apple-webkit.min.css",
  "/wp-content/uploads/elementor/css/base-desktop.css",
] as const;

export const ELEMENTOR_PRO_CONDITIONAL_CSS: Record<string, string[]> = {
  sticky: [
    "/wp-content/plugins/elementor-pro/assets/css/modules/sticky.min.css",
  ],
  popup: [
    "/wp-content/plugins/elementor-pro/assets/css/conditionals/popup.min.css",
  ],
  "motion-fx": [
    "/wp-content/plugins/elementor-pro/assets/css/modules/motion-fx.min.css",
  ],
  "off-canvas": [
    "/wp-content/plugins/elementor-pro/assets/css/widget-off-canvas.min.css",
  ],
  "nav-menu": [
    "/wp-content/uploads/elementor/css/custom-pro-widget-nav-menu.min.css",
  ],
  slides: [
    "/wp-content/plugins/elementor-pro/assets/css/widget-slides.min.css",
  ],
  loop: [
    "/wp-content/plugins/elementor-pro/assets/css/widget-loop-common.min.css",
  ],
};

export const ELEMENTOR_PLUGIN_JS = [
  "/wp-includes/js/jquery/jquery.min.js",
  "/wp-includes/js/jquery/jquery-migrate.min.js",
  "/wp-content/plugins/elementor/assets/lib/swiper/v8/swiper.min.js",
  "/wp-content/plugins/elementor/assets/js/webpack.runtime.min.js",
  "/wp-content/plugins/elementor/assets/js/frontend-modules.min.js",
  "/wp-content/plugins/elementor/assets/js/frontend.min.js",
  "/wp-content/plugins/elementor-pro/assets/js/webpack-pro.runtime.min.js",
  "/wp-content/plugins/elementor-pro/assets/js/frontend.min.js",
  "/wp-content/plugins/elementor-pro/assets/js/elements-handlers.min.js",
  "/wp-content/plugins/elementor-pro/assets/lib/sticky/jquery.sticky.min.js",
] as const;

/** Map HTML widget class suffix → conditional asset keys */
export const WIDGET_TO_CONDITIONAL: Record<string, string[]> = {
  "global": ["sticky"],
  "nested-carousel": ["e-swiper", "swiper"],
  carousel: ["e-swiper", "swiper"],
  slides: ["slides", "swiper"],
  "media-carousel": ["swiper"],
  "image-carousel": ["swiper"],
  "testimonial-carousel": ["swiper"],
  "nav-menu": ["nav-menu"],
  "off-canvas": ["off-canvas"],
  form: ["popup"],
  popup: ["popup"],
  loop: ["loop"],
  "loop-grid": ["loop"],
  "loop-carousel": ["loop", "swiper"],
};

export function postCssPath(postId: number): string {
  return `/wp-content/uploads/elementor/css/post-${postId}.css`;
}

export function absUrl(base: string, path: string): string {
  const b = base.replace(/\/$/, "");
  return path.startsWith("http") ? path : `${b}${path.startsWith("/") ? path : `/${path}`}`;
}
