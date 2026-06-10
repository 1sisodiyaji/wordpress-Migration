import { useEffect } from "react";
import { normalizeImageSrc } from "@/lib/wp/link-utils";

/**
 * Client fixes after hydration: broken image URLs, Elementor backgrounds, mega menu.
 */
export function ElementorClientFixes() {
  useEffect(() => {
    const root = document.querySelector(".wp-migrated-root");
    if (!root) return;

    // Fix https:https:// image URLs
    root.querySelectorAll<HTMLImageElement>("img").forEach((img) => {
      const fixed = normalizeImageSrc(img.getAttribute("src") ?? undefined);
      if (fixed && fixed !== img.src) img.src = fixed;
      if (img.srcset) {
        img.srcset = img.srcset.replace(/https:https:\/\//gi, "https://");
      }
    });

    root.querySelectorAll<HTMLAnchorElement>("a[href]").forEach((a) => {
      const href = a.getAttribute("href");
      if (href?.includes("https:https://")) {
        a.href = href.replace(/https:https:\/\//gi, "https://");
      }
    });

    // Apply data-wp-bg / data-bg backgrounds
    root
      .querySelectorAll<HTMLElement>("[data-wp-bg], [data-bg]")
      .forEach((el) => {
        const url = normalizeImageSrc(
          el.getAttribute("data-wp-bg") || el.getAttribute("data-bg") || undefined,
        );
        if (url) {
          el.style.backgroundImage = `url("${url}")`;
        }
      });

    // Elementor classic background from data-settings
    root
      .querySelectorAll<HTMLElement>(".elementor-element[data-settings]")
      .forEach((el) => {
        try {
          const raw = el.getAttribute("data-settings")?.replace(/&quot;/g, '"');
          if (!raw) return;
          const s = JSON.parse(raw) as {
            background_background?: string;
            background_image?: { url?: string };
          };
          if (
            s.background_background === "classic" &&
            s.background_image?.url &&
            !el.style.backgroundImage
          ) {
            const url = normalizeImageSrc(s.background_image.url);
            if (url) el.style.backgroundImage = `url("${url}")`;
          }
        } catch {
          /* ignore */
        }
      });

    // ElementsKit mega menu: hover + click for touch
    const megaParents = root.querySelectorAll<HTMLElement>(
      ".elementskit-megamenu-has",
    );

    const closeAll = () => {
      megaParents.forEach((li) => li.classList.remove("ekit-active"));
    };

    megaParents.forEach((li) => {
      li.addEventListener("mouseenter", () => {
        closeAll();
        li.classList.add("ekit-active");
      });
      li.addEventListener("mouseleave", () => {
        li.classList.remove("ekit-active");
      });

      const link = li.querySelector<HTMLElement>(".ekit-menu-nav-link");
      link?.addEventListener("click", (e) => {
        if (window.innerWidth > 1024) return;
        e.preventDefault();
        const open = li.classList.contains("ekit-active");
        closeAll();
        if (!open) li.classList.add("ekit-active");
      });
    });

    // Hamburger toggle (basic)
    root
      .querySelectorAll<HTMLButtonElement>(".elementskit-menu-toggler")
      .forEach((btn) => {
        btn.addEventListener("click", () => {
          const nav = btn.closest(".ekit-wid-con");
          const panel = nav?.querySelector(".elementskit-menu-offcanvas-elements");
          panel?.classList.toggle("elementskit-menu-active");
          root
            .querySelector(".elementskit-menu-overlay")
            ?.classList.toggle("elementskit-menu-active");
        });
      });

    document.body.classList.add("ast-desktop");
    if (window.innerWidth <= 921) {
      document.body.classList.add("ast-header-break-point");
      document.body.classList.remove("ast-desktop");
    }

    return () => closeAll();
  }, []);

  return null;
}
