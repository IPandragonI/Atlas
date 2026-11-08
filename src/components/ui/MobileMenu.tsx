"use client";

import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { Link, usePathname } from "@/i18n/navigation";
import { NAV } from "./Header";
import { Icon } from "./Icon";

/**
 * Compact navigation for the game screen on small viewports (the regular header is hidden there to give the map
 * the whole screen). Keeps home, free play, collection, stats and settings one tap away from the daily challenge.
 */
export function MobileMenu() {
  const t = useTranslations();
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative flex-none">
      <button type="button" className="btn btn-ghost !min-h-10 !min-w-10 !px-2" aria-haspopup="menu" aria-expanded={open} aria-label={t("game.menu")} onClick={() => setOpen((o) => !o)} data-testid="mobile-menu">
        <Icon name="menu" />
      </button>
      {open && (
        <nav role="menu" aria-label={t("nav.menu")} className="absolute left-0 top-12 z-30 grid min-w-48 gap-0.5 rounded-lg border border-border-soft bg-surface p-1.5 shadow-lg anim-pop">
          {[...NAV, { href: "/settings" as const, key: "settings" as const, icon: "settings" as const }].map((n) => (
            <Link key={n.href} href={n.href as "/"} role="menuitem" aria-current={pathname === n.href ? "page" : undefined} className="flex min-h-11 items-center gap-2.5 rounded-md px-3 text-sm hover:bg-accent-soft">
              <Icon name={n.icon} size={17} />
              {t(`nav.${n.key}`)}
            </Link>
          ))}
        </nav>
      )}
    </div>
  );
}
