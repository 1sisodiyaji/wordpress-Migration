import parse, {
  type DOMNode,
  type HTMLReactParserOptions,
  Element,
  domToReact,
} from "html-react-parser";
import { Link } from "react-router";
import { isInternalHref, normalizeImageSrc, toAppPath } from "@/lib/wp/link-utils";

/** Preserve native img for Elementor (srcset, SVG icons, layout CSS). */
function renderNativeImg(attribs: Record<string, string>) {
  const src = normalizeImageSrc(
    attribs.src || attribs["data-src"] || attribs["data-lazy-src"],
  );
  if (!src) return null;

  return (
    <img
      src={src}
      alt={attribs.alt ?? ""}
      className={attribs.class}
      width={attribs.width ? Number(attribs.width) : undefined}
      height={attribs.height ? Number(attribs.height) : undefined}
      srcSet={attribs.srcset}
      sizes={attribs.sizes}
      loading={(attribs.loading as "lazy" | "eager") || undefined}
      decoding={(attribs.decoding as "async" | "auto" | "sync") || undefined}
      fetchPriority={(attribs.fetchpriority as "high" | "low" | "auto") || undefined}
      data-wp-migrated="img"
    />
  );
}

const parserOptions: HTMLReactParserOptions = {
  replace(domNode) {
    if (!(domNode instanceof Element)) return;

    const { name, attribs, children } = domNode;

    if (name === "html" || name === "body") {
      return domToReact(children as DOMNode[], parserOptions);
    }

    if (name === "head") {
      const headStyles = children.filter(
        (child) => child instanceof Element && child.name === "style",
      ) as DOMNode[];
      return domToReact(headStyles, parserOptions);
    }

    if (name === "script") {
      return null;
    }

    if (name === "img") {
      return renderNativeImg(attribs);
    }

    if (name === "a") {
      const href = attribs.href ?? "#";
      const className = attribs.class;
      const childNodes = domToReact(children as DOMNode[], parserOptions);

      if (href.startsWith("#") || href.includes("elementor-action")) {
        return (
          <a href={href} className={className} aria-label={attribs["aria-label"]}>
            {childNodes}
          </a>
        );
      }

      if (isInternalHref(href)) {
        return (
          <Link
            to={toAppPath(href)}
            className={className}
            aria-label={attribs["aria-label"]}
            data-wp-migrated="link"
          >
            {childNodes}
          </Link>
        );
      }

      return (
        <a
          href={href}
          className={className}
          target={attribs.target ?? "_blank"}
          rel={attribs.rel ?? "noopener noreferrer"}
        >
          {childNodes}
        </a>
      );
    }
  },
};

interface WpMigratedHtmlProps {
  html: string;
  className?: string;
}

export function WpMigratedHtml({ html, className }: WpMigratedHtmlProps) {
  return (
    <div className={className} data-wp-migrated-html="true">
      {parse(html, parserOptions)}
    </div>
  );
}
