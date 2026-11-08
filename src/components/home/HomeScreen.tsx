"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useState } from "react";
import { MapView, type MapState } from "@/components/map/MapView";
import { Flag } from "@/components/ui/Flag";
import { Icon } from "@/components/ui/Icon";
import { useRegionName } from "@/components/ui/useNames";
import type { GameMode } from "@/engine/types";
import { Link } from "@/i18n/navigation";
import { COUNTRIES, graph } from "@/lib/atlas";
import { dailyMeta } from "@/lib/daily";
import { DAILY_MODES, utcDate } from "@/lib/daily-schedule";
import { dailyStreak } from "@/lib/progress";
import { useProgress } from "@/stores/progress";

const MODES: GameMode[] = ["classic", "constraints", "regional"];

export function HomeScreen() {
  const t = useTranslations();
  const locale = useLocale() as "fr" | "en";
  const regionName = useRegionName();
  const discovered = useProgress((s) => s.discovered);
  const dailyRecs = useProgress((s) => s.daily);
  const [today, setToday] = useState<string | null>(null);
  useEffect(() => setToday(utcDate()), []);

  const ids = Object.keys(discovered);
  const pct = Math.round((ids.length / COUNTRIES.length) * 100);
  const streak = today ? dailyStreak(dailyRecs, today).current : 0;
  const recent = useMemo(() => [...Object.values(discovered)].sort((a, b) => b.firstAt - a.firstAt).slice(0, 8), [discovered]);
  const states = useMemo(() => Object.fromEntries(Object.keys(discovered).map((id) => [id, "discovered" as MapState])), [discovered]);
  const dateLabel = today ? new Intl.DateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${today}T00:00:00Z`)) : "";

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-8 px-4 py-6 md:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] md:px-6 md:py-10">
      <div className="grid content-start gap-8">
        <section aria-labelledby="daily-title">
          <div className="mb-3">
            <h1 id="daily-title" className="text-2xl md:text-3xl">{t("home.dailyTitle")}</h1>
            <p className="text-sm muted first-letter:uppercase">{t("home.dailySubtitle", { date: dateLabel })}</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-3 md:grid-cols-1 lg:grid-cols-3">
            {DAILY_MODES.map((mode) => {
              const meta = today ? dailyMeta(today, mode) : null;
              const rec = today ? dailyRecs.find((d) => d.challengeId === `daily-${today}-${mode}`) : undefined;
              return (
                <Link
                  key={mode}
                  href={today ? (`/game?daily=${today}&mode=${mode}` as "/game") : "/play"}
                  className="card group flex flex-col gap-2 p-4 transition-colors hover:border-accent"
                  data-testid={`daily-${mode}`}
                >
                  <span className="flex items-center justify-between">
                    <span className="font-serif text-lg font-semibold">{t(`modes.${mode}.name`)}</span>
                    {rec ? <Icon name={rec.status === "won" ? "check" : "x"} className={rec.status === "won" ? "text-success" : "text-error"} /> : <Icon name="play" size={16} className="text-accent" />}
                  </span>
                  <span className="text-sm muted">{t(`modes.${mode}.short`)}</span>
                  <span className="mt-auto flex flex-wrap items-center gap-1.5 pt-1">
                    {meta && <span className="chip">{t(`difficulty.${meta.difficulty}.name`)}</span>}
                    {meta?.region && <span className="chip">{regionName(meta.region)}</span>}
                  </span>
                  <span className={`text-xs font-medium ${rec ? (rec.status === "won" ? "text-success" : "text-error") : "text-accent"}`}>
                    {rec ? (rec.status === "won" ? t("home.dailyDone", { score: rec.score }) : t("home.dailyLost")) : t("home.dailyTodo")}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>

        <section aria-labelledby="free-title">
          <div className="mb-3">
            <h2 id="free-title" className="text-xl">{t("home.freeTitle")}</h2>
            <p className="text-sm muted">{t("home.freeSubtitle")}</p>
          </div>
          <div className="grid gap-2 sm:grid-cols-3">
            {MODES.map((m) => (
              <Link key={m} href={`/play?mode=${m}` as "/play"} className="card flex flex-col gap-1 p-3.5 transition-colors hover:border-accent" data-testid={`free-${m}`}>
                <span className="font-medium">{t(`modes.${m}.name`)}</span>
                <span className="text-xs muted">{t(`modes.${m}.desc`)}</span>
              </Link>
            ))}
          </div>
        </section>
      </div>

      <section aria-labelledby="progress-title" className="grid content-start gap-3">
        <h2 id="progress-title" className="text-xl">{t("home.progressTitle")}</h2>
        <div className="card overflow-hidden">
          <div className="relative h-56 md:h-72">
            <MapView className="h-full w-full" states={states} labelMode="none" fitKey="home" padding={{ top: 10, bottom: 10, left: 10, right: 10 }} />
          </div>
          <div className="grid grid-cols-3 divide-x divide-border-soft border-t border-border-soft text-center">
            <div className="p-3"><div className="font-serif text-2xl font-semibold" data-testid="discovered-count">{ids.length}<span className="text-sm font-normal muted">/{COUNTRIES.length}</span></div><div className="text-xs muted">{t("home.discovered")}</div></div>
            <div className="p-3"><div className="font-serif text-2xl font-semibold">{pct}%</div><div className="text-xs muted">{t("collection.progress")}</div></div>
            <div className="p-3"><div className="font-serif text-2xl font-semibold">{streak}</div><div className="text-xs muted">{t("home.streak")}</div></div>
          </div>
        </div>
        <div className="card p-4">
          <h3 className="eyebrow mb-2">{t("home.recent")}</h3>
          {recent.length === 0 ? (
            <p className="text-sm muted">{t("home.noneYet")}</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {recent.map((r) => (
                <li key={r.id} className="chip"><Flag country={graph.country(r.id)} />{graph.country(r.id).name[locale]}</li>
              ))}
            </ul>
          )}
          <Link href="/collection" className="btn mt-3 w-full">{t("home.openCollection")}</Link>
        </div>
      </section>
    </div>
  );
}
