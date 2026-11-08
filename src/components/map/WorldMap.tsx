"use client";

import * as maplibregl from "maplibre-gl";
import type { ExpressionSpecification, GeoJSONSource, LngLatBoundsLike } from "maplibre-gl";
import { useCallback, useEffect, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { COUNTRIES, graph } from "@/lib/atlas";
import { MapControls } from "./MapControls";

/** Visual states a country can have (see docs/ARCHITECTURE.md). */
export type MapState = "start" | "destination" | "traversed" | "wrong" | "discovered" | "new" | "region" | "dim" | "hint" | "abandoned";
export type LabelMode = "none" | "route" | "all";

export interface WorldMapProps {
  states?: Record<string, MapState>;
  /** Ordered country ids drawn as a line between country centres. */
  route?: string[];
  /** Changing this key plays the subtle "route extended" animation. */
  routeKey?: string | number;
  start?: string;
  destination?: string;
  labelMode?: LabelMode;
  /** Countries labelled whatever the label mode (except "none"). */
  labelIds?: string[];
  fitIds?: string[];
  fitKey?: string | number;
  padding?: { top: number; bottom: number; left: number; right: number };
  selectedId?: string | null;
  /**
   * Visual-only masking: when true only countries present in `states` are drawn (shapes, borders, labels).
   * Toggling it animates the reveal. It never touches the GeoJSON source or the country graph.
   */
  masked?: boolean;
  /** Draw country borders (default true). Presentation only. */
  showBorders?: boolean;
  /** Moves the zoom controls below an overlaid top bar (mobile game screen). */
  controlsInset?: boolean;
  onCountryClick?: (id: string) => void;
  /** Tooltip text on hover; return null to hide it (e.g. to avoid giving answers away). */
  tooltip?: (id: string) => string | null;
  className?: string;
}

interface Palette {
  water: string; land: string; landOff: string; border: string; accent: string; dest: string; route: string;
  discovered: string; abandoned: string; error: string; success: string; text: string; surface: string; region: string; hint: string;
}

// MapLibre 6 needs an explicit worker URL under bundlers (file vendored by scripts/copy-maplibre-worker.mjs).
maplibregl.setWorkerUrl("/vendor/maplibre-gl-worker.mjs");

const SMALL_AREA = 12000;
const WORLD_BOUNDS: LngLatBoundsLike = [[-170, -56], [180, 82]];

function readPalette(): Palette {
  const css = getComputedStyle(document.documentElement);
  const v = (n: string) => css.getPropertyValue(n).trim();
  const land = v("--land");
  return {
    water: v("--water"), land, landOff: v("--land-off"), border: v("--map-border"), accent: v("--accent"), dest: v("--dest"),
    route: v("--route"), discovered: v("--discovered"), abandoned: mix(v("--discovered"), land, 0.5), error: mix(v("--error"), land, 0.55), success: v("--success"),
    text: v("--text"), surface: v("--surface"), region: v("--map-region"), hint: v("--hint"),
  };
}

function mix(a: string, b: string, t: number): string {
  const p = (h: string) => {
    const x = h.replace("#", "");
    const f = x.length === 3 ? x.split("").map((c) => c + c).join("") : x;
    return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16));
  };
  if (!a.startsWith("#") || !b.startsWith("#")) return a;
  const [ar, ag, ab] = p(a);
  const [br, bg, bb] = p(b);
  const h = (n: number) => Math.round(n).toString(16).padStart(2, "0");
  return `#${h(ar * t + br * (1 - t))}${h(ag * t + bg * (1 - t))}${h(ab * t + bb * (1 - t))}`;
}

function fillExpr(c: Palette): ExpressionSpecification {
  return [
    "case",
    ["!", ["get", "playable"]], c.landOff,
    [
      "match", ["coalesce", ["feature-state", "s"], "none"],
      "start", c.accent,
      "destination", c.dest,
      "traversed", c.discovered,
      "wrong", c.error,
      "discovered", c.discovered,
      "new", c.success,
      "region", c.region,
      "hint", c.hint,
      "abandoned", c.abandoned,
      "dim", c.landOff,
      c.land,
    ],
  ] as unknown as ExpressionSpecification;
}

