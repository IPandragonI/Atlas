"use client";

import { useLocale } from "next-intl";
import { usePathname } from "@/i18n/navigation";

/**
 * Language switch as a plain anchor: a full navigation guarantees the <html lang>, messages and
 * cached page of the other locale are loaded, which is the most robust behaviour for a static export.
 */
export function LocaleSwitch({ target, className, children, label }: { target: "fr" | "en"; className?: string; children: React.ReactNode; label?: string }) {
  const locale = useLocale();
  const pathname = usePathname();
  const href = `/${target}${pathname === "/" ? "/" : `${pathname}/`}`;
  return (
    <a
      href={href}
      hrefLang={target}
      lang={target}
      className={className}
      aria-label={label}
      aria-current={locale === target ? "true" : undefined}
      onClick={(e) => {
        if (locale === target) return e.preventDefault();
        e.preventDefault();
        // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- intentional full navigation (see doc comment)
        window.location.assign(`${href}${window.location.search}`);
      }}
    >
      {children}
    </a>
  );
}
