"use client";

import dynamic from "next/dynamic";
import type { WorldMapProps } from "./WorldMap";

/** MapLibre needs the browser: load it client-side only. */
const WorldMap = dynamic(() => import("./WorldMap"), {
  ssr: false,
  loading: () => <div className="absolute inset-0 atlas-map" aria-hidden="true" />,
});

export function MapView(props: WorldMapProps) {
  return <WorldMap {...props} />;
}

export type { MapState, WorldMapProps } from "./WorldMap";
