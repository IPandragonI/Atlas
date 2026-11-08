"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useMemo, useRef, useState } from "react";
import { CountryCombobox } from "@/components/game/CountryCombobox";
import { Icon } from "@/components/ui/Icon";
import { useFocusTrap } from "@/components/ui/useFocusTrap";
import { useRegionName } from "@/components/ui/useNames";
import type { ChallengeDifficulty, GameMode } from "@/engine/types";
import { useRouter } from "@/i18n/navigation";
import { graph } from "@/lib/atlas";
import {
  configToParams, defaultConfig, LIMITS, parseConfig, scopeOptions, validateConfig, WORLD, type GameConfig, type MapAppearance,
} from "@/lib/config";
import { generateForConfigAsync, warmUpGenerator } from "@/lib/generate-client";
import { scopeFacts } from "@/lib/generate";
import { useProgress } from "@/stores/progress";
import { useSettings } from "@/stores/settings";

const DIFFICULTIES: ChallengeDifficulty[] = ["easy", "normal", "hard", "custom"];
const storageKey = (mode: GameMode) => `atlas-config-${mode}`;

/** Last settings used for this mode (stored as the same URL parameters as a game, then re-validated by parseConfig). */
function loadSaved(mode: GameMode): GameConfig {
  try {
    const raw = localStorage.getItem(storageKey(mode));
    if (raw) return parseConfig(new URLSearchParams(`mode=${mode}&${raw}`)).config;
  } catch {
    /* storage unavailable */
  }
  return defaultConfig(mode);
}

