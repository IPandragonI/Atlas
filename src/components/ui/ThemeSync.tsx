"use client";

import { useEffect } from "react";
import { useLocale } from "next-intl";
import { useProgress } from "@/stores/progress";
import { resolveTheme, useSettings } from "@/stores/settings";

/** Applies the theme, remembers the language and loads local progression once. */
export function ThemeSync() {
  const locale = useLocale();
  const theme = useSettings((s) => s.theme);
  const init = useSettings((s) => s.init);
  const hydrate = useProgress((s) => s.hydrate);

  useEffect(() => {
    init();
    void hydrate();
  }, [init, hydrate]);

  useEffect(() => {
    try {
      localStorage.setItem("atlas-locale", locale);
    } catch {
      /* ignore */
    }
  }, [locale]);

  useEffect(() => {
    const apply = () => {
      document.documentElement.dataset.theme = resolveTheme(theme);
      const meta = document.querySelector('meta[name="theme-color"]');
      if (meta) meta.setAttribute("content", resolveTheme(theme) === "dark" ? "#171a19" : "#f5f3eb");
    };
    apply();
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [theme]);

  return null;
}
