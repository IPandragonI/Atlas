"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback } from "react";
import { graph } from "@/lib/atlas";
import type { Locale } from "@/engine/types";

/** Localised country name lookup. */
export function useCountryName() {
  const locale = useLocale() as Locale;
  return useCallback((id: string) => (graph.has(id) ? graph.country(id).name[locale] : id), [locale]);
}

/** Localised region label for a region group id (continent / subregion group). */
export function useRegionName() {
  const t = useTranslations("regions");
  return useCallback((id: string) => (t.has(id) ? t(id) : id), [t]);
}

/** Localised UN subregion (e.g. "Western Europe") for hints and country cards. */
export function useSubregionName() {
  const t = useTranslations("subregions");
  return useCallback(
    (raw: string) => {
      const slug = raw.toLowerCase().replace(/[^a-z]+/g, "-");
      return t.has(slug) ? t(slug) : raw;
    },
    [t],
  );
}
