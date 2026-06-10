import { WpMigratedHtml } from "./WpMigratedHtml";

interface WpContentProps {
  html: string;
  className?: string;
}

/** REST content with Next.js Image/Link conversion. */
export function WpContent({ html, className }: WpContentProps) {
  return (
    <article className={className ?? "entry-content wp-block-post-content"}>
      <WpMigratedHtml html={html} />
    </article>
  );
}
