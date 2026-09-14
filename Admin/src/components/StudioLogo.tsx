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
    <span className={`inline-flex items-center gap-2 leading-none${stacked ? " flex-col" : ""}${className ? ` ${className}` : ""}`}>
      <span
        className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full${markClassName ? ` ${markClassName}` : ""}`}
        style={{ width: size, height: size }}
      >
        <img
          src="/Logo.png"
          alt=""
          width={size}
          height={size}
          draggable={false}
          className="block size-full scale-[1.7] object-cover"
        />
      </span>
      {withWordmark ? <span className="text-sm font-bold text-studio-text">{wordmark}</span> : null}
    </span>
  );
}
