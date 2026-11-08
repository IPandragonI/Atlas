"use client";

import { useLocale, useTranslations } from "next-intl";
import { useCallback, useMemo, useState } from "react";
import { MapView, type MapState } from "@/components/map/MapView";
import { Flag } from "@/components/ui/Flag";
import { useMedia } from "@/components/ui/useMedia";
import { useRegionName } from "@/components/ui/useNames";
import { CONTINENT_IDS } from "@/data/regions";
import { normalizeText } from "@/engine/search";
import { COUNTRIES, graph } from "@/lib/atlas";
import { useProgress } from "@/stores/progress";
import { useSettings } from "@/stores/settings";
import { AchievementList } from "./AchievementList";
import { CountryCard } from "./CountryCard";

export function CollectionScreen() {
  const t = useTranslations("collection");
  const locale = useLocale() as "fr" | "en";
  const regionName = useRegionName();
  const discovered = useProgress((s) => s.discovered);
  const labels = useSettings((s) => s.labels);
  const isDesktop = useMedia("(min-width: 1024px)");
  const [filter, setFilter] = useState<string>("all");
  const [selected, setSelected] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const inFilter = useCallback((id: string) => filter === "all" || graph.country(id).continent === filter, [filter]);
  const total = COUNTRIES.filter((c) => inFilter(c.id)).length;
  const have = COUNTRIES.filter((c) => inFilter(c.id) && discovered[c.id]).length;
  const pct = Math.round((have / total) * 100);

  const states = useMemo(() => {
    const s: Record<string, MapState> = {};
    for (const c of COUNTRIES) {
      if (filter !== "all" && c.continent !== filter) s[c.id] = "dim";
      else if (discovered[c.id]) s[c.id] = "discovered";
    }
    return s;
  }, [discovered, filter]);

  const labelIds = useMemo(() => Object.keys(discovered).filter(inFilter), [discovered, inFilter]);
  const fitIds = useMemo(() => (filter === "all" ? undefined : COUNTRIES.filter((c) => c.continent === filter).map((c) => c.id)), [filter]);
  const tooltip = useCallback((id: string) => (discovered[id] ? graph.country(id).name[locale] : "???"), [discovered, locale]);

  const list = useMemo(() => {
    const q = normalizeText(query);
    return COUNTRIES.filter((c) => inFilter(c.id) && (!q || (discovered[c.id] && (normalizeText(c.name.fr).includes(q) || normalizeText(c.name.en).includes(q)))))
      .sort((a, b) => Number(!!discovered[b.id]) - Number(!!discovered[a.id]) || a.name[locale].localeCompare(b.name[locale], locale));
  }, [query, inFilter, discovered, locale]);

  return (
    <div className="mx-auto flex w-full max-w-[1500px] flex-1 flex-col gap-6 px-4 py-4 md:px-6 md:py-6">
      <div className="grid min-h-0 gap-4 lg:h-[calc(100dvh-var(--header-h)-140px)] lg:min-h-[560px] lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="relative h-[52dvh] min-h-[320px] overflow-hidden rounded-[var(--radius)] border border-border-soft lg:h-auto">
          <MapView
            className="h-full w-full"
            states={states}
            selectedId={selected}
            labelMode={labels === "none" ? "none" : "all"}
            labelIds={labelIds}
            fitIds={fitIds}
            fitKey={filter}
            padding={isDesktop ? { top: 40, bottom: 40, left: 40, right: 40 } : { top: 20, bottom: 20, left: 20, right: 20 }}
            onCountryClick={setSelected}
            tooltip={tooltip}
          />
        </div>

        <aside className="flex min-h-0 flex-col gap-3 overflow-y-auto">
          <div>
            <h1 className="text-2xl">{t("title")}</h1>
            <p className="text-sm muted" data-testid="collection-subtitle">{t("subtitle", { n: have, total })}</p>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-border-soft" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={t("progress")}>
              <div className="h-full rounded-full bg-accent transition-all" style={{ width: `${pct}%` }} />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label={t("filterContinent")}>
            {["all", ...CONTINENT_IDS].map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={filter === id}
                onClick={() => { setFilter(id); setSelected(null); }}
                className={`rounded-full border px-3 py-1 text-sm transition-colors ${filter === id ? "border-accent bg-accent text-accent-contrast" : "border-border-soft bg-surface hover:border-border"}`}
              >
                {id === "all" ? t("filterAll") : regionName(id)}
              </button>
            ))}
          </div>
          {selected && <CountryCard id={selected} record={discovered[selected]} onClose={() => setSelected(null)} />}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            aria-label={t("searchPlaceholder")}
            className="min-h-10 rounded-md border border-border bg-surface px-3 outline-none focus:border-accent"
            style={{ fontSize: 16 }}
          />
          <ul className="grid min-h-0 gap-0.5" aria-label={t("list")}>
            {list.map((c) => {
              const known = !!discovered[c.id];
              return (
                <li key={c.id}>
                  <button
                    type="button"
                    onClick={() => setSelected(c.id)}
                    className={`flex min-h-9 w-full items-center gap-2.5 rounded px-2 text-left text-sm hover:bg-accent-soft ${selected === c.id ? "bg-accent-soft" : ""}`}
                  >
                    {known ? <Flag country={c} /> : <span className="flag bg-border-soft" aria-hidden="true" />}
                    <span className={known ? "" : "muted"}>{known ? c.name[locale] : "• • •"}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>
      </div>

      <section aria-labelledby="ach-title">
        <h2 id="ach-title" className="mb-3 text-xl">{t("achievements")}</h2>
        <AchievementList />
      </section>
    </div>
  );
}