function boundsOf(ids: readonly string[]): LngLatBoundsLike | null {
  let x0 = 180, y0 = 90, x1 = -180, y1 = -90, any = false;
  for (const id of ids) {
    if (!graph.has(id)) continue;
    const [a, b, c, d] = graph.country(id).bbox;
    x0 = Math.min(x0, a); y0 = Math.min(y0, b); x1 = Math.max(x1, c); y1 = Math.max(y1, d);
    any = true;
  }
  return any ? [[x0, y0], [x1, y1]] : null;
}

export default function WorldMap(props: WorldMapProps) {
  const {
    states, route, routeKey, start, destination, labelMode = "route", labelIds, fitIds, fitKey, padding, selectedId, masked = false, showBorders = true, controlsInset = false, onCountryClick, tooltip, className,
  } = props;
  const t = useTranslations("common");
  const locale = useLocale() as "fr" | "en";
  const wrapRef = useRef<HTMLDivElement>(null);
  const mapEl = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [painted, setPainted] = useState(false);
  const appliedStates = useRef<Record<string, MapState>>({});
  const selectedRef = useRef<string | null>(null);
  const hoverRef = useRef<string | null>(null);
  const maskedRef = useRef(masked);
  maskedRef.current = masked;
  const shownRef = useRef<Set<string>>(new Set());
  const levelRef = useRef(masked ? 0 : 1); // opacity of NON-shown countries: 0 = hidden, 1 = fully revealed
  const markers = useRef<{ start?: maplibregl.Marker; dest?: maplibregl.Marker; labels: Map<string, maplibregl.Marker> }>({ labels: new Map() });
  const cb = useRef({ onCountryClick, tooltip });
  cb.current = { onCountryClick, tooltip };
  const lastFitKey = useRef<string | number | undefined>(undefined);
  const paddingRef = useRef(padding);
  paddingRef.current = padding;

  /** Applies the opacity of non-shown countries (shown ones are always fully visible). */
  const applyMask = useCallback((level: number) => {
    const map = mapRef.current;
    if (!map || !map.getLayer("country-fill")) return;
    levelRef.current = level;
    const show = ["boolean", ["feature-state", "show"], false];
    const gate = (): ExpressionSpecification => ["case", show, 1, level] as unknown as ExpressionSpecification;
    map.setPaintProperty("country-fill", "fill-opacity", gate());
    map.setPaintProperty("country-borders", "line-opacity", gate());
    if (level >= 1 && !maskedRef.current) {
      map.setPaintProperty("country-dots", "circle-opacity", ["interpolate", ["linear"], ["zoom"], 5, 1, 7.5, 0]);
      map.setPaintProperty("country-dots", "circle-stroke-opacity", ["interpolate", ["linear"], ["zoom"], 5, 1, 7.5, 0]);
    } else {
      map.setPaintProperty("country-dots", "circle-opacity", gate());
      map.setPaintProperty("country-dots", "circle-stroke-opacity", gate());
    }
  }, []);

  // ---------------------------------------------------------------- init
  useEffect(() => {
    if (!mapEl.current) return;
    let map: maplibregl.Map;
    try {
      const pal = readPalette();
      map = new maplibregl.Map({
        container: mapEl.current,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "background", type: "background", paint: { "background-color": pal.water } }],
        },
        bounds: WORLD_BOUNDS,
        fitBoundsOptions: { padding: 10 },
        minZoom: 0.6,
        maxZoom: 9,
        renderWorldCopies: false,
        attributionControl: false,
        dragRotate: false,
        pitchWithRotate: false,
        touchPitch: false,
      });
      map.touchZoomRotate.disableRotation();
    } catch {
      setFailed(true);
      return;
    }
    mapRef.current = map;
    const m = markers.current;

    map.on("error", (e) => {
      if ((e as unknown as { error?: { message?: string } }).error?.message?.includes("world.geojson")) setFailed(true);
    });

    map.on("load", () => {
      const pal = readPalette();
      map.addSource("world", { type: "geojson", data: "/data/world.geojson", promoteId: "id" });
      map.addSource("dots", {
        type: "geojson",
        promoteId: "id",
        data: {
          type: "FeatureCollection",
          features: COUNTRIES.filter((c) => c.area < SMALL_AREA).map((c) => ({
            type: "Feature" as const, properties: { id: c.id, playable: true }, geometry: { type: "Point" as const, coordinates: c.center },
          })),
        },
      });
      map.addSource("route", { type: "geojson", data: { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: [] } } });
      map.addLayer({ id: "country-fill", type: "fill", source: "world", paint: { "fill-color": fillExpr(pal), "fill-antialias": true } });
      map.addLayer({
        id: "country-hover", type: "fill", source: "world",
        paint: { "fill-color": pal.text, "fill-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.14, 0] },
      });
      map.addLayer({
        id: "country-borders", type: "line", source: "world",
        paint: { "line-color": pal.border, "line-width": ["interpolate", ["linear"], ["zoom"], 1, 0.35, 5, 0.9, 8, 1.4] },
      });
      map.addLayer({
        id: "country-selected", type: "line", source: "world",
        paint: {
          "line-color": pal.text, "line-width": 2.2,
          "line-opacity": ["case", ["boolean", ["feature-state", "selected"], false], 0.9, 0],
        },
      });
      map.addLayer({ id: "route-glow", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": pal.route, "line-width": 10, "line-opacity": 0, "line-blur": 4 } });
      map.addLayer({ id: "route-line", type: "line", source: "route", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": pal.route, "line-width": 2.6, "line-opacity": 0.9, "line-dasharray": [1, 1.6] } });
      map.addLayer({
        id: "country-dots", type: "circle", source: "dots",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 2.6, 4, 4.8, 7, 7],
          "circle-color": fillExpr(pal),
          "circle-stroke-color": pal.border,
          "circle-stroke-width": 1,
          "circle-opacity": ["interpolate", ["linear"], ["zoom"], 5, 1, 7.5, 0],
          "circle-stroke-opacity": ["interpolate", ["linear"], ["zoom"], 5, 1, 7.5, 0],
        },
      });
      map.addLayer({
        id: "dots-hover", type: "circle", source: "dots",
        paint: {
          "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, 4.5, 4, 7, 7, 10],
          "circle-color": pal.text,
          "circle-opacity": ["case", ["boolean", ["feature-state", "hover"], false], 0.18, 0],
        },
      });
      applyMask(maskedRef.current ? 0 : 1);
      setReady(true);
      // Reports when country polygons have really been parsed and drawn (guards against silent worker failures).
      const check = () => {
        if (map.queryRenderedFeatures({ layers: ["country-fill"] }).length > 0) {
          setPainted(true);
          map.off("idle", check);
        }
      };
      map.on("idle", check);
    });

    // --- interaction
    const pick = (point: maplibregl.PointLike): string | null => {
      const feats = map.queryRenderedFeatures(point, { layers: ["country-dots", "country-fill"] });
      const f = feats.find((x) => (x.properties?.playable === true || x.properties?.playable === "true") && (!maskedRef.current || shownRef.current.has(String(x.properties?.id ?? x.id))));
      return f ? String(f.properties?.id ?? f.id) : null;
    };
    const setHover = (id: string | null) => {
      if (hoverRef.current === id) return;
      if (hoverRef.current) for (const src of ["world", "dots"]) map.setFeatureState({ source: src, id: hoverRef.current }, { hover: false });
      hoverRef.current = id;
      if (id) for (const src of ["world", "dots"]) map.setFeatureState({ source: src, id }, { hover: true });
    };
    map.on("mousemove", (e) => {
      if (!map.getLayer("country-fill")) return;
      const id = pick(e.point);
      setHover(id);
      map.getCanvas().style.cursor = id && cb.current.onCountryClick ? "pointer" : "";
      const tip = tipRef.current;
      if (!tip) return;
      const text = id && cb.current.tooltip ? cb.current.tooltip(id) : null;
      if (text) {
        tip.textContent = text;
        tip.style.display = "block";
        tip.style.left = `${e.point.x}px`;
        tip.style.top = `${e.point.y}px`;
      } else tip.style.display = "none";
    });
    map.on("mouseout", () => {
      setHover(null);
      if (tipRef.current) tipRef.current.style.display = "none";
    });
    map.on("click", (e) => {
      if (!map.getLayer("country-fill")) return;
      const id = pick(e.point);
      if (id) cb.current.onCountryClick?.(id);
    });

    // --- theme changes
    const obs = new MutationObserver(() => {
      if (!map.getLayer("country-fill")) return;
      const pal = readPalette();
      map.setPaintProperty("background", "background-color", pal.water);
      map.setPaintProperty("country-fill", "fill-color", fillExpr(pal));
      map.setPaintProperty("country-dots", "circle-color", fillExpr(pal));
      map.setPaintProperty("country-dots", "circle-stroke-color", pal.border);
      map.setPaintProperty("country-borders", "line-color", pal.border);
      map.setPaintProperty("country-selected", "line-color", pal.text);
      map.setPaintProperty("country-hover", "fill-color", pal.text);
      map.setPaintProperty("dots-hover", "circle-color", pal.text);
      map.setPaintProperty("route-line", "line-color", pal.route);
      map.setPaintProperty("route-glow", "line-color", pal.route);
    });
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });

    const ro = new ResizeObserver(() => map.resize());
    if (wrapRef.current) ro.observe(wrapRef.current);

    return () => {
      obs.disconnect();
      ro.disconnect();
      m.labels.forEach((x) => x.remove());
      m.labels.clear();
      m.start?.remove();
      m.dest?.remove();
      map.remove();
      mapRef.current = null;
      appliedStates.current = {};
      setReady(false);
    };
  }, [applyMask]); // applyMask is stable (useCallback with no deps): the map is created once

  // ---------------------------------------------------------------- feature states
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const next = states ?? {};
    const prev = appliedStates.current;
    for (const id of Object.keys(prev)) {
      if (next[id] !== prev[id]) for (const src of ["world", "dots"]) map.setFeatureState({ source: src, id }, { s: next[id] ?? null, show: next[id] !== undefined });
    }
    for (const [id, s] of Object.entries(next)) {
      if (prev[id] !== s) for (const src of ["world", "dots"]) map.setFeatureState({ source: src, id }, { s, show: true });
    }
    appliedStates.current = { ...next };
    shownRef.current = new Set(Object.keys(next));
    // Read back what the map really holds (not what was requested): a test hook, cheap (a few dozen entries at most).
    wrapRef.current?.setAttribute(
      "data-applied",
      Object.keys(next).sort().map((id) => `${id}:${String(map.getFeatureState({ source: "world", id }).s ?? "")}`).join(" "),
    );
  }, [states, ready]);

  // ---------------------------------------------------------------- border visibility (presentation only)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    map.setLayoutProperty("country-borders", "visibility", showBorders ? "visible" : "none");
  }, [showBorders, ready]);

  // ---------------------------------------------------------------- reveal / hide animation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const target = masked ? 0 : 1;
    const from = levelRef.current;
    if (from === target) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return applyMask(target);
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 1100);
      const eased = p * p * (3 - 2 * p);
      applyMask(from + (target - from) * eased);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [masked, ready, applyMask]);

  // ---------------------------------------------------------------- selection
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    if (selectedRef.current) map.setFeatureState({ source: "world", id: selectedRef.current }, { selected: false });
    selectedRef.current = selectedId ?? null;
    if (selectedId) map.setFeatureState({ source: "world", id: selectedId }, { selected: true });
  }, [selectedId, ready]);

  // ---------------------------------------------------------------- route line + animation
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const coords = (route ?? []).filter((id) => graph.has(id)).map((id) => graph.country(id).center);
    wrapRef.current?.setAttribute("data-route", (route ?? []).join(" "));
    (map.getSource("route") as GeoJSONSource | undefined)?.setData({
      type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords.length > 1 ? coords : [] },
    });
  }, [route, ready]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready || routeKey === undefined) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const t0 = performance.now();
    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / 900);
      if (!map.getLayer("route-glow")) return;
      map.setPaintProperty("route-glow", "line-opacity", 0.55 * (1 - p));
      map.setPaintProperty("route-glow", "line-width", 4 + 10 * p);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [routeKey, ready]);

  // ---------------------------------------------------------------- markers & labels
  const syncLabels = useCallback(() => {
    const map = mapRef.current;
    if (!map) return;
    const m = markers.current;
    const wanted = new Set<string>();
    if (labelMode !== "none") {
      for (const id of labelIds ?? []) wanted.add(id);
      if (labelMode === "all") {
        const z = map.getZoom();
        const min = z < 2.4 ? 1_500_000 : z < 3.4 ? 300_000 : z < 4.4 ? 60_000 : z < 5.4 ? 8_000 : 0;
        for (const c of COUNTRIES) if (c.area >= min) wanted.add(c.id);
      }
    }
    for (const [id, mk] of m.labels) if (!wanted.has(id)) { mk.remove(); m.labels.delete(id); }
    for (const id of wanted) {
      const c = graph.country(id);
      const existing = m.labels.get(id);
      if (existing) {
        existing.getElement().textContent = c.name[locale];
        continue;
      }
      const el = document.createElement("div");
      el.className = "atlas-label";
      el.textContent = c.name[locale];
      m.labels.set(id, new maplibregl.Marker({ element: el, anchor: "center" }).setLngLat(c.center).addTo(map));
    }
  }, [labelMode, labelIds, locale]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    syncLabels();
    map.on("zoomend", syncLabels);
    return () => {
      map.off("zoomend", syncLabels);
    };
  }, [ready, syncLabels]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !ready) return;
    const m = markers.current;
    m.start?.remove();
    m.dest?.remove();
    m.start = m.dest = undefined;
  }, [start, destination, ready]);

  // ---------------------------------------------------------------- camera
  const fit = useCallback((ids?: readonly string[], animate = true) => {
    const map = mapRef.current;
    if (!map) return;
    const b = (ids && ids.length ? boundsOf(ids) : null) ?? WORLD_BOUNDS;
    const pad = paddingRef.current ?? { top: 50, bottom: 50, left: 50, right: 50 };
    map.fitBounds(b, { padding: pad, maxZoom: ids && ids.length === 1 ? 4.6 : 5.2, duration: animate ? 800 : 0 });
  }, []);

  useEffect(() => {
    if (!ready) return;
    fit(fitIds, lastFitKey.current !== undefined);
    lastFitKey.current = fitKey ?? "init";
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fitKey, ready]);

  // ---------------------------------------------------------------- fullscreen
  const [isFs, setIsFs] = useState(false);
  useEffect(() => {
    const onChange = () => setIsFs(document.fullscreenElement === wrapRef.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  const toggleFs = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void wrapRef.current?.requestFullscreen?.().catch(() => undefined);
  };

  return (
    <div ref={wrapRef} className={`relative overflow-hidden atlas-map ${className ?? ""}`} data-testid="world-map" data-ready={ready} data-painted={painted} data-masked={masked} data-shown={masked ? Object.keys(states ?? {}).length : "all"}>
      <div ref={mapEl} style={{ position: "absolute", inset: 0 }} role="application" aria-label={t("mapLabel")} />
      <div ref={tipRef} className="atlas-tooltip" style={{ display: "none" }} />
      <MapControls
        onZoomIn={() => mapRef.current?.zoomIn({ duration: 250 })}
        onZoomOut={() => mapRef.current?.zoomOut({ duration: 250 })}
        onRecenter={() => fit(fitIds)}
        onFullscreen={toggleFs}
        isFullscreen={isFs}
        inset={controlsInset}
      />
      {!ready && !failed && (
        <div className="absolute inset-0 grid place-items-center text-sm muted" aria-live="polite">{t("mapLoading")}</div>
      )}
      {failed && <div className="absolute inset-0 grid place-items-center text-sm text-error" role="alert">{t("mapError")}</div>}
    </div>
  );
}
