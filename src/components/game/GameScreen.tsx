"use client";

import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapView, type MapLink, type MapState } from "@/components/map/MapView";
import { Flag } from "@/components/ui/Flag";
import { Icon } from "@/components/ui/Icon";
import { MobileMenu } from "@/components/ui/MobileMenu";
import { useMedia } from "@/components/ui/useMedia";
import { useCountryName } from "@/components/ui/useNames";
import type { Challenge, GameMode } from "@/engine/types";
import { useRouter } from "@/i18n/navigation";
import { graph } from "@/lib/atlas";
import { loadDailyChallenge } from "@/lib/daily";
import { HINT_PENALTY, hintLetter, hintLiveness } from "@/engine/hints";
import type { HintKind } from "@/engine/types";
import { startTouchesDestination } from "@/engine/rules";
import { configFromChallenge, effectiveMap, parseConfig, PRESET_MAP, replayParams, type GameConfig } from "@/lib/config";
import { generateForConfigAsync } from "@/lib/generate-client";
import { suggestAfterDaily } from "@/lib/replay";
import { playSound, unlockAudio } from "@/lib/sound";
import { gameIdOf, isVictoryTransition, type GameSnapshot } from "@/lib/victory";
import { computeVisibility } from "@/lib/visibility";
import { useGame } from "@/stores/game";
import { useProgress } from "@/stores/progress";
import { useSettings } from "@/stores/settings";
import { ConstraintList, constraintCount } from "./ConstraintList";
import { CountryCombobox } from "./CountryCombobox";
import { HintPanel } from "./HintPanel";
import { HowToPlay, TUTORIAL_KEY } from "./HowToPlay";
import { ResultsPanel, useRouteChoices } from "./ResultsPanel";
import { RouteList } from "./RouteList";
import { VictoryBurst } from "./VictoryBurst";

type Phase = "loading" | "ready" | "error";

function Attempts({ left, total }: { left: number; total: number }) {
  const t = useTranslations("game");
  return (
    <div className="flex items-center gap-2" role="status" aria-label={`${t("attempts")}: ${left}`} data-testid="attempts" data-left={left}>
      {total <= 12 ? (
        <span className="flex gap-1" aria-hidden="true">
          {Array.from({ length: total }, (_, i) => (
            <span key={i} className={`h-2.5 w-2.5 rounded-full border transition-colors ${i < left ? "border-accent bg-accent" : "border-border bg-transparent"}`} />
          ))}
        </span>
      ) : null}
      <span className="text-sm font-semibold tabular-nums">{left}<span className="muted">/{total}</span></span>
    </div>
  );
}

