import { useId } from "react";

interface StudioLogoProps {
  size?: number;
  withWordmark?: boolean;
  wordmark?: string;
  className?: string;
  markClassName?: string;
  stacked?: boolean;
}

/** Migration Studio mark — source node → canvas (migrate path). */
export function StudioLogo({
  size = 28,
  withWordmark = false,
  wordmark = "Migration Studio",
  className,
  markClassName,
  stacked = false,
}: StudioLogoProps) {
  const gradId = useId().replace(/:/g, "");

  return (
    <span className={`studio-logo${stacked ? " is-stacked" : ""}${className ? ` ${className}` : ""}`}>
      <svg
        className={`studio-logo-mark${markClassName ? ` ${markClassName}` : ""}`}
        width={size}
        height={size}
        viewBox="0 0 32 32"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <linearGradient id={gradId} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
            <stop stopColor="var(--logo-from, #22d3ee)" />
            <stop offset="1" stopColor="var(--logo-to, #0891b2)" />
          </linearGradient>
        </defs>
        <rect width="32" height="32" rx="9" fill={`url(#${gradId})`} />
        <circle cx="9.5" cy="16" r="2.25" fill="#fff" fillOpacity="0.95" />
        <path
          d="M12.5 16h7.25M17.25 12.75 20.75 16l-3.5 3.25"
          stroke="#fff"
          strokeWidth="1.85"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <rect
          x="21.25"
          y="11.25"
          width="5.5"
          height="9.5"
          rx="1.4"
          stroke="#fff"
          strokeWidth="1.7"
          fill="none"
        />
        <path d="M22.6 14.1h2.8M22.6 16h2.8M22.6 17.9h1.7" stroke="#fff" strokeWidth="1.2" strokeLinecap="round" />
      </svg>
      {withWordmark ? <span className="studio-logo-word">{wordmark}</span> : null}
    </span>
  );
}
