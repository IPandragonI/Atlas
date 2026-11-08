"use client";

import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { Flag } from "@/components/ui/Flag";
import { Icon } from "@/components/ui/Icon";
import { useCountryName } from "@/components/ui/useNames";
import type { Solution } from "@/engine/pathfinding";
import type { Challenge, GameResult } from "@/engine/types";
import { graph } from "@/lib/atlas";
import { buildShareText } from "@/lib/share";
import { Link } from "@/i18n/navigation";
import type { GameMode, HintRecord } from "@/engine/types";
import type { NextSuggestion } from "@/lib/replay";
import { HintText } from "./HintPanel";

export interface RouteChoice {
  id: string;
  kind: "yours" | "shortest" | "optimal" | "alternative";
  route: string[];
  label: string;
}

interface Props {
  challenge: Challenge;
  result: GameResult;
  solution: Solution | null;
  hints: readonly HintRecord[];
  fresh: readonly string[];
  achievements: readonly string[];
  selected: number;
  onSelect: (choice: RouteChoice, index: number) => void;
  /** True when the finished game is a Daily Challenge. */
  daily: boolean;
  /** After a daily: another daily to play, or a new Classic game once all three are done. */
  suggestion: NextSuggestion | null;
  /** Same configuration (mode, difficulty, scope, custom settings), brand-new challenge. */
  onReplay: () => void;
  onNextDaily: (mode: GameMode) => void;
  onNewClassic: () => void;
  choices: RouteChoice[];
}

/** The destination is never part of the engine route; it is appended here for display only (a win ends there). */
export function useRouteChoices(result: GameResult | null, solution: Solution | null, destination: string | null): RouteChoice[] {
  const t = useTranslations("results");
  return useMemo(() => {
    if (!result) return [];
    const yours = result.status === "won" && destination ? [...result.route, destination] : result.route;
    const list: RouteChoice[] = [{ id: "yours", kind: "yours", route: yours, label: t("yourRoute") }];
    if (solution?.feasible) {
      let alt = 0;
      solution.routes.forEach((r, i) => {
        if (i === 0) list.push({ id: "r0", kind: "shortest", route: r, label: t("shortest") });
        else if (i < solution.optimalCount) list.push({ id: `r${i}`, kind: "optimal", route: r, label: `${t("shortest")} ${i + 1}` });
        else list.push({ id: `r${i}`, kind: "alternative", route: r, label: t("alternative", { n: ++alt }) });
      });
    }
    return list;
  }, [result, solution, destination, t]);
}