export function GameScreen() {
  const t = useTranslations();
  const locale = useLocale();
  const name = useCountryName();
  const router = useRouter();
  const params = useSearchParams();
  const isDesktop = useMedia("(min-width: 768px)");

  const { challenge, config, state, result, solution, fresh, newAchievements, feedback } = useGame();
  const { start, restore, resume, guess, hint, giveUp, clear } = useGame.getState();
  const labels = useSettings((s) => s.labels);
  const sound = useSettings((s) => s.sound);
  const progressLoaded = useProgress((s) => s.loaded);
  const dailyRecs = useProgress((s) => s.daily);

  const [phase, setPhase] = useState<Phase>("loading");
  const [fallback, setFallback] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [confirmGiveUp, setConfirmGiveUp] = useState(false);
  const [selected, setSelected] = useState(0);
  const [toast, setToast] = useState<{ text: string; kind: "ok" | "bad" | "info" } | null>(null);
  const [constraintsOpen, setConstraintsOpen] = useState<boolean | null>(null); // null: default (open only when there is more than the basic rule)
  const [errTick, setErrTick] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  // Victory effects: bound to ONE game. `fx.gameId` is compared with the game on screen at render time, so a stale trigger can
  // never show on another game (restart, new game, resume...).
  const [fx, setFx] = useState<{ gameId: string; n: number } | null>(null);
  const prevGame = useRef<GameSnapshot | null>(null);
  const celebrated = useRef(new Set<string>());
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const key = params.toString();
  const startedKey = useRef<string | null>(null);

  // ---------------------------------------------------------------- load / generate the challenge
  const load = useCallback(async () => {
    setPhase("loading");
    setSelected(0);
    await new Promise((r) => setTimeout(r, 30)); // let the loading state paint before CPU work
    // Reload / back navigation: continue the saved game of this URL exactly where it was left (unless that daily is already completed).
    const saved = await useGame.getState().findSaved(key);
    if (saved) {
      const completed = saved.challenge.date ? useProgress.getState().games.some((x) => x.challengeId === saved.challenge.id && x.daily) : false;
      if (!completed) {
        resume(saved);
        setFallback(false);
        setPhase("ready");
        return;
      }
    }
    const history = useProgress.getState().recents.map((r) => r.entry);
    const daily = params.get("daily");
    const mode = (params.get("mode") ?? "classic") as GameMode;
    let ch: Challenge | null = null;
    let cfg: GameConfig | undefined;
    if (daily && /^\d{4}-\d{2}-\d{2}$/.test(daily)) {
      const d = await loadDailyChallenge(daily, mode, history);
      ch = d?.challenge ?? null;
      setFallback(d?.fallback ?? false);
    } else {
      const parsed = parseConfig(params);
      cfg = parsed.config;
      const g = await generateForConfigAsync(parsed.config, parsed.seed, history, parsed.exclude);
      ch = g?.challenge ?? null;
      setFallback(false);
    }
    if (ch) {
      // An already completed daily is shown as completed (state + results): no new attempt.
      const done = ch.date ? useProgress.getState().games.find((x) => x.challengeId === ch!.id && x.daily) : undefined;
      if (done) restore(ch, done);
      else start(ch, cfg, key);
      setPhase("ready");
    } else setPhase("error");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    if (!progressLoaded || startedKey.current === key) return;
    startedKey.current = key;
    void load();
  }, [progressLoaded, key, load]);

  useEffect(() => () => clear(), [clear]);

  // First visit: show the short "how to play" walkthrough once (it stays reachable from the ? button).
  useEffect(() => {
    if (phase !== "ready") return;
    try {
      if (!localStorage.getItem(TUTORIAL_KEY)) setShowHelp(true);
    } catch {
      /* storage unavailable */
    }
  }, [phase]);

  // ---------------------------------------------------------------- toast, feedback (sounds)
  const flash = useCallback((text: string, kind: "ok" | "bad" | "info", ms = 6000) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast({ text, kind });
    toastTimer.current = setTimeout(() => setToast(null), ms);
  }, []);
  useEffect(() => () => { if (toastTimer.current) clearTimeout(toastTimer.current); }, []);

  useEffect(() => {
    if (!feedback) return;
    if (feedback.outcome === "rejected" || feedback.outcome === "lost") {
      playSound(feedback.outcome === "lost" ? "lose" : "bad", sound);
      setErrTick((n) => n + 1);
      flash(t("game.wrong"), "bad");
    } else if (feedback.outcome === "repeated") {
      // the same wrong country again: a slip, not a mistake. No sound, no shake, nothing counted.
      flash(t("game.repeated"), "info");
    } else if (feedback.outcome === "accepted") {
      playSound("ok", sound);
      flash(feedback.removed.length > 0 ? t("game.branch") : t("game.right"), "ok");
    }
    // a victory is handled below, from the game's own status transition
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [feedback?.n]);

  // Which game is on screen. Everything that belongs to one game (toast, victory effects, panel state) is reset when it changes.
  const gameId = gameIdOf(challenge?.id, state?.startedAt);
  useEffect(() => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(null);
    setConfirmGiveUp(false);
    setConstraintsOpen(null);
  }, [gameId]);

  // Victory effects (jingle + sparkles): ONLY on a genuine playing -> won transition of the same game, and once per game.
  const status = state?.status;
  useEffect(() => {
    const next: GameSnapshot | null = gameId && status ? { gameId, status } : null;
    const prev = prevGame.current;
    prevGame.current = next;
    if (next && isVictoryTransition(prev, next) && !celebrated.current.has(next.gameId)) {
      celebrated.current.add(next.gameId);
      playSound("win", sound);
      setFx({ gameId: next.gameId, n: celebrated.current.size });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameId, status]);
  const burst = fx && fx.gameId === gameId ? fx.n : null; // derived: another game on screen => no burst, whatever happened before

  useEffect(() => {
    if (result) setExpanded(true);
  }, [result]);

  // Browsers only allow audio after a gesture: create/resume the audio context on the first one (it makes no sound).
  useEffect(() => {
    const unlock = () => unlockAudio();
    window.addEventListener("pointerdown", unlock, { once: true, passive: true });
    window.addEventListener("keydown", unlock, { once: true, passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
    };
  }, []);

  // ---------------------------------------------------------------- derived data
  const finished = !!result;
  const choices = useRouteChoices(result, solution, challenge?.destination ?? null);
  const viewRoute = useMemo(
    () => (finished ? (choices[selected]?.route ?? state?.route ?? []) : (state?.route ?? [])),
    [finished, choices, selected, state?.route],
  );

  // The configuration this game was started with (restored dailies derive it from the challenge).
  const cfg = useMemo(() => (challenge ? (config ?? configFromChallenge(challenge)) : null), [challenge, config]);
  const appearance = useMemo(() => (cfg ? effectiveMap(cfg) : PRESET_MAP.easy), [cfg]);
  const showStart = appearance.start || finished;

  // Map visibility is a purely visual rule (see lib/visibility.ts); the engine and graph never see it.
  const vis = useMemo(
    () =>
      computeVisibility({
        appearance,
        finished,
        entered: state?.visited ?? [],
        start: challenge?.start ?? "",
        destination: challenge?.destination ?? "",
      }),
    [appearance, challenge?.start, challenge?.destination, finished, state?.visited],
  );

  // The three hints are shown ON THE MAP, at the suggested country, and never in the input. They all describe the SAME country: the one
  // of the latest hint used (createHint keeps the earlier choice while it is still a candidate), and only while it is still a move the
  // player can make from the CURRENT active route (after a change of direction an outdated hint disappears from the map).
  const hintView = useMemo(() => {
    if (!state || !challenge || finished || state.hints.length === 0) return null;
    const latest = state.hints[state.hints.length - 1];
    if (hintLiveness(graph, challenge, state.route, state.visited, latest) !== "live") return null;
    const used = new Set(state.hints.map((h) => h.payload.kind));
    return { id: latest.payload.countryId, letter: used.has("letter"), borders: used.has("borders"), reveal: used.has("reveal") };
  }, [state, challenge, finished]);
  // Hint 2: the outline of the country (plus a light tint). Hint 3: its whole area, stronger. Hint 1: a letter marker (below).
  const hintId = hintView && (hintView.borders || hintView.reveal) ? hintView.id : null;
  const hintState: MapState = hintView?.reveal ? "reveal" : "hint";
  const hintLetterMarker = useMemo(
    () => (hintView?.letter ? { id: hintView.id, letter: hintLetter(graph, hintView.id)[locale as "fr" | "en"] } : undefined),
    [hintView, locale],
  );
  const hintCountry = hintView?.id ?? null; // whatever hint was used, the camera keeps that country on screen
  // Using a hint: immediate, with a short confirmation (the cost is on the button beforehand).
  const activateHint = useCallback(
    (kind: HintKind) => {
      const ok = hint(kind);
      flash(ok ? t("game.hintUsedToast", { n: HINT_PENALTY[kind] }) : t("game.hintNone"), "info", 4500);
      return ok;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hint, flash],
  );

  // Who can replay what: after a daily, suggest the other dailies, then a new Classic game.
  const suggestion = useMemo(
    () => (challenge?.date ? suggestAfterDaily(challenge.date, dailyRecs.map((d) => d.challengeId), challenge.mode) : null),
    [challenge, dailyRecs],
  );

  const mapStates = useMemo(() => {
    if (!challenge) return {};
    const s: Record<string, MapState> = {};
    // countries of branches the player abandoned stay discovered, but are not part of the active route
    const abandoned = state && (!finished || selected === 0) ? state.visited.filter((id) => !state.route.includes(id)) : [];
    if (vis.masked) {
      for (const id of vis.shown) s[id] = "traversed";
      for (const id of abandoned) s[id] = "abandoned";
      if (appearance.start) s[challenge.start] = "start";
      s[challenge.destination] = "destination";
      if (hintId) s[hintId] = hintState;
      return s;
    }
    if (challenge.rules.allowedRegion) for (const id of graph.regionMembers(challenge.rules.allowedRegion)) s[id] = "region";
    if (state && (!finished || selected === 0)) for (const id of state.mistakes) if (graph.has(id)) s[id] = "wrong";
    for (const id of abandoned) if (!viewRoute.includes(id)) s[id] = "abandoned";
    for (const id of viewRoute) s[id] = "traversed";
    if (showStart) s[challenge.start] = "start";
    s[challenge.destination] = "destination";
    if (hintId) s[hintId] = hintState;
    return s;
  }, [challenge, state, viewRoute, finished, selected, vis, appearance.start, showStart, hintId, hintState]);

  const labelIds = useMemo(
    () =>
      !challenge
        ? []
        : vis.masked
          ? vis.shown
          : [...new Set([challenge.start, challenge.destination, ...viewRoute])].filter((id) => showStart || id !== challenge.start),
    [challenge, viewRoute, vis, showStart],
  );
  // Strait and disputed connections that are usable in THIS game (its rules, never the player's global preferences), drawn on the map.
  // On a hidden map only links between countries that are already shown appear, so they never give the geography away.
  const links = useMemo<MapLink[]>(() => {
    if (!challenge || (!challenge.rules.straits && !challenge.rules.disputes)) return [];
    const view = graph.viewFor(challenge.rules, [challenge.start, challenge.destination]);
    const visible = (id: string) => (!vis.masked || vis.shown.includes(id) || id === challenge.destination || (appearance.start && id === challenge.start)) && !view.blocked.has(id) && (!view.allowed || view.allowed.has(id));
    return graph
      .edges()
      .filter((e): e is typeof e & { type: "strait" | "dispute" } => (e.type === "strait" && challenge.rules.straits === true) || (e.type === "dispute" && challenge.rules.disputes === true))
      .filter((e) => !graph.connectionTypes(e.from, e.to).includes("land") && visible(e.from) && visible(e.to))
      .map((e) => ({ a: e.from, b: e.to, type: e.type }));
  }, [challenge, vis, appearance.start]);

  const fitIds = useMemo(() => {
    if (!challenge) return undefined;
    if (vis.masked) return hintCountry ? [...vis.shown, hintCountry] : vis.shown; // frame only what is displayed
    if (finished) return viewRoute;
    const framed = challenge.rules.allowedRegion ? [...graph.regionMembers(challenge.rules.allowedRegion)] : [challenge.start, challenge.destination];
    return hintCountry ? [...framed, hintCountry] : framed; // the country a hint points at must be on screen
  }, [challenge, finished, viewRoute, vis, hintCountry]);

  const known = useMemo(() => new Set(labelIds), [labelIds]);
  const showNames = appearance.names || finished;
  // Names on the map. During the game only the labelled countries have one (as before). Once the route is found, hovering ANY other
  // country also shows its name (in the current language) so the finished map can be explored. Countries of the displayed route are
  // not given this extra tooltip. Touch screens have no hover: nothing new is shown there.
  const tooltip = useCallback(
    (id: string) => {
      if (showNames && known.has(id)) return name(id);
      if (!finished || !challenge || viewRoute.includes(id) || id === challenge.start || id === challenge.destination) return null;
      if (typeof window !== "undefined" && !window.matchMedia("(hover: hover)").matches) return null;
      return name(id);
    },
    [known, name, showNames, finished, challenge, viewRoute],
  );
  const padding = isDesktop ? { top: 60, bottom: 60, left: 60, right: 60 } : { top: 84, bottom: expanded ? 360 : 190, left: 20, right: 20 };

  // ---------------------------------------------------------------- render
  if (phase === "loading" || !challenge || !state) {
    return (
      <div className="grid flex-1 place-items-center p-8 text-center" role="status">
        {phase === "error" ? (
          <div className="grid gap-3">
            <p>{t("play.failed")}</p>
            <div className="flex flex-wrap justify-center gap-2">
              <button type="button" className="btn btn-primary" onClick={() => { startedKey.current = null; void load(); }}>{t("common.retry")}</button>
              <button type="button" className="btn" onClick={() => router.push("/")}>{t("nav.home")}</button>
            </div>
          </div>
        ) : (
          <div className="grid justify-items-center gap-3">
            <span className="h-8 w-8 animate-spin rounded-full border-2 border-border border-t-accent" aria-hidden="true" />
            <p className="muted">{t("game.loadingChallenge")}</p>
          </div>
        )}
      </div>
    );
  }

  const startC = graph.country(challenge.start);
  const destC = graph.country(challenge.destination);
  const playing = state.status === "playing";
  // non-blocking notice: costs nothing, and the destination can never be reached without entering a country
  const startTouches = startTouchesDestination(graph, challenge);
  // the rules are collapsed unless the challenge has more than the basic connection rule (constraints and regional games need them)
  const showConstraints = constraintsOpen ?? constraintCount(challenge.rules) > 1;

  const modeBadge = (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="chip">{t(`modes.${challenge.mode}.name`)}</span>
      <span className="chip">{t(`difficulty.${challenge.difficulty}.name`)}</span>
      {challenge.date && <span className="chip">{t("game.daily")}</span>}
      <button type="button" className="btn btn-ghost ml-auto !min-h-8 !px-2" onClick={() => setShowHelp(true)} aria-label={t("game.help")} title={t("game.help")} data-testid="howto-open">
        <Icon name="help" size={16} />
      </button>
    </div>
  );

  const fromTo = (
    <div className="flex items-center gap-2 text-sm" data-testid="from-to">
      <span className="flex min-w-0 items-center gap-1.5 font-medium"><Flag country={startC} /><span className="truncate">{startC.name[locale as "fr" | "en"]}</span></span>
      <span className="muted" aria-hidden="true">→</span>
      <span className="flex min-w-0 items-center gap-1.5 font-medium"><Flag country={destC} /><span className="truncate">{destC.name[locale as "fr" | "en"]}</span></span>
    </div>
  );

  return (
    <div className="relative flex h-[100dvh] min-h-0 flex-col md:h-[calc(100dvh-var(--header-h))] md:flex-row" data-testid="game-screen">
      <p className="sr-only" aria-live="polite" data-testid="sr-route">
        {t("game.srRoute", { route: state.route.map(name).join(" → "), n: state.visited.length })}
      </p>
      {/* ------------------------------------------------------------ map */}
      <div className="relative min-h-0 flex-1">
        <MapView
          className="h-full w-full"
          states={mapStates}
          links={links}
          hintLetter={hintLetterMarker}
          masked={vis.masked}
          controlsInset
          route={viewRoute}
          routeKey={viewRoute.join(">")}
          start={showStart ? challenge.start : undefined}
          destination={challenge.destination}
          showBorders={appearance.borders || finished}
          labelMode={!showNames ? "none" : vis.masked ? "route" : labels === "all" ? "all" : labels === "none" ? "none" : "route"}
          labelIds={labelIds}
          fitIds={fitIds}
          fitKey={`${challenge.id}-${vis.masked ? `m${vis.shown.length}${hintCountry ?? ""}` : finished ? `r${selected}` : `play${hintCountry ?? ""}`}`}
          padding={padding}
          tooltip={tooltip}
        />

        <VictoryBurst runKey={burst} />

        {/* mobile top bar */}
        <div className="pointer-events-none absolute inset-x-0 top-0 z-10 p-2 md:hidden" style={{ paddingTop: "calc(var(--safe-top) + 8px)" }}>
          <div className="pointer-events-auto flex items-center justify-between gap-2 rounded-lg border border-border-soft bg-surface/95 px-2 py-1.5 shadow-sm backdrop-blur">
            <MobileMenu />
            <div className="min-w-0 flex-1">{fromTo}</div>
            <button type="button" className="btn btn-ghost !min-h-10 !min-w-10 !px-2" onClick={() => setShowHelp(true)} aria-label={t("game.help")} data-testid="howto-open-m">
              <Icon name="help" />
            </button>
            <Attempts left={state.attemptsLeft} total={state.attemptsTotal} />
          </div>
        </div>

        {vis.masked && (
          <p className="pointer-events-none absolute bottom-3 left-1/2 z-10 hidden -translate-x-1/2 rounded-full border border-border-soft bg-surface/90 px-3 py-1 text-xs muted md:block">{t("game.mapHidden")}</p>
        )}

        {/* legend (desktop) */}
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 hidden gap-3 rounded-md border border-border-soft bg-surface/90 px-3 py-1.5 text-xs md:flex" aria-label={t("game.mapLegend")}>
          {([["accent", "legendStart"], ["dest", "legendDestination"], ["discovered", "legendRoute"], ["error", "legendWrong"]] as const).map(([c, k]) => (
            <span key={k} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: `var(--${c})` }} />{t(`game.${k}`)}</span>
          ))}
          {links.some((l) => l.type === "strait") && (
            <span className="flex items-center gap-1.5" data-testid="legend-strait"><span className="h-0 w-4 border-t-2 border-dotted" style={{ borderColor: "var(--link-strait)" }} />{t("game.legendStrait")}</span>
          )}
          {links.some((l) => l.type === "dispute") && (
            <span className="flex items-center gap-1.5" data-testid="legend-dispute"><span className="h-0 w-4 border-t-2 border-dashed" style={{ borderColor: "var(--link-dispute)" }} />{t("game.legendDispute")}</span>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------------ side panel / bottom sheet */}
      <aside
        className={`z-20 flex flex-col border-border-soft bg-surface
          max-md:absolute max-md:inset-x-0 max-md:bottom-0 max-md:rounded-t-2xl max-md:border-t max-md:shadow-[0_-8px_30px_rgba(0,0,0,.18)]
          md:w-[clamp(320px,26vw,400px)] md:flex-none md:border-l`}
        style={{ maxHeight: isDesktop ? undefined : expanded ? "58dvh" : undefined, paddingBottom: isDesktop ? undefined : "var(--safe-bottom)" }}
        aria-label={t("game.route")}
      >
        {/* sheet handle (mobile) */}
        <button
          type="button"
          className="flex h-7 w-full items-center justify-center md:hidden"
          onClick={() => setExpanded((e) => !e)}
          aria-expanded={expanded}
          aria-label={expanded ? t("game.closePanel") : t("game.openPanel")}
        >
          <span className="h-1 w-10 rounded-full bg-border" />
        </button>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 md:pt-4">
          {/* desktop header */}
          <div className="hidden gap-3 md:grid">
            {modeBadge}
            <div className="grid gap-2 rounded-md border border-border-soft bg-surface-2 p-3">
              <div className="flex items-center justify-between"><span className="eyebrow">{t("game.from")}</span><span className="eyebrow">{t("game.to")}</span></div>
              {fromTo}
              <div className="mt-1 flex items-center justify-between border-t border-border-soft pt-2">
                <span className="eyebrow">{t("game.attempts")}</span>
                <Attempts left={state.attemptsLeft} total={state.attemptsTotal} />
              </div>
            </div>
            {fallback && <p className="text-xs muted">{t("home.dailyUnavailable")}</p>}
          </div>

          {!finished && (
            <div className="mt-3 grid gap-4 md:mt-4">
              {startTouches && state.route.length === 1 && (
                <p className="rounded-md border border-dest/50 bg-dest-soft px-3 py-2 text-sm anim-slide" role="status" data-testid="start-adjacent">
                  {t("game.startAdjacent")}
                </p>
              )}

              <section>
                <button
                  type="button"
                  className="flex min-h-9 w-full items-center justify-between gap-2 text-left"
                  aria-expanded={showConstraints}
                  aria-controls="constraints-body"
                  onClick={() => setConstraintsOpen(!showConstraints)}
                  data-testid="constraints-toggle"
                >
                  <span className="eyebrow">{t("game.constraints")} · {constraintCount(challenge.rules)}</span>
                  <span className={`muted transition-transform ${showConstraints ? "rotate-90" : ""}`} aria-hidden="true">›</span>
                </button>
                {showConstraints && (
                  <div id="constraints-body" className="mt-1.5" data-testid="constraints-body">
                    <ConstraintList rules={challenge.rules} />
                  </div>
                )}
              </section>
              
              {/* 1. the one thing to do: type a country */}
              <div className="grid gap-2">
                <CountryCombobox
                  key={gameId ?? "none"}
                  disabled={!playing}
                  errorTick={errTick}
                  autoFocus
                  onSubmit={(id) => guess(id)}
                />
                <p className={`min-h-5 text-sm ${toast?.kind === "bad" ? "text-error" : toast?.kind === "info" ? "text-text-2" : "text-success"}`} role="status" aria-live="polite" data-testid="toast">{toast?.text}</p>
                {fresh.length > 0 && (
                  <p className="chip w-fit anim-glow"><Icon name="star" size={13} />{t("game.newDiscovery")} · {name(fresh[fresh.length - 1])}</p>
                )}
              </div>

              {/* 2. progress: the route so far (always on desktop, in the expanded sheet on mobile) */}
              <section className={expanded ? "" : "max-md:hidden"} aria-label={t("game.route")}>
                <h3 className="eyebrow mb-1">{t("game.route")}</h3>
                {/* the list is never remounted (it keeps its scroll position); only this overlay restarts the "new direction" animation */}
                <div className="relative" data-testid="route-wrap" data-branched={feedback && feedback.removed.length > 0 ? "true" : "false"}>
                  {feedback && feedback.removed.length > 0 && <div key={feedback.n} className="anim-branch pointer-events-none absolute inset-0 z-10" aria-hidden="true" />}
                  <RouteList route={state.route} destination={challenge.destination} finished={false} />
                </div>
                {state.route.length === 1 && <p className="mt-1 text-sm muted">{t("game.routeEmpty")}</p>}
              </section>

          

              {/* 3. help, on one line with the costs; 4. secondary information, collapsed by default */}
              <div className={expanded ? "grid gap-4" : "hidden gap-4 md:grid"}>
                <HintPanel hints={state.hints} disabled={!playing} onUse={activateHint} />                
                <div>
                  {confirmGiveUp ? (
                    <div className="grid gap-2 rounded-md border border-error/40 bg-error-soft p-3 text-sm">
                      <p>{t("game.giveUpConfirm")}</p>
                      <div className="flex gap-2">
                        <button type="button" className="btn btn-danger" onClick={() => { giveUp(); setConfirmGiveUp(false); }}>{t("common.confirm")}</button>
                        <button type="button" className="btn" onClick={() => setConfirmGiveUp(false)}>{t("common.cancel")}</button>
                      </div>
                    </div>
                  ) : (
                    <button type="button" className="btn btn-ghost !px-2 text-sm text-text-2" onClick={() => setConfirmGiveUp(true)}>{t("game.giveUp")}</button>
                  )}
                </div>
              </div>
            </div>
          )}

          {finished && result && (
            <div className="mt-3 md:mt-4">
              <ResultsPanel
                challenge={challenge}
                result={result}
                solution={solution}
                hints={state.hints}
                fresh={fresh}
                achievements={newAchievements}
                choices={choices}
                selected={selected}
                onSelect={(_, i) => setSelected(i)}
                daily={!!challenge.date}
                suggestion={suggestion}
                onReplay={() => router.push(`/game?${replayParams(cfg ?? configFromChallenge(challenge), challenge).toString()}` as "/game")}
                onNextDaily={(mode) => router.push(`/game?daily=${challenge.date}&mode=${mode}` as "/game")}
                onNewClassic={() => router.push("/?mode=classic" as "/")}
              />
            </div>
          )}
        </div>
      </aside>
      {showHelp && <HowToPlay onClose={() => setShowHelp(false)} />}
    </div>
  );
}
