import { useEffect, useState } from "react";

/** true once the window (or a given element) has scrolled past `offset` px. */
export function useScrolled(offset = 8, target?: HTMLElement | null): boolean {
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const el = target ?? null;

    const read = () => {
      const y = el ? el.scrollTop : window.scrollY || document.documentElement.scrollTop;
      setScrolled(y > offset);
    };

    read();
    const opts: AddEventListenerOptions = { passive: true };
    if (el) {
      el.addEventListener("scroll", read, opts);
      return () => el.removeEventListener("scroll", read);
    }
    window.addEventListener("scroll", read, opts);
    return () => window.removeEventListener("scroll", read);
  }, [offset, target]);

  return scrolled;
}
