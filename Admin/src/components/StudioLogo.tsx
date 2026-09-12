interface StudioLogoProps {
  size?: number;
  withWordmark?: boolean;
  wordmark?: string;
  className?: string;
  markClassName?: string;
  stacked?: boolean;
}

/** Migration Studio mark — Logo.png */
export function StudioLogo({
  size = 28,
  withWordmark = false,
  wordmark = "Migration Studio",
  className,
  markClassName,
  stacked = false,
}: StudioLogoProps) {
  return (
    <span className={`studio-logo${stacked ? " is-stacked" : ""}${className ? ` ${className}` : ""}`}>
      <span
        className={`studio-logo-mark${markClassName ? ` ${markClassName}` : ""}`}
        style={{ width: size, height: size }}
      >
        <img src="/Logo.png" alt="" width={size} height={size} draggable={false} />
      </span>
      {withWordmark ? <span className="studio-logo-word">{wordmark}</span> : null}
    </span>
  );
}