export function ResultsPanel({ challenge, result, solution, hints, fresh, achievements, selected, onSelect, daily, suggestion, onReplay, onNextDaily, onNewClassic, choices }: Props) {
  const t = useTranslations();
  const locale = useLocale() as "fr" | "en";
  const name = useCountryName();
  const [copied, setCopied] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const VISIBLE_ROUTES = 6;
  const won = result.status === "won";
  const s = result.score;

  const share = async () => {
    const text = buildShareText({
      challenge, result,
      title: t("results.shareTitle", { date: challenge.date ?? new Date().toISOString().slice(0, 10) }),
      modeLabel: t(`modes.${challenge.mode}.name`),
      difficultyLabel: t(`difficulty.${challenge.difficulty}.name`),
    });
    try {
      if (navigator.share && /Mobi|Android/i.test(navigator.userAgent)) await navigator.share({ text });
      else {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      }
    } catch {
      /* cancelled */
    }
  };

  const rows: [string, number][] = [
    [t("results.victory"), s.victory],
    [t("results.optimal"), s.optimal],
    [t("results.noMistakes"), s.noMistakes],
    [t("results.noHints"), s.noHints],
  ];

  const mins = Math.floor(result.durationMs / 60000);
  const secs = Math.floor((result.durationMs % 60000) / 1000);

  return (
    <div className="grid gap-4 anim-slide" data-testid="results" data-status={result.status}>
      <div className={`rounded-md border px-4 py-3 ${won ? "border-success/50 bg-accent-soft" : "border-error/40 bg-error-soft"}`}>
        <h2 className="text-xl">{won ? t("results.won") : t("results.lost")}</h2>
        <p className="text-sm text-text-2">
          {t(won ? "results.wonSub" : "results.lostSub", { from: name(challenge.start), to: name(challenge.destination) })}
        </p>
        <div className="mt-2 flex items-end gap-2">
          <span className="font-serif text-4xl font-semibold" data-testid="score">{s.total}</span>
          <span className="pb-1 text-sm muted">{t("results.outOf")}</span>
          {result.optimal && <span className="chip ml-auto"><Icon name="star" size={13} /> {t("results.optimalBadge")}</span>}
        </div>
      </div>

      <section>
        <h3 className="eyebrow mb-1">{t("results.breakdown")}</h3>
        <ul className="divide-y divide-border-soft text-sm">
          {rows.map(([label, v]) => (
            <li key={label} className="flex justify-between py-1.5"><span className={v ? "" : "muted"}>{label}</span><span className={v ? "font-medium" : "muted"}>{v ? `+${v}` : "—"}</span></li>
          ))}
          {s.mistakePenalty > 0 && <li className="flex justify-between py-1.5 text-error"><span>{t("results.mistakes", { n: result.mistakes })}</span><span>−{s.mistakePenalty}</span></li>}
          {s.hintPenalty > 0 && <li className="flex justify-between py-1.5 text-error"><span>{t("results.hints")}</span><span>−{s.hintPenalty}</span></li>}
        </ul>
        <p className="mt-1 text-xs muted">
          {t("results.intermediates", { n: result.intermediates })} · {t("results.time")} {mins}:{String(secs).padStart(2, "0")}
        </p>
      </section>

      {hints.length > 0 && (
        <section>
          <h3 className="eyebrow mb-1">{t("results.hints")}</h3>
          <ul className="grid gap-1 text-sm muted">{hints.map((h, i) => <li key={i}><HintText payload={h.payload} /></li>)}</ul>
        </section>
      )}

      {fresh.length > 0 && (
        <section className="rounded-md border border-border-soft px-3 py-2">
          <p className="text-sm font-medium">{t("results.newCountries", { n: fresh.length })}</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {fresh.map((id) => (
              <span key={id} className="chip anim-glow"><Flag country={graph.country(id)} />{graph.country(id).name[locale]}</span>
            ))}
          </div>
        </section>
      )}
      {achievements.length > 0 && (
        <section className="rounded-md border border-dest/50 bg-dest-soft px-3 py-2 anim-pop">
          {achievements.map((a) => (
            <p key={a} className="flex items-center gap-2 text-sm font-medium"><Icon name="trophy" size={16} />{t("collection.unlocked")} · {t(`achievements.${a}.name`)}</p>
          ))}
        </section>
      )}

      <section className="grid gap-2" aria-label={t("results.next")} data-testid="next-actions">
        <h3 className="eyebrow">{t("results.next")}</h3>
        {daily && suggestion?.kind === "daily" && (
          <button type="button" className="btn btn-primary !h-auto !flex-col !items-start gap-0.5 !py-2.5 text-left" onClick={() => onNextDaily(suggestion.mode)} data-testid="next-daily">
            <span className="font-semibold">{t("results.nextDaily", { mode: t(`modes.${suggestion.mode}.name`) })}</span>
            <span className="text-xs font-normal opacity-90">{t("results.nextDailyDesc")}</span>
          </button>
        )}
        {daily && suggestion?.kind === "classic" && (
          <button type="button" className="btn btn-primary !h-auto !flex-col !items-start gap-0.5 !py-2.5 text-left" onClick={onNewClassic} data-testid="new-classic">
            <span className="font-semibold">{t("results.newClassic")}</span>
            <span className="text-xs font-normal opacity-90">{t("results.newClassicDesc")}</span>
          </button>
        )}
        <button type="button" className={`btn !h-auto !flex-col !items-start gap-0.5 !py-2.5 text-left ${daily ? "" : "btn-primary"}`} onClick={onReplay} data-testid="replay-same">
          <span className="font-semibold">{t("results.replaySame")}</span>
          <span className="text-xs font-normal opacity-80">{daily ? t("results.replaySameDailyDesc") : t("results.replaySameDesc")}</span>
        </button>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" className="btn" onClick={share}><Icon name="share" size={16} />{copied ? t("results.copied") : t("results.share")}</button>
          <Link href="/" className="btn btn-ghost">{t("results.home")}</Link>
        </div>
      </section>

      <section>
        <h3 className="eyebrow mb-2">{t("results.routes")}</h3>
        <ul className="grid gap-1.5" role="listbox" aria-label={t("results.routes")}>
          {choices.slice(0, showAll ? undefined : VISIBLE_ROUTES).map((c, i) => (
            <li key={c.id}>
              <button
                type="button"
                role="option"
                aria-selected={i === selected}
                onClick={() => onSelect(c, i)}
                className={`w-full rounded-md border px-3 py-2 text-left transition-colors ${i === selected ? "border-accent bg-accent-soft" : "border-border-soft hover:border-border"}`}
                data-testid={`route-choice-${c.kind}`}
              >
                <span className="flex items-center justify-between gap-2 text-sm font-medium">
                  {c.label}
                  <span className="flex items-center gap-1.5">
                    {(c.kind === "shortest" || c.kind === "optimal" || (c.kind === "yours" && result.optimal)) && <span className="chip !py-0">{t("results.optimalBadge")}</span>}
                    <span className="text-xs font-normal muted">{Math.max(0, c.route.length - (c.kind === "yours" && result.status === "lost" ? 1 : 2))}</span>
                  </span>
                </span>
                <span className="mt-0.5 block text-xs muted">{c.route.map((id) => graph.country(id).name[locale]).join(" → ")}</span>
              </button>
            </li>
          ))}
        </ul>
        {choices.length > VISIBLE_ROUTES && (
          <button type="button" className="btn btn-ghost mt-2 w-full text-sm" onClick={() => setShowAll((v) => !v)} data-testid="toggle-routes">
            {showAll ? t("results.showFewerRoutes") : t("results.showMoreRoutes", { n: choices.length - VISIBLE_ROUTES })}
          </button>
        )}
        {solution?.truncated && <p className="mt-1 text-xs muted">{t("results.moreRoutes")}</p>}
      </section>

    </div>
  );
}
