"use client";

import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";
import { MapView, type MapState } from "@/components/map/MapView";
import { useRegionName } from "@/components/ui/useNames";
import { CONTINENT_IDS, SUBREGION_IDS } from "@/data/regions";
import type { Difficulty, GameMode } from "@/engine/types";
import { useRouter } from "@/i18n/navigation";
import { graph } from "@/lib/atlas";

const MODES: GameMode[] = ["classic", "constraints", "regional"];
const DIFFS: Difficulty[] = ["easy", "normal", "hard"];

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3" aria-label={title}>
      <h2 className="flex items-center gap-2.5 text-lg">
        <span className="grid h-6 w-6 place-items-center rounded-full bg-accent text-xs font-bold text-accent-contrast">{n}</span>
        {title}
      </h2>
      {children}
    </section>
  );
}

export function PlaySetup() {
  const t = useTranslations();
  const router = useRouter();
  const params = useSearchParams();
  const regionName = useRegionName();
  const initial = params.get("mode");
  const [mode, setMode] = useState<GameMode>(MODES.includes(initial as GameMode) ? (initial as GameMode) : "classic");
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [region, setRegion] = useState<string>("europe");

  const regionStates = useMemo(() => {
    if (mode !== "regional") return {};
    return Object.fromEntries([...graph.regionMembers(region)].map((id) => [id, "region" as MapState]));
  }, [mode, region]);

  const go = () => {
    const q = new URLSearchParams({ mode, difficulty, seed: String(Date.now()) });
    if (mode === "regional") q.set("region", region);
    router.push(`/game?${q.toString()}` as "/game");
  };

  const chip = (id: string) => (
    <button
      key={id}
      type="button"
      onClick={() => setRegion(id)}
      aria-pressed={region === id}
      className={`rounded-full border px-3 py-1.5 text-sm transition-colors ${region === id ? "border-accent bg-accent text-accent-contrast" : "border-border-soft bg-surface hover:border-border"}`}
    >
      {regionName(id)}
    </button>
  );

  return (
    <div className="mx-auto grid w-full max-w-5xl gap-8 px-4 py-6 md:px-6 md:py-10">
      <h1 className="text-2xl md:text-3xl">{t("play.title")}</h1>

      <Step n={1} title={t("play.step1")}>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("play.step1")}>
          {MODES.map((m) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={mode === m}
              onClick={() => setMode(m)}
              data-testid={`mode-${m}`}
              className={`card p-4 text-left transition-colors ${mode === m ? "!border-accent bg-accent-soft" : "hover:border-border"}`}
            >
              <span className="block font-serif text-lg font-semibold">{t(`modes.${m}.name`)}</span>
              <span className="mt-1 block text-sm muted">{t(`modes.${m}.desc`)}</span>
            </button>
          ))}
        </div>
      </Step>

      <Step n={2} title={t("play.step2")}>
        <div className="grid gap-2 sm:grid-cols-3" role="radiogroup" aria-label={t("play.step2")}>
          {DIFFS.map((d) => (
            <button
              key={d}
              type="button"
              role="radio"
              aria-checked={difficulty === d}
              onClick={() => setDifficulty(d)}
              data-testid={`diff-${d}`}
              className={`card p-4 text-left transition-colors ${difficulty === d ? "!border-accent bg-accent-soft" : "hover:border-border"}`}
            >
              <span className="block font-medium">{t(`difficulty.${d}.name`)}</span>
              <span className="mt-0.5 block text-sm muted">{t(`difficulty.${d}.desc`)}</span>
            </button>
          ))}
        </div>
      </Step>

      {mode === "regional" && (
        <Step n={3} title={t("play.step3")}>
          <p className="-mt-1 text-sm muted">{t("play.regionHint")}</p>
          <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
            <div className="grid content-start gap-3">
              <div><h3 className="eyebrow mb-1.5">{t("play.continents")}</h3><div className="flex flex-wrap gap-1.5">{CONTINENT_IDS.map(chip)}</div></div>
              <div><h3 className="eyebrow mb-1.5">{t("play.subregions")}</h3><div className="flex flex-wrap gap-1.5">{SUBREGION_IDS.map(chip)}</div></div>
            </div>
            <div className="card relative h-60 overflow-hidden md:h-72">
              <MapView className="h-full w-full" states={regionStates} labelMode="none" fitIds={[...graph.regionMembers(region)]} fitKey={region} padding={{ top: 20, bottom: 20, left: 20, right: 20 }} />
            </div>
          </div>
        </Step>
      )}

      <div>
        <button type="button" className="btn btn-primary !min-h-12 w-full text-base sm:w-auto sm:px-10" onClick={go} data-testid="start-game">{t("common.start")}</button>
      </div>
    </div>
  );
}
