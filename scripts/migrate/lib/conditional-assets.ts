import type { PageBuilder } from "../../../app/api/wp/types";
import { parseElementorHtml } from "../builders/elementor/parse-html";
import { ELEMENTOR_PRO_CONDITIONAL_CSS } from "../builders/elementor/constants";

const ANIMATION_LIB_PATTERNS: Array<{
  name: string;
  htmlSignals: RegExp[];
  cssPaths: string[];
  jsPaths: string[];
}> = [
  {
    name: "aos",
    htmlSignals: [/\baos\b/i, /data-aos=/i, /aos\.css/i],
    cssPaths: ["/wp-content/plugins/aos/assets/css/aos.css"],
    jsPaths: ["/wp-content/plugins/aos/assets/js/aos.js"],
  },
  {
    name: "gsap",
    htmlSignals: [/gsap/i, /ScrollTrigger/i, /data-speed=/i],
    cssPaths: [],
    jsPaths: [
      "/wp-content/plugins/gsap-animation-addon/assets/js/gsap.min.js",
      "/wp-includes/js/jquery/jquery.min.js",
    ],
  },
  {
    name: "lenis",
    htmlSignals: [/lenis/i, /data-lenis/i],
    cssPaths: [],
    jsPaths: ["/wp-content/plugins/lenis/lenis.min.js"],
  },
  {
    name: "locomotive",
    htmlSignals: [/locomotive-scroll/i, /data-scroll/i, /c-scrollbar/i],
    cssPaths: ["/wp-content/plugins/locomotive-scroll/locomotive-scroll.css"],
    jsPaths: ["/wp-content/plugins/locomotive-scroll/locomotive-scroll.min.js"],
  },
  {
    name: "swiper",
    htmlSignals: [/swiper/i, /elementor-main-swiper/i],
    cssPaths: ["/wp-content/plugins/elementor/assets/lib/swiper/v8/css/swiper.min.css"],
    jsPaths: ["/wp-content/plugins/elementor/assets/lib/swiper/v8/swiper.min.js"],
  },
];

const DIVI_ANIMATION_SIGNALS = [
  /et_pb_animation_/i,
  /et_animated/i,
  /data-animation-style/i,
];

const WPBAKERY_ANIMATION_SIGNALS = [/wpb_animate/i, /vc_do_btn/i];

const GENERIC_ANIMATION_SIGNALS = [
  /elementor-animation-/i,
  /animate__/i,
  /wow\b/i,
  /data-wow/i,
  /fade-in/i,
  /slide-in/i,
];

function resolveOnOrigin(relativeOrAbsolute: string, origin: string): string {
  try {
    return new URL(relativeOrAbsolute, origin).href;
  } catch {
    return relativeOrAbsolute;
  }
}

export interface ConditionalAssetHints {
  extraStylesheets: string[];
  extraScripts: string[];
  animationLibs: string[];
  notes: string[];
}

/**
 * Editor-agnostic: infer CSS/JS the live page would enqueue from HTML signals,
 * not from hardcoded site lists.
 */
export function inferConditionalAssets(
  html: string,
  pageUrl: string,
  builder: PageBuilder,
): ConditionalAssetHints {
  const origin = new URL(pageUrl).origin;
  const extraStylesheets = new Set<string>();
  const extraScripts = new Set<string>();
  const animationLibs = new Set<string>();
  const notes: string[] = [];

  if (builder === "elementor" || html.includes("elementor")) {
    const parsed = parseElementorHtml(html, pageUrl);
    for (const key of parsed.conditionalKeys) {
      const paths = ELEMENTOR_PRO_CONDITIONAL_CSS[key];
      if (!paths) continue;
      for (const rel of paths) {
        extraStylesheets.add(resolveOnOrigin(rel, origin));
      }
    }
    if (
      GENERIC_ANIMATION_SIGNALS.some((r) => r.test(html)) ||
      parsed.widgets.some((w) => w.includes("animation"))
    ) {
      extraStylesheets.add(
        resolveOnOrigin(
          "/wp-content/plugins/elementor/assets/lib/animations/animations.min.css",
          origin,
        ),
      );
      notes.push("elementor-animations");
    }
  }

  if (builder === "divi" || html.includes("et_pb_")) {
    if (DIVI_ANIMATION_SIGNALS.some((r) => r.test(html))) {
      notes.push("divi-animations");
    }
  }

  if (builder === "wpbakery" || html.includes("wpb_")) {
    if (WPBAKERY_ANIMATION_SIGNALS.some((r) => r.test(html))) {
      notes.push("wpbakery-animations");
    }
  }

  for (const lib of ANIMATION_LIB_PATTERNS) {
    if (!lib.htmlSignals.some((r) => r.test(html))) continue;
    animationLibs.add(lib.name);
    for (const p of lib.cssPaths) {
      extraStylesheets.add(resolveOnOrigin(p, origin));
    }
    for (const p of lib.jsPaths) {
      extraScripts.add(resolveOnOrigin(p, origin));
    }
  }

  if (html.includes("elementskit") || html.includes("ekit-")) {
    extraStylesheets.add(
      resolveOnOrigin(
        "/wp-content/plugins/elementskit-lite/widgets/init/assets/css/widget-styles.css",
        origin,
      ),
    );
  }

  return {
    extraStylesheets: [...extraStylesheets],
    extraScripts: [...extraScripts],
    animationLibs: [...animationLibs],
    notes,
  };
}
