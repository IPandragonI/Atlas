import type { SVGProps } from "react";

const PATHS = {
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  target: "M12 3v3M12 18v3M3 12h3M18 12h3M12 8a4 4 0 100 8 4 4 0 000-8z",
  expand: "M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5",
  shrink: "M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5",
  chevronUp: "M6 15l6-6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  check: "M5 12.5l4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6L6 18",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z",
  flag: "M5 21V4m0 0h11l-2 4 2 4H5",
  sun: "M12 8a4 4 0 100 8 4 4 0 000-8zM12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5",
  moon: "M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z",
  monitor: "M3 5h18v11H3zM8 20h8M12 16v4",
  globe: "M12 3a9 9 0 100 18 9 9 0 000-18zM3 12h18M12 3c2.5 2.5 3.5 5.5 3.5 9s-1 6.5-3.5 9c-2.5-2.5-3.5-5.5-3.5-9s1-6.5 3.5-9z",
  trophy: "M8 4h8v6a4 4 0 01-8 0V4zM8 6H5a3 3 0 003 4M16 6h3a3 3 0 01-3 4M12 14v4M9 20h6",
  chart: "M5 20V10M12 20V4M19 20v-7",
  settings: "M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0M16 4v4M10 10v4M18 16v4",
  home: "M4 11l8-7 8 7v9H4z",
  play: "M8 5l11 7-11 7z",
  ship: "M3 17l2 3h14l2-3M5 17l1-6h12l1 6M12 4v7M9 7h6",
  lock: "M7 11V8a5 5 0 0110 0v3M5 11h14v10H5z",
  share: "M12 3v12M8 7l4-4 4 4M5 13v7h14v-7",
  download: "M12 3v12M8 11l4 4 4-4M5 19h14",
  upload: "M12 15V3M8 7l4-4 4 4M5 19h14",
  trash: "M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3",
  wifiOff: "M3 3l18 18M8.5 8.5A12 12 0 003 12m18 0a12 12 0 00-5-3M7 15a8 8 0 0110 0M11 19h2",
  star: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...rest }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={PATHS[name]} />
    </svg>
  );
}
