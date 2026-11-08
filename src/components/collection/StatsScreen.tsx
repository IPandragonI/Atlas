"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";
import { CONTINENT_IDS } from "@/data/regions";
import { useRegionName } from "@/components/ui/useNames";
import { COUNTRIES, graph } from "@/lib/atlas";
import { utcDate } from "@/lib/daily-schedule";
import { computeStats } from "@/lib/progress";
import { useProgress } from "@/stores/progress";

export function StatsScreen() {
  const t = useTranslations("stats");
  const locale = useLocale() as "fr" | "en";
  const regionName = useRegionName();
  const { discovered, games, daily } = useProgress();

  const stats = useMemo(() => {
    const visits = Object.values(discovered).reduce((s, d) => s + d.visits, 0);
    return computeStats(games, new Set(Object.keys(discovered)), visits, COUNTRIES, daily, utcDate());
  }, [discovered, games, daily]);

  const fmtTime = (ms: number) => {
    const s = Math.round(ms / 1000);
    return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
  };
  const tiles: [string, string | number][] = [
    [t("played"), stats.played], [t("wins"), stats.wins], [t("losses"), stats.losses], [t("optimal"), stats.optimal],
    [t("discovered"), stats.discovered], [t("traversed"), stats.traversed], [t("continents"), `${stats.continents}/6`], [t("islands"), stats.islands],
    [t("avgScore"), Math.round(stats.avgScore)], [t("avgTime"), fmtTime(stats.avgTimeMs)], [t("hintsUsed"), stats.hintsUsed], [t("errors"), stats.errors],
    [t("streak"), stats.streak], [t("bestStreak"), stats.bestStreak],
  ];
  const history = [...games].reverse().slice(0, 30);

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-6 md:px-6 md:py-10">
      <h1 className="text-2xl md:text-3xl">{t("title")}</h1>
      <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="stats-tiles">
        {tiles.map(([k, v]) => (
          <div key={k} className="card p-3">
            <dd className="font-serif text-2xl font-semibold tabular-nums">{v}</dd>
            <dt className="text-xs muted">{k}</dt>
          </div>
        ))}
      </dl>

      <section>
        <h2 className="mb-3 text-xl">{t("perContinent")}</h2>
        <ul className="grid gap-2.5">
          {CONTINENT_IDS.map((id) => {
            const all = COUNTRIES.filter((c) => c.continent === id);
            const n = all.filter((c) => discovered[c.id]).length;
            return (
              <li key={id} className="grid grid-cols-[130px_1fr_auto] items-center gap-3 text-sm">
                <span>{regionName(id)}</span>
                <div className="h-2 overflow-hidden rounded-full bg-border-soft"><div className="h-full rounded-full bg-accent" style={{ width: `${(n / all.length) * 100}%` }} /></div>
                <span className="tabular-nums muted">{n}/{all.length}</span>
              </li>
            );
          })}
        </ul>
      </section>

      <section>
        <h2 className="mb-3 text-xl">{t("history")}</h2>
        {history.length === 0 ? (
          <p className="muted">{t("emptyHistory")}</p>
        ) : (
          <ul className="divide-y divide-border-soft rounded-[var(--radius)] border border-border-soft bg-surface" data-testid="history">
            {history.map((g, i) => (
              <li key={`${g.finishedAt}-${i}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className={`h-2 w-2 flex-none rounded-full ${g.status === "won" ? "bg-success" : "bg-error"}`} aria-label={g.status === "won" ? t("won") : t("lost")} />
                <span className="min-w-0 flex-1 truncate">
                  {graph.country(g.route[0]).name[locale]} → {graph.country(g.destination ?? g.route[g.route.length - 1]).name[locale]}
                </span>
                <span className="muted">{new Intl.DateTimeFormat(locale, { dateStyle: "short" }).format(g.finishedAt)}</span>
                <span className="w-12 text-right font-medium tabular-nums">{g.score}</span>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
