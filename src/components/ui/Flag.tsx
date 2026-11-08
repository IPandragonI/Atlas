import type { Country } from "@/engine/types";

/** Flag (4:3 SVG from flag-icons, bundled so it works offline). */
export function Flag({ country, className = "" }: { country: Pick<Country, "iso2">; className?: string }) {
  if (!country.iso2) return <span className={`flag ${className}`} aria-hidden="true" />;
  return <span className={`fi fi-${country.iso2.toLowerCase()} flag ${className}`} aria-hidden="true" />;
}