function Switch({ checked, onChange, label, help, testId }: { checked: boolean; onChange: (v: boolean) => void; label: string; help?: string; testId: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <span className="grid text-sm">
        {label}
        {help && <span className="text-xs muted">{help}</span>}
      </span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        data-testid={testId}
        className={`relative h-6 w-11 flex-none rounded-full transition-colors ${checked ? "bg-accent" : "bg-border"}`}
      >
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}

/**
 * Pre-game configuration for one game mode. Easy / Normal / Hard keep their existing behaviour; Custom reveals the
 * extra settings. The configuration is checked (and a challenge is generated) BEFORE leaving the modal, so an
 * impossible combination is explained here instead of failing in the game.
 */
export function GameConfigModal({ mode, onClose }: { mode: GameMode; onClose: () => void }) {
  const t = useTranslations();
  const locale = useLocale() as "fr" | "en";
  const router = useRouter();
  const regionName = useRegionName();
  const [cfg, setCfg] = useState<GameConfig>(() => defaultConfig(mode));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const dialog = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // the two connection options are one global preference (the last choice), whatever the mode
    useSettings.getState().init();
    const { straits, disputes } = useSettings.getState();
    setCfg({ ...loadSaved(mode), straits, disputes });
    setLoaded(true);
    warmUpGenerator(); // the worker loads while the player chooses, so the first generation is instant
  }, [mode]);
  useFocusTrap(dialog, true, onClose);

  const update = (patch: Partial<GameConfig>) => {
    setError(null);
    setCfg((c) => ({ ...c, ...patch }));
  };
  const updateMap = (patch: Partial<MapAppearance>) => update({ map: { ...cfg.map, ...patch } });

  const facts = useMemo(() => scopeFacts(cfg), [cfg.mode, cfg.scope, cfg.forbidden, cfg.straits, cfg.disputes]); // eslint-disable-line react-hooks/exhaustive-deps
  const issues = validateConfig(cfg, facts.diameter);
  const issueText = (code: string) =>
    code === "min" ? t("config.errors.min", { max: facts.diameter }) : t(`config.errors.${code}` as "config.errors.attempts");
  const options = scopeOptions(mode);
  const custom = cfg.difficulty === "custom";

  const addForbidden = (id: string) => {
    if (cfg.forbidden.includes(id) || cfg.forbidden.length >= LIMITS.maxForbidden) return;
    update({ forbidden: [...cfg.forbidden, id] });
  };

  const start = async () => {
    if (issues.length > 0 || busy) return;
    setBusy(true);
    setError(null);
    await new Promise((r) => setTimeout(r, 30)); // let the spinner paint before CPU work
    const seed = String(Date.now());
    const history = useProgress.getState().recents.map((r) => r.entry);
    // Same inputs as the game screen => the very same challenge: an impossible setup is reported here.
    const g = await generateForConfigAsync(cfg, seed, history);
    if (!g) {
      setBusy(false);
      setError(t("config.errors.noRoute"));
      return;
    }
    try {
      const { mode: _m, seed: _s, ...rest } = Object.fromEntries(configToParams(cfg, seed));
      void _m;
      void _s;
      localStorage.setItem(storageKey(mode), new URLSearchParams(rest).toString());
    } catch {
      /* storage unavailable */
    }
    useSettings.getState().update({ straits: cfg.straits, disputes: cfg.disputes }); // remembered for future games
    router.push(`/game?${configToParams(cfg, seed).toString()}` as "/game");
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 md:items-center md:p-6"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}
      data-testid="config-modal"
    >
      <div
        ref={dialog}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="cfg-title"
        className="card flex max-h-[92dvh] w-full flex-col overflow-hidden outline-none anim-pop max-md:rounded-b-none md:max-w-xl"
        data-mode={mode}
      >
        <header className="flex items-start justify-between gap-3 border-b border-border-soft px-5 py-4">
          <div>
            <h2 id="cfg-title" className="text-xl">{t("config.title", { mode: t(`modes.${mode}.name`) })}</h2>
            <p className="text-sm muted">{t(`modes.${mode}.desc`)}</p>
          </div>
          <button type="button" className="btn btn-ghost !min-h-9 !px-2" onClick={onClose} aria-label={t("common.close")}>
            <Icon name="x" />
          </button>
        </header>

        <div className="grid gap-6 overflow-y-auto px-5 py-5" style={{ visibility: loaded ? "visible" : "hidden" }}>
          {/* ------------------------------------------------ difficulty */}
          <section aria-labelledby="cfg-diff">
            <h3 id="cfg-diff" className="eyebrow mb-2">{t("config.difficulty")}</h3>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" role="radiogroup" aria-labelledby="cfg-diff">
              {DIFFICULTIES.map((d) => (
                <button
                  key={d}
                  type="button"
                  role="radio"
                  aria-checked={cfg.difficulty === d}
                  onClick={() => update({ difficulty: d })}
                  data-testid={`cfg-diff-${d}`}
                  className={`card grid content-start gap-0.5 p-3 text-left transition-colors ${cfg.difficulty === d ? "!border-accent bg-accent-soft" : "hover:border-border"} ${d === "custom" ? "border-dashed" : ""}`}
                >
                  <span className="text-sm font-semibold">{t(`difficulty.${d}.name`)}</span>
                  <span className="hidden text-[11px] leading-snug muted sm:block">{t(`difficulty.${d}.desc`)}</span>
                </button>
              ))}
            </div>
          </section>

          {/* ------------------------------------------------ custom only */}
          {custom && (
            <section className="grid gap-4 rounded-md border border-dashed border-border bg-surface-2 p-4" aria-labelledby="cfg-custom" data-testid="cfg-custom">
              <h3 id="cfg-custom" className="eyebrow">{t("config.custom")}</h3>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-1 text-sm">
                  {t("config.minRoute")}
                  <input
                    type="number" inputMode="numeric" min={LIMITS.minRoute} max={facts.diameter} step={1}
                    value={Number.isFinite(cfg.minIntermediate) ? cfg.minIntermediate : ""}
                    onChange={(e) => update({ minIntermediate: e.target.value === "" ? NaN : Math.floor(Number(e.target.value)) })}
                    className="min-h-10 rounded-md border border-border bg-surface px-3 outline-none focus:border-accent"
                    style={{ fontSize: 16 }}
                    data-testid="cfg-min"
                  />
                  <span className="text-xs muted">{t("config.minRouteHelp", { max: facts.diameter })}</span>
                </label>
                <label className="grid gap-1 text-sm">
                  {t("config.attempts")}
                  <input
                    type="number" inputMode="numeric" min={LIMITS.minAttempts} max={LIMITS.maxAttempts} step={1}
                    value={Number.isFinite(cfg.attempts) ? cfg.attempts : ""}
                    onChange={(e) => update({ attempts: e.target.value === "" ? NaN : Math.floor(Number(e.target.value)) })}
                    className="min-h-10 rounded-md border border-border bg-surface px-3 outline-none focus:border-accent"
                    style={{ fontSize: 16 }}
                    data-testid="cfg-attempts"
                  />
                  <span className="text-xs muted">{t("config.attemptsHelp", { min: LIMITS.minAttempts, max: LIMITS.maxAttempts })}</span>
                </label>
              </div>
              <div>
                <h4 className="eyebrow mb-1">{t("config.map")}</h4>
                <div className="divide-y divide-border-soft">
                  <Switch testId="cfg-map-full" checked={cfg.map.full} onChange={(v) => updateMap({ full: v })} label={t("config.mapFull")} help={t("config.mapFullHelp")} />
                  <Switch testId="cfg-map-start" checked={cfg.map.start} onChange={(v) => updateMap({ start: v })} label={t("config.mapStart")} />
                  <Switch testId="cfg-map-borders" checked={cfg.map.borders} onChange={(v) => updateMap({ borders: v })} label={t("config.mapBorders")} />
                  <Switch testId="cfg-map-names" checked={cfg.map.names} onChange={(v) => updateMap({ names: v })} label={t("config.mapNames")} />
                </div>
                {!cfg.map.full && !cfg.map.borders && !cfg.map.names && (
                  <p role="note" className="mt-2 rounded-md border border-dest/50 bg-dest-soft px-3 py-2 text-xs" data-testid="cfg-hidden-warning">{t("config.warnHidden")}</p>
                )}
              </div>
            </section>
          )}

          {/* ------------------------------------------------ scope */}
          <section>
            <label htmlFor="cfg-scope" className="eyebrow mb-2 block">{t("config.scope")}</label>
            <select
              id="cfg-scope"
              value={cfg.scope}
              onChange={(e) => update({ scope: e.target.value })}
              className="min-h-10 w-full rounded-md border border-border bg-surface px-3 outline-none focus:border-accent"
              style={{ fontSize: 16 }}
              data-testid="cfg-scope"
            >
              {options.world && <option value={WORLD}>{t("config.world")}</option>}
              <optgroup label={t("config.continents")}>
                {options.continents.map((id) => <option key={id} value={id}>{regionName(id)}</option>)}
              </optgroup>
              {options.subregions.length > 0 && (
                <optgroup label={t("config.subregions")}>
                  {options.subregions.map((id) => <option key={id} value={id}>{regionName(id)}</option>)}
                </optgroup>
              )}
            </select>
          </section>

          {/* ------------------------------------------------ special connections */}
          <section aria-labelledby="cfg-links" data-testid="cfg-links">
            <h3 id="cfg-links" className="eyebrow mb-1">{t("config.connections")}</h3>
            <div className="divide-y divide-border-soft">
              <Switch testId="cfg-straits" checked={cfg.straits} onChange={(v) => update({ straits: v })} label={t("config.straits")} help={t("config.straitsHelp")} />
              <Switch testId="cfg-disputes" checked={cfg.disputes} onChange={(v) => update({ disputes: v })} label={t("config.disputes")} help={t("config.disputesHelp")} />
            </div>
          </section>

          {/* ------------------------------------------------ countries to avoid */}
          <section aria-labelledby="cfg-forbid" data-testid="cfg-forbid">
            <h3 id="cfg-forbid" className="eyebrow mb-1">{t("config.forbid")}</h3>
            <p className="mb-2 text-xs muted">{t("config.forbidHelp")}</p>
            <CountryCombobox
              label={t("config.forbidLabel")}
              placeholder={t("config.forbidPlaceholder")}
              submitLabel={t("config.forbidAdd")}
              dropUp
              disabled={cfg.forbidden.length >= LIMITS.maxForbidden}
              onSubmit={addForbidden}
            />
            <ul className="mt-2 flex flex-wrap gap-1.5" data-testid="cfg-forbid-list" aria-label={t("config.forbid")}>
              {cfg.forbidden.length === 0 && <li className="text-sm muted">{t("config.forbidNone")}</li>}
              {cfg.forbidden.map((id) => (
                <li key={id} className="chip !bg-error-soft" data-testid={`cfg-forbid-${id}`}>
                  {graph.country(id).name[locale]}
                  <button type="button" className="-mr-1 grid h-5 w-5 place-items-center rounded-full hover:bg-black/10" aria-label={t("config.forbidRemove", { country: graph.country(id).name[locale] })} onClick={() => update({ forbidden: cfg.forbidden.filter((x) => x !== id) })}>
                    <Icon name="x" size={12} />
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <footer className="grid gap-2 border-t border-border-soft px-5 py-4" style={{ paddingBottom: "calc(1rem + var(--safe-bottom))" }}>
          {(issues.length > 0 || error) && (
            <ul className="grid gap-0.5 text-sm text-error" role="alert" data-testid="cfg-errors">
              {issues.map((i) => <li key={i.code}>{issueText(i.code)}</li>)}
              {error && <li>{error}</li>}
            </ul>
          )}
          <button type="button" className="btn btn-primary !min-h-12 text-base" disabled={issues.length > 0 || busy} onClick={start} data-testid="cfg-start">
            {busy ? t("config.checking") : t("config.start")}
          </button>
        </footer>
      </div>
    </div>
  );
}
