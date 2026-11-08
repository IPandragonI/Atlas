"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link, usePathname } from "@/i18n/navigation";
import { useSettings, type ThemePref } from "@/stores/settings";
import { Icon, type IconName } from "./Icon";
import { LocaleSwitch } from "./LocaleSwitch";

const NAV: { href: "/" | "/play" | "/collection" | "/stats"; key: "home" | "play" | "collection" | "stats"; icon: IconName }[] = [
  { href: "/", key: "home", icon: "home" },
  { href: "/play", key: "play", icon: "play" },
  { href: "/collection", key: "collection", icon: "globe" },
  { href: "/stats", key: "stats", icon: "chart" },
];
const THEMES: ThemePref[] = ["light", "dark", "system"];
const THEME_ICON: Record<ThemePref, IconName> = { light: "sun", dark: "moon", system: "monitor" };

export function Header() {
  const t = useTranslations();
  const locale = useLocale();
  const pathname = usePathname();
  const theme = useSettings((s) => s.theme);
  const update = useSettings((s) => s.update);
  const inGame = pathname.startsWith("/game");
  const nextTheme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];

  return (
    <header
      className={`sticky top-0 z-30 items-center gap-2 border-b border-border-soft bg-bg/95 px-3 backdrop-blur md:px-5 ${inGame ? "hidden md:flex" : "flex"}`}
      style={{ height: "var(--header-h)", paddingTop: inGame ? 0 : "var(--safe-top)" }}
    >
      <Link href="/" className="mr-2 flex items-center gap-2 font-serif text-lg font-semibold tracking-tight" aria-label="Atlas">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" strokeWidth="1.6" aria-hidden="true">
          <circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3c2.6 2.6 3.6 5.6 3.6 9S14.600 18.400 12 21c-2.600-2.600-3.600-5.600-3.600-9S9.400 5.600 12 3z" />
        </svg>
        <span className="hidden sm:inline">{t("app.name")}</span>
      </Link>
      <nav aria-label={t("nav.menu")} className="flex flex-1 items-center gap-0.5">
        {NAV.map((n) => {
          const active = n.href === "/" ? pathname === "/" : pathname.startsWith(n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active ? "page" : undefined}
              className={`flex min-h-10 items-center gap-1.5 rounded-md px-2.5 text-sm font-medium transition-colors md:px-3 ${active ? "bg-accent-soft text-text" : "text-text-2 hover:text-text"}`}
            >
              <Icon name={n.icon} size={17} />
              <span className="hidden sm:inline">{t(`nav.${n.key}`)}</span>
            </Link>
          );
        })}
      </nav>
      <LocaleSwitch
        target={locale === "fr" ? "en" : "fr"}
        className="btn btn-ghost !min-h-9 !px-2.5 text-xs font-semibold uppercase"
        label={`${t("common.language")}: ${locale === "fr" ? "English" : "Français"}`}
      >
        {locale === "fr" ? "EN" : "FR"}
      </LocaleSwitch>
      <button
        type="button"
        className="btn btn-ghost !min-h-9 !px-2.5"
        onClick={() => update({ theme: nextTheme })}
        aria-label={`${t("common.theme")}: ${t(`themes.${theme}`)} → ${t(`themes.${nextTheme}`)}`}
        title={t(`themes.${theme}`)}
      >
        <Icon name={THEME_ICON[theme]} />
      </button>
      <Link href="/settings" className="btn btn-ghost !min-h-9 !px-2.5" aria-label={t("nav.settings")} title={t("nav.settings")}>
        <Icon name="settings" />
      </Link>
    </header>
  );
}
