import type { Metadata, Viewport } from "next";
import { hasLocale, NextIntlClientProvider } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";
import { Header } from "@/components/ui/Header";
import { PwaRegister } from "@/components/ui/PwaRegister";
import { ThemeSync } from "@/components/ui/ThemeSync";
import { routing } from "@/i18n/routing";
import "../globals.css";

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "app" });
  return {
    title: { default: `Atlas — ${t("tagline")}`, template: "%s · Atlas" },
    description: t("tagline"),
    manifest: "/manifest.webmanifest",
    icons: { icon: [{ url: "/icons/icon.svg", type: "image/svg+xml" }], apple: "/icons/apple-touch-icon.png" },
    appleWebApp: { capable: true, title: "Atlas", statusBarStyle: "default" },
    alternates: { languages: { fr: "/fr/", en: "/en/" } },
  };
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f3eb" },
    { media: "(prefers-color-scheme: dark)", color: "#171a19" },
  ],
};

/** Runs before first paint: avoids a theme flash. */
const THEME_BOOT = `try{var s=JSON.parse(localStorage.getItem('atlas-settings')||'{}');var p=s.theme||'system';var d=p==='dark'||(p==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.dataset.theme=d?'dark':'light'}catch(e){}`;

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: "nav" });

  return (
    <html lang={locale} suppressHydrationWarning style={{ ["--header-h" as string]: "52px" }}>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body className="flex min-h-dvh flex-col">
        <NextIntlClientProvider>
          <a href="#main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-surface focus:px-3 focus:py-2">
            {t("skip")}
          </a>
          <ThemeSync />
          <Header />
          <main id="main" className="flex min-h-0 flex-1 flex-col">
            {children}
          </main>
          <PwaRegister />
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
